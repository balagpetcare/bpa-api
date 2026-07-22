import { prisma } from '../../database/prisma';

export interface SessionStat {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  capacity: number;
  totalBookings: number;
  totalPets: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  cancelledCount: number;
  remaining: number;
}

export interface CampaignLiveStats {
  totalRegistrations: number;
  paidCount: number;
  paidAmount: number;
  pendingCount: number;
  pendingAmount: number;
  failedCount: number;
  cancelledCount: number;
  totalPets: number;
  checkedInCount: number;
  vaccinatedCount: number;
  certificateIssuedCount: number;
  waitlistCount: number;
  totalCollectedAmount: number;
  registrationsByStatus: Record<string, number>;
  paymentByStatus: Record<string, { count: number; total: number }>;
  sessionStats: SessionStat[];
  totalCapacity: number;
  usedCapacity: number;
  remainingCapacity: number;
  fillPercent: number;
}

export async function getCampaignLiveStats(campaignId: string): Promise<CampaignLiveStats> {
  const [
    regByStatus,
    paymentRows,
    totalPets,
    checkedInCount,
    vaccinatedCount,
    certificateIssuedCount,
    waitlistCount,
    sessions,
    sessionRegCounts,
    sessionPetCounts,
    sessionPaymentRows,
  ] = await Promise.all([
    prisma.campaignRegistration.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { id: true },
    }),

    prisma.$queryRaw<Array<{ status: string; count: bigint; total: string | null }>>`
      SELECT p.status,
             COUNT(*)::int  AS count,
             SUM(p.amount)::text AS total
      FROM payments p
      INNER JOIN campaign_registrations cr ON cr.payment_id = p.id
      WHERE cr.campaign_id = ${campaignId}::uuid
      GROUP BY p.status
    `,

    prisma.petBooking.count({ where: { registration: { campaignId } } }),

    prisma.petBooking.count({
      where: { registration: { campaignId }, checkedInAt: { not: null } },
    }),

    prisma.petBooking.count({
      where: { registration: { campaignId }, vaccinatedAt: { not: null } },
    }),

    prisma.certificate.count({
      where: { petBooking: { registration: { campaignId } } },
    }),

    prisma.campaignWaitlist.count({
      where: { campaignId, status: 'waiting' },
    }),

    prisma.campaignSession.findMany({
      where: { campaignId },
      select: {
        id: true, sessionDate: true, startTime: true, endTime: true,
        capacity: true, bookedCount: true,
        venue: { select: { name: true } },
      },
      orderBy: { sessionDate: 'asc' },
    }),

    prisma.campaignRegistration.groupBy({
      by: ['sessionId'],
      where: { campaignId },
      _count: { id: true },
    }),

    prisma.petBooking.groupBy({
      by: ['sessionId'],
      where: { registration: { campaignId } },
      _count: { id: true },
    }),

      prisma.$queryRaw<Array<{ session_id: string; status: string; count: bigint }>>`
        SELECT cr.session_id::text,
               COALESCE(p.status::text, 'no_payment') AS status,
               COUNT(*)::int AS count
        FROM campaign_registrations cr
        LEFT JOIN payments p ON p.id = cr.payment_id
      WHERE cr.campaign_id = ${campaignId}::uuid
      GROUP BY cr.session_id, p.status
    `,
  ]);

  // ─── Payment summary map ──────────────────────────────────────────
  const paymentByStatus: Record<string, { count: number; total: number }> = {};
  for (const r of paymentRows) {
    paymentByStatus[r.status] = {
      count: Number(r.count),
      total: r.total ? Number(r.total) : 0,
    };
  }

  const paidCount = paymentByStatus['success']?.count ?? 0;
  const paidAmount = paymentByStatus['success']?.total ?? 0;
  const pendingCount = paymentByStatus['pending']?.count ?? 0;
  const pendingAmount = paymentByStatus['pending']?.total ?? 0;
  const failedCount = paymentByStatus['failed']?.count ?? 0;

  // ─── Registration status map ──────────────────────────────────────
  const registrationsByStatus: Record<string, number> = {};
  let totalRegistrations = 0;
  for (const r of regByStatus) {
    registrationsByStatus[r.status] = r._count.id;
    totalRegistrations += r._count.id;
  }
  const cancelledCount = registrationsByStatus['cancelled'] ?? 0;

  // ─── Session stats ────────────────────────────────────────────────
  const sessionRegMap = new Map(sessionRegCounts.map(r => [r.sessionId, r._count.id]));
  const sessionPetMap = new Map(sessionPetCounts.map(r => [r.sessionId, r._count.id]));

  // Build session payment breakdown: sessionId → { status → count }
  const sessionPayMap = new Map<string, Record<string, number>>();
  for (const r of sessionPaymentRows) {
    const sid = r.session_id;
    if (!sessionPayMap.has(sid)) sessionPayMap.set(sid, {});
    sessionPayMap.get(sid)![r.status] = Number(r.count);
  }

  let totalCapacity = 0;
  let usedCapacity = 0;

  const sessionStats: SessionStat[] = sessions.map(s => {
    const payMap = sessionPayMap.get(s.id) ?? {};
    const bookings = sessionRegMap.get(s.id) ?? 0;
    const pets = sessionPetMap.get(s.id) ?? 0;
    const paid = payMap['success'] ?? 0;
    const pending = payMap['pending'] ?? 0;
    const failed = payMap['failed'] ?? 0;
    const cancelled = payMap['cancelled'] ?? 0;

    totalCapacity += s.capacity;
    usedCapacity += bookings;

    return {
      sessionId: s.id,
      sessionDate: s.sessionDate.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      venueName: s.venue?.name ?? '',
      capacity: s.capacity,
      totalBookings: bookings,
      totalPets: pets,
      paidCount: paid,
      pendingCount: pending,
      failedCount: failed,
      cancelledCount: cancelled,
      remaining: Math.max(0, s.capacity - bookings),
    };
  });

  const remainingCapacity = Math.max(0, totalCapacity - usedCapacity);
  const fillPercent = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;

  return {
    totalRegistrations,
    paidCount,
    paidAmount,
    pendingCount,
    pendingAmount,
    failedCount,
    cancelledCount,
    totalPets,
    checkedInCount,
    vaccinatedCount,
    certificateIssuedCount,
    waitlistCount,
    totalCollectedAmount: paidAmount,
    registrationsByStatus,
    paymentByStatus,
    sessionStats,
    totalCapacity,
    usedCapacity,
    remainingCapacity,
    fillPercent,
  };
}
