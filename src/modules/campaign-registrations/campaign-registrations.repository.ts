import { randomBytes } from 'crypto';
import { Prisma, CampaignRegistrationStatus, WaitlistStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { RegistrationListQuery, WaitlistListQuery } from './campaign-registrations.types';

export function generateStaffQrToken(): string {
  return randomBytes(32).toString('hex'); // 64-char hex, unguessable
}

const registrationSelect = {
  id: true,
  bookingNumber: true,
  campaignId: true,
  sessionId: true,
  ownerId: true,
  totalAmountBdt: true,
  status: true,
  isGuest: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  staffQrToken: true,
  staffQrIssuedAt: true,
  campaign: { select: { id: true, title: true, basePriceBdt: true } },
  session: { select: { id: true, sessionDate: true, startTime: true, endTime: true, venue: { select: { name: true } } } },
  owner: { select: { id: true, ownerName: true, mobile: true, email: true } },
  payment: { select: { id: true, status: true, merchantTxnId: true, amount: true } },
  petBookings: {
    include: {
      pet: { select: { id: true, name: true, petType: true, breed: true } },
      services: { include: { campaignService: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.CampaignRegistrationSelect;

// ─── Booking number ──────────────────────────────────────────────

export async function generateBookingNumber(): Promise<string> {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.campaignRegistration.count({
    where: { bookingNumber: { startsWith: `BPA-BK-${yyyymmdd}` } },
  });
  const seq = String(count + 1).padStart(5, '0');
  return `BPA-BK-${yyyymmdd}-${seq}`;
}

// ─── Atomic capacity reservation ────────────────────────────────

export async function reserveSlots(sessionId: string, petCount: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE campaign_sessions
    SET booked_count = booked_count + ${petCount}
    WHERE id = ${sessionId}::uuid
      AND booked_count + ${petCount} <= capacity
      AND is_active = true
  `;
  return result === 1;
}

export async function releaseSlots(sessionId: string, petCount: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE campaign_sessions
    SET booked_count = GREATEST(0, booked_count - ${petCount})
    WHERE id = ${sessionId}::uuid
  `;
}

// ─── Registrations ───────────────────────────────────────────────

export async function createRegistration(data: {
  bookingNumber: string;
  campaignId: string;
  sessionId: string;
  ownerId: string;
  totalAmountBdt: number;
  isGuest: boolean;
  notes?: string;
  petIds: string[];
  campaignServiceIds: string[];
}) {
  return prisma.campaignRegistration.create({
    data: {
      bookingNumber: data.bookingNumber,
      campaignId: data.campaignId,
      sessionId: data.sessionId,
      ownerId: data.ownerId,
      totalAmountBdt: data.totalAmountBdt,
      isGuest: data.isGuest,
      notes: data.notes,
      staffQrToken: generateStaffQrToken(),
      staffQrIssuedAt: new Date(),
      petBookings: {
        create: data.petIds.map(petId => ({
          petId,
          sessionId: data.sessionId,
          services: {
            create: data.campaignServiceIds.map(campaignServiceId => ({ campaignServiceId })),
          },
        })),
      },
    },
    select: registrationSelect,
  });
}

export async function ensureStaffQrToken(registrationId: string): Promise<string> {
  const reg = await prisma.campaignRegistration.findUniqueOrThrow({ where: { id: registrationId }, select: { id: true, staffQrToken: true } });
  if (reg.staffQrToken) return reg.staffQrToken;
  const token = generateStaffQrToken();
  await prisma.campaignRegistration.update({
    where: { id: registrationId },
    data: { staffQrToken: token, staffQrIssuedAt: new Date() },
  });
  return token;
}

export async function getRegistrationByStaffQrToken(token: string) {
  return prisma.campaignRegistration.findUnique({
    where: { staffQrToken: token },
    include: {
      campaign: { select: { id: true, title: true, basePriceBdt: true } },
      session: { select: { id: true, sessionDate: true, startTime: true, endTime: true, venue: { select: { name: true, address: true } } } },
      owner: { select: { id: true, ownerName: true, mobile: true, email: true } },
      payment: { select: { id: true, status: true, merchantTxnId: true, amount: true } },
      petBookings: {
        include: {
          pet: { select: { id: true, name: true, petType: true, breed: true } },
          services: { include: { campaignService: { select: { id: true, name: true, isRequired: true } } } },
          certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true } },
        },
      },
    },
  });
}

export async function linkPayment(registrationId: string, paymentId: string) {
  return prisma.campaignRegistration.update({
    where: { id: registrationId },
    data: { paymentId },
  });
}

export async function settleRegistration(registrationId: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.campaignRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { petBookings: true },
    });

    if (reg.status !== CampaignRegistrationStatus.pending_payment) {
      return reg;
    }

    await tx.campaignRegistration.update({
      where: { id: registrationId },
      data: { status: CampaignRegistrationStatus.paid },
    });

    await tx.petBooking.updateMany({
      where: { registrationId },
      data: { status: CampaignRegistrationStatus.paid },
    });

    // Upsert analytics
    await tx.campaignAnalytics.upsert({
      where: { campaignId: reg.campaignId },
      update: {
        totalRegistrations: { increment: 1 },
        totalPaid: { increment: 1 },
        totalPets: { increment: reg.petBookings.length },
        totalRevenueBdt: { increment: reg.totalAmountBdt },
      },
      create: {
        campaignId: reg.campaignId,
        totalRegistrations: 1,
        totalPaid: 1,
        totalPets: reg.petBookings.length,
        totalRevenueBdt: reg.totalAmountBdt,
      },
    });

    return reg;
  });
}

