import { randomUUID } from 'crypto';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { generateCareCardQrToken, buildCareCardVerifyUrl } from '../../utils/qr';
import * as repo from './care-partner-cards.repository';
import { LEGAL_DISCLAIMER } from './care-partner-cards.types';
import type { RevokeCardDto, ReactivateCardDto, CardListQuery, VerifyCardQuery, VerificationLogListQuery } from './care-partner-cards.types';

// Called by payments.service.ts after a care_partner payment is confirmed.
export async function issueCarePartnerCardOnPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      careContributions: {
        include: {
          plan: true,
          zone: true,
        },
      },
    },
  });
  if (!payment) throw new Error(`Payment ${paymentId} not found`);

  const contribution = payment.careContributions[0];
  if (!contribution) throw new Error(`No care contribution linked to payment ${paymentId}`);

  // Idempotency: if card already issued, skip
  const existing = await repo.getCardByContributionId(contribution.id);
  if (existing) return;

  const cardNumber = await repo.generateCardNumber();
  const cardId = randomUUID();
  const qrToken = generateCareCardQrToken(cardId, contribution.id);
  const disclaimer = contribution.plan.legalDisclaimerText ?? LEGAL_DISCLAIMER;

  await prisma.$transaction(async (tx) => {
    // Mark contribution as paid
    await tx.careContribution.update({
      where: { id: contribution.id },
      data: { status: 'paid' },
    });

    // Increment zone counters atomically
    await tx.communityZone.update({
      where: { id: contribution.zoneId },
      data: {
        currentContributors: { increment: 1 },
        currentAmountBdt: { increment: contribution.amountBdt },
      },
    });

    // Issue the card
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);
    expiresAt.setFullYear(expiresAt.getFullYear() + 5);

    await tx.carePartnerCard.create({
      data: {
        id: cardId,
        cardNumber,
        contributionId: contribution.id,
        zoneId: contribution.zoneId,
        qrToken,
        status: 'active',
        issuedAt,
        expiresAt,
        legalDisclaimerSnapshot: disclaimer,
      },
    });
  });

  // Fire-and-forget SMS confirmation
  try {
    const { sendTransactionalSms } = await import('../../services/sms.service');
    void sendTransactionalSms({
      to: contribution.contributorMobile,
      message: `BPA: Your Care Partner Card (${cardNumber}) for ${contribution.zone.name} zone has been issued. Thank you for your contribution! Verify at: ${buildCareCardVerifyUrl(qrToken)}`,
      messageType: 'care_partner_card_issued',
      module: 'care_partner',
      entityType: 'CareContribution',
      entityId: contribution.id,
      reference: contribution.contributionNumber,
      idempotencyKey: `care_partner:card_issued:${contribution.id}`,
    });
  } catch {
    // SMS failure must not interrupt card issuance
  }
}

export async function listCards(query: CardListQuery) {
  return repo.listCards(query);
}

export async function getCard(id: string) {
  const card = await repo.getCardById(id);
  if (!card) throw AppError.notFound('Care partner card');
  return card;
}

export async function revokeCard(id: string, dto: RevokeCardDto) {
  const card = await getCard(id);
  if (card.status === 'revoked') throw AppError.badRequest('Card is already revoked');
  return repo.revokeCard(id, dto.revocationReason);
}

export async function reactivateCard(id: string, dto: ReactivateCardDto) {
  const card = await getCard(id);
  if (card.status !== 'revoked') throw AppError.badRequest('Only revoked cards can be reactivated');
  void dto; // reason is for audit log in controller
  return repo.reactivateCard(id);
}

export async function listVerificationLogs(query: VerificationLogListQuery) {
  return repo.listVerificationLogs(query);
}

export async function getVerificationLog(id: string) {
  const log = await repo.getVerificationLogById(id);
  if (!log) throw AppError.notFound('Verification log');
  return log;
}

export async function verifyCard(query: VerifyCardQuery, ipAddress?: string, userAgent?: string) {
  const card = await repo.getCardByQrToken(query.token);

  if (!card) {
    repo.logInvalidVerification({ token: query.token, scanResult: 'not_found', ipAddress, userAgent });
    return {
      valid: false,
      cardNumber: null,
      status: 'not_found' as const,
      zoneName: null,
      contributorName: null,
      planTitle: null,
      issuedAt: null,
      expiresAt: null,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  const now = new Date();
  const isExpired = card.expiresAt ? card.expiresAt < now : false;
  const valid = card.status === 'active' && !isExpired;
  const scanResult = isExpired ? 'expired' : card.status;

  // Log the verification
  repo.logVerification({ cardId: card.id, qrToken: query.token, scanResult, ipAddress, userAgent });

  const contributorName = card.contribution.isAnonymous ? null : card.contribution.contributorName;

  return {
    valid,
    cardNumber: card.cardNumber,
    status: isExpired ? 'expired' : card.status,
    zoneName: card.zone.name,
    contributorName,
    planTitle: card.contribution.plan.title,
    issuedAt: card.issuedAt,
    expiresAt: card.expiresAt,
    disclaimer: card.legalDisclaimerSnapshot ?? LEGAL_DISCLAIMER,
  };
}
