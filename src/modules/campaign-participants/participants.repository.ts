import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { ParticipantsListQuery } from './participants.types';

const participantSelect = {
  id: true,
  bookingNumber: true,
  status: true,
  totalAmountBdt: true,
  isGuest: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  campaign: {
    select: { id: true, title: true, slug: true },
  },
  session: {
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      venue: { select: { id: true, name: true } },
    },
  },
  owner: {
    select: {
      id: true,
      ownerName: true,
      mobile: true,
      email: true,
      address: true,
    },
  },
  payment: {
    select: {
      id: true,
      gateway: true,
      status: true,
      amount: true,
      merchantTxnId: true,
      epsTxnId: true,
      gatewayRef: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  petBookings: {
    select: {
      id: true,
      status: true,
      checkedInAt: true,
      vaccinatedAt: true,
      pet: {
        select: {
          id: true,
          name: true,
          petType: true,
          breed: true,
          approxAge: true,
          gender: true,
          weightKg: true,
        },
      },
      vaccinationRecords: {
        select: { id: true, vaccineName: true, administeredAt: true },
        take: 1,
        orderBy: { administeredAt: 'desc' },
      },
      certificates: {
        select: { id: true, certificateNumber: true, issuedAt: true },
        take: 1,
        orderBy: { issuedAt: 'desc' },
      },
    },
  },
} as const;

function buildWhereClause(campaignId: string, query: ParticipantsListQuery): Prisma.CampaignRegistrationWhereInput {
  const where: Prisma.CampaignRegistrationWhereInput = { campaignId };

  if (query.search) {
    where.OR = [
      { bookingNumber: { contains: query.search, mode: 'insensitive' } },
      { owner: { ownerName: { contains: query.search, mode: 'insensitive' } } },
      { owner: { mobile: { contains: query.search } } },
      { owner: { email: { contains: query.search, mode: 'insensitive' } } },
      { payment: { merchantTxnId: { contains: query.search } } },
      { payment: { epsTxnId: { contains: query.search } } },
    ];
  }

  if (query.paymentStatus) {
    where.payment = { status: query.paymentStatus as any };
  }

  if (query.registrationStatus) {
    where.status = query.registrationStatus as any;
  }

  if (query.sessionId) {
    where.sessionId = query.sessionId;
  }

  if (query.venueId) {
    where.session = { venueId: query.venueId };
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  return where;
}

export async function listParticipants(
  campaignId: string,
  query: ParticipantsListQuery,
) {
  const where = buildWhereClause(campaignId, query);
  const page = query.page || 1;
  const limit = Math.min(query.limit || 50, 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.campaignRegistration.findMany({
      where,
      select: participantSelect,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaignRegistration.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function listAllParticipants(
  campaignId: string,
  query: ParticipantsListQuery,
) {
  const where = buildWhereClause(campaignId, query);
  return prisma.campaignRegistration.findMany({
    where,
    select: participantSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function listParticipantsByBookingNumber(
  campaignId: string,
  bookingNumbers: string[],
) {
  return prisma.campaignRegistration.findMany({
    where: { campaignId, bookingNumber: { in: bookingNumbers } },
    select: participantSelect,
  });
}

export async function getCampaignPaymentSummary(campaignId: string) {
  const rows = await prisma.$queryRaw<Array<{
    status: string;
    count: bigint;
    total: string | null;
  }>>`
    SELECT p.status,
           COUNT(*)::int AS count,
           SUM(p.amount)::text AS total
    FROM payments p
    INNER JOIN campaign_registrations cr ON cr.payment_id = p.id
    WHERE cr.campaign_id = ${campaignId}::uuid
    GROUP BY p.status
  `;

  const summary: Record<string, { count: number; total: number }> = {};
  for (const r of rows) {
    summary[r.status] = {
      count: Number(r.count),
      total: r.total ? Number(r.total) : 0,
    };
  }
  return summary;
}

export async function getEarliestPaymentDate(campaignId: string): Promise<Date | null> {
  const row = await prisma.$queryRaw<Array<{ earliest: Date | null }>>`
    SELECT MIN(p.created_at) AS earliest
    FROM payments p
    INNER JOIN campaign_registrations cr ON cr.payment_id = p.id
    WHERE cr.campaign_id = ${campaignId}::uuid
  `;
  return row[0]?.earliest || null;
}

export async function createSmsLog(data: {
  to: string;
  body: string;
  messageType: string;
  module: string;
  entityType: string;
  entityId: string;
  reference: string;
  status: string;
  provider: string;
  idempotencyKey: string;
}) {
  return prisma.smsLog.create({ data: data as any });
}
