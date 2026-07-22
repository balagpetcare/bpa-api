import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { initializeEpsPayment, isEPSConfigured, generateMerchantTxnId } from '../../services/eps.service';
import * as repo from './care-contributions.repository';
import type { InitiateContributionDto, UpdateContributionDto, ContributionListQuery } from './care-contributions.types';

export async function initiateContribution(dto: InitiateContributionDto) {
  // Validate plan
  const plan = await prisma.contributionPlan.findUnique({ where: { id: dto.planId } });
  if (!plan) throw AppError.notFound('Contribution plan');
  if (!plan.isActive) throw AppError.badRequest('This contribution plan is not currently active');

  // Validate zone
  const zone = await prisma.communityZone.findUnique({ where: { id: dto.zoneId } });
  if (!zone) throw AppError.notFound('Community zone');
  if (!zone.isActive || zone.status !== 'active') throw AppError.badRequest('This zone is not currently active');

  if (!isEPSConfigured()) {
    throw AppError.badRequest('Payment gateway not configured');
  }

  const contributionNumber = await repo.generateContributionNumber();
  const amountBdt = Number(plan.amountBdt);

  // Create contribution + payment in a single transaction
  const merchantTxnId = generateMerchantTxnId();

  const [contribution, payment] = await prisma.$transaction(async (tx) => {
    const c = await tx.careContribution.create({
      data: {
        contributionNumber,
        planId: dto.planId,
        zoneId: dto.zoneId,
        contributorName: dto.contributorName,
        contributorMobile: dto.contributorMobile,
        contributorEmail: dto.contributorEmail,
        contributorAddress: dto.contributorAddress,
        divisionId: dto.divisionId,
        districtId: dto.districtId,
        upazilaId: dto.upazilaId,
        unionId: dto.unionId,
        cityCorporationId: dto.cityCorporationId,
        cityZoneId: dto.cityZoneId,
        wardId: dto.wardId,
        amountBdt,
        isAnonymous: dto.isAnonymous,
      },
    });
    const p = await tx.payment.create({
      data: {
        gateway: 'eps',
        merchantTxnId,
        amount: amountBdt,
        currency: 'BDT',
        purpose: 'CARE_PARTNER_CONTRIBUTION',
        entityType: 'care_partner',
        entityId: c.id,
      },
    });
    await tx.careContribution.update({
      where: { id: c.id },
      data: { paymentId: p.id },
    });
    return [c, p];
  });

  const epsResult = await initializeEpsPayment({
    customerOrderId: payment.id,
    merchantTransactionId: merchantTxnId,
    totalAmount: amountBdt,
    customerName:     dto.contributorName,
    customerPhone:    dto.contributorMobile,
    customerEmail:    dto.contributorEmail ?? '',
    customerAddress:  dto.contributorAddress ?? 'Bangladesh',
    customerCity:     zone.city,
    customerState:    zone.division,
    customerPostcode: '1000',
    productName:      `BPA Care Partner Contribution — ${zone.name}`,
    valueA: payment.id,
    valueB: 'care_partner',
  });

  return {
    contributionId: contribution.id,
    contributionNumber: contribution.contributionNumber,
    paymentUrl: epsResult.RedirectURL,
  };
}

export async function getContributionStatusByNumber(contributionNumber: string) {
  const contribution = await repo.getContributionByNumber(contributionNumber);
  if (!contribution) throw AppError.notFound('Contribution');
  return {
    id: contribution.id,
    contributionNumber: contribution.contributionNumber,
    status: contribution.status,
    zone: contribution.zone,
    carePartnerCard: (contribution.carePartnerCard as { cardNumber: string; status: string } | null) ?? null,
  };
}

export async function getContributionStatus(id: string) {
  const contribution = await repo.getContributionById(id);
  if (!contribution) throw AppError.notFound('Contribution');
  return {
    id: contribution.id,
    contributionNumber: contribution.contributionNumber,
    status: contribution.status,
    zone: contribution.zone,
    carePartnerCard: (contribution.carePartnerCard as { cardNumber: string; status: string } | null) ?? null,
  };
}

export async function listContributions(query: ContributionListQuery) {
  return repo.listContributions(query);
}

export async function getContribution(id: string) {
  const c = await repo.getContributionById(id);
  if (!c) throw AppError.notFound('Contribution');
  return c;
}

export async function updateContribution(id: string, dto: UpdateContributionDto) {
  await getContribution(id);
  return repo.updateContribution(id, dto);
}