export async function cancelRegistration(registrationId: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.campaignRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { petBookings: true },
    });

    if (
      reg.status === CampaignRegistrationStatus.cancelled ||
      reg.status === CampaignRegistrationStatus.completed
    ) {
      return reg;
    }

    await tx.campaignRegistration.update({
      where: { id: registrationId },
      data: { status: CampaignRegistrationStatus.cancelled },
    });

    await tx.petBooking.updateMany({
      where: { registrationId },
      data: { status: CampaignRegistrationStatus.cancelled },
    });

    // Release slots
    await tx.$executeRaw`
      UPDATE campaign_sessions
      SET booked_count = GREATEST(0, booked_count - ${reg.petBookings.length})
      WHERE id = ${reg.sessionId}::uuid
    `;

    return reg;
  });
}

export async function getRegistrationById(id: string) {
  return prisma.campaignRegistration.findUnique({
    where: { id },
    select: registrationSelect,
  });
}

export async function getRegistrationByBookingNumber(bookingNumber: string) {
  return prisma.campaignRegistration.findUnique({
    where: { bookingNumber },
    select: registrationSelect,
  });
}

export async function getRegistrationByPaymentId(paymentId: string) {
  return prisma.campaignRegistration.findUnique({ where: { paymentId } });
}

export async function listRegistrations(query: RegistrationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CampaignRegistrationWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.sessionId) where.sessionId = query.sessionId;
  if (query.status) where.status = query.status as CampaignRegistrationStatus;
  if (query.search) {
    where.OR = [
      { bookingNumber: { contains: query.search, mode: 'insensitive' } },
      { owner: { ownerName: { contains: query.search, mode: 'insensitive' } } },
      { owner: { mobile: { contains: query.search } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.campaignRegistration.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, ownerName: true, mobile: true } },
        session: { select: { id: true, sessionDate: true, startTime: true, venue: { select: { name: true } } } },
        _count: { select: { petBookings: true } },
      },
    }),
    prisma.campaignRegistration.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

// ─── Waitlist ────────────────────────────────────────────────────

export async function getNextWaitlistPosition(campaignId: string, sessionId: string): Promise<number> {
  const last = await prisma.campaignWaitlist.findFirst({
    where: { campaignId, sessionId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

export async function createWaitlistEntry(data: {
  campaignId: string;
  sessionId: string;
  ownerId: string;
  petCount: number;
  position: number;
}) {
  return prisma.campaignWaitlist.create({ data });
}

export async function listWaitlist(query: WaitlistListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CampaignWaitlistWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.sessionId) where.sessionId = query.sessionId;
  if (query.status) where.status = query.status as WaitlistStatus;
  const [items, total] = await Promise.all([
    prisma.campaignWaitlist.findMany({
      where, skip, take: limit, orderBy: [{ sessionId: 'asc' }, { position: 'asc' }],
      include: {
        owner: { select: { id: true, ownerName: true, mobile: true, email: true } },
        session: { select: { id: true, sessionDate: true, startTime: true, venue: { select: { name: true } } } },
      },
    }),
    prisma.campaignWaitlist.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function updateWaitlistStatus(id: string, status: WaitlistStatus) {
  return prisma.campaignWaitlist.update({ where: { id }, data: { status } });
}

export async function promoteNextWaitlistEntry(sessionId: string, petCount: number) {
  const entry = await prisma.campaignWaitlist.findFirst({
    where: { sessionId, status: WaitlistStatus.waiting, petCount: { lte: petCount } },
    orderBy: { position: 'asc' },
    include: { owner: { select: { id: true, ownerName: true, mobile: true, email: true } } },
  });
  if (!entry) return null;

  await prisma.campaignWaitlist.update({
    where: { id: entry.id },
    data: {
      status: WaitlistStatus.promoted,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h to register
    },
  });
  return entry;
}
