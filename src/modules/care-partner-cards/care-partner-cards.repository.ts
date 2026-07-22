import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CardListQuery } from './care-partner-cards.types';

const cardInclude = {
  contribution: {
    select: {
      id: true, contributionNumber: true, contributorName: true,
      contributorMobile: true, contributorEmail: true, amountBdt: true,
      plan: { select: { id: true, title: true, legalDisclaimerText: true } },
    },
  },
  zone: { select: { id: true, name: true, slug: true } },
} as const;

export async function generateCardNumber(): Promise<string> {
  const year = new Date().getFullYear().toString();
  const prefix = `CPC-${year}-`;
  const last = await prisma.carePartnerCard.findFirst({
    where: { cardNumber: { startsWith: prefix } },
    orderBy: { cardNumber: 'desc' },
  });
  const seq = last ? parseInt(last.cardNumber.slice(-6), 10) + 1 : 1;
  return `${prefix}${seq.toString().padStart(6, '0')}`;
}

export async function createCard(data: {
  id: string;
  cardNumber: string;
  contributionId: string;
  zoneId: string;
  qrToken: string;
  legalDisclaimerSnapshot: string;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 5);

  return prisma.carePartnerCard.create({
    data: {
      id: data.id,
      cardNumber: data.cardNumber,
      contributionId: data.contributionId,
      zoneId: data.zoneId,
      qrToken: data.qrToken,
      status: 'active',
      issuedAt,
      expiresAt,
      legalDisclaimerSnapshot: data.legalDisclaimerSnapshot,
    },
    include: cardInclude,
  });
}

export async function getCardByContributionId(contributionId: string) {
  return prisma.carePartnerCard.findUnique({ where: { contributionId }, include: cardInclude });
}

export async function getCardByQrToken(qrToken: string) {
  return prisma.carePartnerCard.findUnique({
    where: { qrToken },
    include: {
      zone: { select: { id: true, name: true } },
      contribution: {
        select: {
          contributorName: true,
          isAnonymous: true,
          plan: { select: { title: true } },
        },
      },
    },
  });
}

export async function listCards(query: CardListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CarePartnerCardWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.zoneId) where.zoneId = query.zoneId;
  if (query.search) {
    where.OR = [
      { cardNumber: { contains: query.search, mode: 'insensitive' } },
      { contribution: { contributorName: { contains: query.search, mode: 'insensitive' } } },
      { contribution: { contributorMobile: { contains: query.search } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.carePartnerCard.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: cardInclude }),
    prisma.carePartnerCard.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getCardById(id: string) {
  return prisma.carePartnerCard.findUnique({ where: { id }, include: cardInclude });
}

export async function revokeCard(id: string, reason: string) {
  return prisma.carePartnerCard.update({
    where: { id },
    data: { status: 'revoked', revokedAt: new Date(), revocationReason: reason },
    include: cardInclude,
  });
}

export async function reactivateCard(id: string) {
  return prisma.carePartnerCard.update({
    where: { id },
    data: { status: 'active', revokedAt: null, revocationReason: null },
    include: cardInclude,
  });
}

export async function listVerificationLogs(query: import('./care-partner-cards.types').VerificationLogListQuery) {
  const { parsePaginationQuery, buildPaginationMeta } = await import('../../utils/response');
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: import('@prisma/client').Prisma.CardVerificationLogWhereInput = {};
  if (query.cardId) where.cardId = query.cardId;
  if (query.scanResult) where.scanResult = query.scanResult;
  const [items, total] = await Promise.all([
    prisma.cardVerificationLog.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: { card: { select: { id: true, cardNumber: true } } },
    }),
    prisma.cardVerificationLog.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getVerificationLogById(id: string) {
  return prisma.cardVerificationLog.findUnique({
    where: { id },
    include: { card: { select: { id: true, cardNumber: true, status: true } } },
  });
}

export async function logVerification(data: {
  cardId: string;
  qrToken: string;
  scanResult: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await prisma.cardVerificationLog.create({
    data: {
      cardId: data.cardId,
      qrToken: data.qrToken,
      scanResult: data.scanResult,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    },
  });
}

export async function logInvalidVerification(data: {
  token: string;
  scanResult: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  // Log against a known invalid token — we can't link to a card, so we create
  // a sentinel log by finding any card to use as FK placeholder.
  // Per design, CardVerificationLog.cardId is non-nullable, so we skip DB log
  // for completely unknown tokens and rely on application-level monitoring.
  // This function exists as a documented no-op hook for future alerting.
  void data;
}
