import { PaymentGateway, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';

const registrationPaymentInclude = {
  owner: { select: { ownerName: true, mobile: true, email: true } },
  campaign: { select: { title: true, basePriceBdt: true } },
  session: {
    select: {
      sessionDate: true, startTime: true, endTime: true,
      venue: { select: { name: true, address: true } },
    },
  },
  payment: {
    select: {
      id: true, status: true, merchantTxnId: true, amount: true,
      epsTxnId: true, gateway: true, payload: true, createdAt: true,
    },
  },
  petBookings: { select: { id: true } },
} satisfies Prisma.CampaignRegistrationInclude;

export type RegistrationWithPayment = Prisma.CampaignRegistrationGetPayload<{
  include: typeof registrationPaymentInclude;
}>;

export async function createPayment(data: {
  gateway: PaymentGateway;
  merchantTxnId: string;
  amount: number;
  currency?: string;
  purpose: string;
  payload?: Record<string, unknown>;
}) {
  return prisma.payment.create({
    data: {
      gateway: data.gateway,
      merchantTxnId: data.merchantTxnId,
      amount: data.amount,
      currency: data.currency ?? 'BDT',
      purpose: data.purpose,
      status: 'pending',
      payload: (data.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function findPaymentByMerchantTxnId(merchantTxnId: string) {
  return prisma.payment.findUnique({ where: { merchantTxnId } });
}

export async function findPaymentById(id: string) {
  return prisma.payment.findUnique({ where: { id } });
}

export async function updatePaymentEpsTxnId(id: string, epsTxnId: string) {
  return prisma.payment.update({ where: { id }, data: { epsTxnId, gatewayRef: epsTxnId } });
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  extraPayload?: Record<string, unknown>,
) {
  return prisma.payment.update({
    where: { id },
    data: {
      status,
      ...(extraPayload ? { payload: extraPayload as Prisma.InputJsonValue } : {}),
    },
  });
}

// ─── Public lookup: by booking reference ─────────────────────────

export async function findRegistrationByBookingRef(bookingRef: string): Promise<RegistrationWithPayment | null> {
  return prisma.campaignRegistration.findUnique({
    where: { bookingNumber: bookingRef },
    include: registrationPaymentInclude,
  });
}

// ─── Public lookup: by paymentRef (merchantTxnId or payment UUID) ─

export async function findRegistrationByPaymentRef(paymentRef: string): Promise<RegistrationWithPayment | null> {
  // Try merchantTxnId first (17-digit), then payment UUID
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { merchantTxnId: paymentRef },
        { id: paymentRef.match(/^[0-9a-f-]{36}$/i) ? paymentRef : undefined },
      ],
    },
    select: { id: true },
  });
  if (!payment) return null;

  return prisma.campaignRegistration.findFirst({
    where: { paymentId: payment.id },
    include: registrationPaymentInclude,
  });
}

// ─── Admin: paginated payment list ───────────────────────────────

export async function listPayments(params: {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  search?: string;
}) {
  const { page, limit, skip } = parsePaginationQuery(params.page, params.limit);
  const where: Prisma.PaymentWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { merchantTxnId: { contains: params.search, mode: 'insensitive' } },
      { epsTxnId: { contains: params.search, mode: 'insensitive' } },
      { gatewayRef: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.payment.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

// ─── Admin: cross-field search ───────────────────────────────────
// Matches: bookingNumber, merchantTxnId, owner mobile, payment UUID

export async function searchPayments(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return [];

  // Look for campaign registrations matching booking ref or owner phone
  const regs = await prisma.campaignRegistration.findMany({
    where: {
      OR: [
        { bookingNumber: { contains: trimmed, mode: 'insensitive' } },
        { owner: { mobile: { contains: trimmed } } },
      ],
    },
    include: {
      ...registrationPaymentInclude,
      owner: { select: { ownerName: true, mobile: true, email: true } },
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  // Also look for payments matching txnId / payment UUID directly
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { merchantTxnId: { contains: trimmed, mode: 'insensitive' } },
        { epsTxnId: { contains: trimmed, mode: 'insensitive' } },
        ...(trimmed.match(/^[0-9a-f-]{36}$/i) ? [{ id: trimmed }] : []),
      ],
    },
    include: {
      campaignRegistrations: {
        include: {
          ...registrationPaymentInclude,
          owner: { select: { ownerName: true, mobile: true, email: true } },
        },
      },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  // Merge: start with registrations, then add any payment-matched regs not already included
  const seen = new Set(regs.map((r) => r.id));
  for (const p of payments) {
    for (const r of p.campaignRegistrations) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        // Attach payment data to the registration shape
        regs.push({ ...r, payment: p } as never);
      }
    }
  }

  return regs;
}
