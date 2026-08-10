import { prisma } from '../../database/prisma';
import { sweepMaxConcurrency } from './spay-neuter.scheduling';

// ─── Reporting ────────────────────────────────────────────────────────
//
// Every figure here is computed from live SpayBooking/SpayRefundRequest
// rows — nothing is cached or pre-aggregated, so these numbers can never
// drift from what a booking detail page shows. Money fields are summed as
// JS numbers from Prisma Decimal via Number(...) (matches the house
// convention used throughout the rest of this module — see
// spay-neuter.admin.service.ts's getRevenueReport).

const OCCUPYING_STATUSES = [
  'confirmed',
  'checked_in',
  'pre_op_assessment',
  'ready_for_operation',
  'in_operation',
  'completed',
] as const;

const CANCELLED_STATUSES = ['cancelled_by_owner', 'cancelled_by_clinic'] as const;

const ALL_STATUSES = [
  'pending_payment',
  'confirmed',
  'checked_in',
  'pre_op_assessment',
  'ready_for_operation',
  'in_operation',
  'completed',
  'medically_unfit',
  'no_show',
  'cancelled_by_owner',
  'cancelled_by_clinic',
  'refund_pending',
  'refunded',
] as const;

function dateRangeWhere(fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) return {};
  return {
    scheduledStartAt: {
      ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
      ...(toDate ? { lt: new Date(new Date(`${toDate}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
    },
  };
}

export type ReportFilters = { fromDate?: string; toDate?: string; clinicBranchId?: string };

/**
 * The primary reporting surface: total bookings, Spay vs Neuter split,
 * every status count (confirmed/checked-in/medically-unfit/completed/
 * cancelled/no-show — cancelled is reported both combined and split by
 * who cancelled), advance collected online, remaining clinic-payable
 * total, and refund totals grouped by refund status.
 */
export async function getSummaryReport(filters: ReportFilters) {
  const where = {
    ...dateRangeWhere(filters.fromDate, filters.toDate),
    ...(filters.clinicBranchId ? { clinicBranchId: filters.clinicBranchId } : {}),
  };

  const [statusGroups, procedureGroups, moneyAgg, refundGroups] = await Promise.all([
    prisma.spayBooking.groupBy({ by: ['status'], where, _count: true }),
    prisma.spayBooking.groupBy({ by: ['procedure'], where, _count: true }),
    prisma.spayBooking.aggregate({
      where,
      _sum: { advancePaidBdt: true, balanceDueBdt: true, balanceCollectedBdt: true, totalPriceBdt: true },
    }),
    prisma.spayRefundRequest.groupBy({
      by: ['status'],
      where: { booking: where },
      _count: true,
      _sum: { amountBdt: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const g of statusGroups) statusCounts[g.status] = g._count;

  const totalBookings = statusGroups.reduce((sum, g) => sum + g._count, 0);
  const cancelledTotal = CANCELLED_STATUSES.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);

  const byProcedure = Object.fromEntries(procedureGroups.map((g) => [g.procedure, g._count]));

  const advanceCollectedBdt = Number(moneyAgg._sum.advancePaidBdt ?? 0);
  const totalPriceBdt = Number(moneyAgg._sum.totalPriceBdt ?? 0);
  const balanceDueBdt = Number(moneyAgg._sum.balanceDueBdt ?? 0);
  const balanceCollectedBdt = Number(moneyAgg._sum.balanceCollectedBdt ?? 0);
  // Remaining clinic-payable total = balance still owed on bookings that
  // haven't been collected yet (balanceDueBdt already accounts for advance;
  // subtracting what's already been collected at the clinic).
  const remainingClinicPayableBdt = Math.max(0, balanceDueBdt - balanceCollectedBdt);

  const refundsByStatus = Object.fromEntries(
    (['pending', 'approved', 'rejected', 'processed'] as const).map((s) => [s, { count: 0, amountBdt: 0 }]),
  ) as Record<string, { count: number; amountBdt: number }>;
  let refundTotalRequestedBdt = 0;
  let refundTotalProcessedBdt = 0;
  for (const g of refundGroups) {
    const amount = Number(g._sum.amountBdt ?? 0);
    refundsByStatus[g.status] = { count: g._count, amountBdt: amount };
    refundTotalRequestedBdt += amount;
    if (g.status === 'processed') refundTotalProcessedBdt += amount;
  }

  return {
    totalBookings,
    byProcedure: { neuter: byProcedure.neuter ?? 0, spay: byProcedure.spay ?? 0 },
    statusCounts,
    cancelled: {
      total: cancelledTotal,
      byOwner: statusCounts.cancelled_by_owner ?? 0,
      byClinic: statusCounts.cancelled_by_clinic ?? 0,
    },
    money: {
      totalPriceBdt,
      advanceCollectedBdt,
      remainingClinicPayableBdt,
      balanceCollectedAtClinicBdt: balanceCollectedBdt,
    },
    refunds: {
      byStatus: refundsByStatus,
      totalRequestedBdt: refundTotalRequestedBdt,
      totalProcessedBdt: refundTotalProcessedBdt,
    },
  };
}

/**
 * Clinic/date/slot capacity utilization. For every clinic (or the one
 * requested) and every date with at least one occupying booking in range,
 * computes the peak concurrent-operation count via the same interval-sweep
 * algorithm the live capacity engine uses (spay-neuter.scheduling.ts), so
 * "available vs full" here can never disagree with what the booking flow
 * actually enforced.
 */
export async function getUtilizationReport(filters: ReportFilters) {
  const bookings = await prisma.spayBooking.findMany({
    where: {
      ...dateRangeWhere(filters.fromDate, filters.toDate),
      ...(filters.clinicBranchId ? { clinicBranchId: filters.clinicBranchId } : {}),
      status: { in: [...OCCUPYING_STATUSES] },
    },
    select: { clinicBranchId: true, clinicNameSnapshot: true, scheduledStartAt: true, scheduledEndAt: true },
    orderBy: { scheduledStartAt: 'asc' },
  });

  const clinicIds = [...new Set(bookings.map((b) => b.clinicBranchId))];
  const profiles = await prisma.spayClinicProfile.findMany({
    where: { clinicBranchId: { in: clinicIds } },
    select: { clinicBranchId: true, concurrentOperationCapacity: true },
  });
  const capacityByClinic = new Map(profiles.map((p) => [p.clinicBranchId, p.concurrentOperationCapacity]));

  // Group by (clinic, Dhaka calendar date).
  type Key = string;
  const buckets = new Map<Key, { clinicBranchId: string; clinicName: string; date: string; intervals: { start: Date; end: Date }[] }>();
  for (const b of bookings) {
    const date = b.scheduledStartAt.toISOString().slice(0, 10);
    const key = `${b.clinicBranchId}::${date}`;
    if (!buckets.has(key)) buckets.set(key, { clinicBranchId: b.clinicBranchId, clinicName: b.clinicNameSnapshot, date, intervals: [] });
    buckets.get(key)!.intervals.push({ start: b.scheduledStartAt, end: b.scheduledEndAt });
  }

  const rows = [...buckets.values()].map((bucket) => {
    const capacity = capacityByClinic.get(bucket.clinicBranchId) ?? 0;
    // Peak concurrency = max over all intervals of how many others they overlap +1 for themselves;
    // computed by sweeping each interval as the "candidate" against the rest and taking the max.
    let peak = 0;
    for (const iv of bucket.intervals) {
      const others = bucket.intervals.filter((o) => o !== iv);
      peak = Math.max(peak, sweepMaxConcurrency(iv, others));
    }
    const bookedCount = bucket.intervals.length;
    return {
      clinicBranchId: bucket.clinicBranchId,
      clinicName: bucket.clinicName,
      date: bucket.date,
      bookedCount,
      capacity,
      peakConcurrentOperations: peak,
      utilizationPercent: capacity > 0 ? Math.round((peak / capacity) * 100) : 0,
      isFull: capacity > 0 && peak >= capacity,
    };
  });

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.clinicName.localeCompare(b.clinicName));
  return rows;
}

/** Upcoming (not-yet-terminal) operations, soonest first. */
export async function getUpcomingOperationsReport(filters: ReportFilters & { limit?: number }) {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const bookings = await prisma.spayBooking.findMany({
    where: {
      ...(filters.clinicBranchId ? { clinicBranchId: filters.clinicBranchId } : {}),
      status: { in: [...OCCUPYING_STATUSES] },
      scheduledStartAt: { gte: filters.fromDate ? new Date(`${filters.fromDate}T00:00:00.000Z`) : new Date() },
      ...(filters.toDate ? { scheduledStartAt: { lt: new Date(new Date(`${filters.toDate}T00:00:00.000Z`).getTime() + 86_400_000) } } : {}),
    },
    select: {
      id: true,
      bookingNumber: true,
      procedure: true,
      status: true,
      clinicBranchId: true,
      clinicNameSnapshot: true,
      scheduledStartAt: true,
      contactName: true,
    },
    orderBy: { scheduledStartAt: 'asc' },
    take: limit,
  });
  return bookings;
}

/** Per-clinic rollup: volume, completion/no-show/cancellation rates, and revenue. */
export async function getClinicPerformanceReport(filters: ReportFilters) {
  const where = { ...dateRangeWhere(filters.fromDate, filters.toDate), ...(filters.clinicBranchId ? { clinicBranchId: filters.clinicBranchId } : {}) };

  const [byClinicStatus, byClinicMoney] = await Promise.all([
    prisma.spayBooking.groupBy({ by: ['clinicBranchId', 'clinicNameSnapshot', 'status'], where, _count: true }),
    prisma.spayBooking.groupBy({
      by: ['clinicBranchId'],
      where,
      _sum: { advancePaidBdt: true, balanceCollectedBdt: true },
    }),
  ]);

  const moneyByClinic = new Map(byClinicMoney.map((m) => [m.clinicBranchId, m._sum]));
  const clinics = new Map<string, { clinicBranchId: string; clinicName: string; total: number; completed: number; noShow: number; cancelled: number; medicallyUnfit: number }>();

  for (const g of byClinicStatus) {
    const key = g.clinicBranchId;
    if (!clinics.has(key)) {
      clinics.set(key, { clinicBranchId: key, clinicName: g.clinicNameSnapshot, total: 0, completed: 0, noShow: 0, cancelled: 0, medicallyUnfit: 0 });
    }
    const row = clinics.get(key)!;
    row.total += g._count;
    if (g.status === 'completed') row.completed += g._count;
    if (g.status === 'no_show') row.noShow += g._count;
    if (g.status === 'cancelled_by_owner' || g.status === 'cancelled_by_clinic') row.cancelled += g._count;
    if (g.status === 'medically_unfit') row.medicallyUnfit += g._count;
  }

  return [...clinics.values()]
    .map((row) => {
      const money = moneyByClinic.get(row.clinicBranchId);
      return {
        ...row,
        completionRatePercent: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
        noShowRatePercent: row.total > 0 ? Math.round((row.noShow / row.total) * 100) : 0,
        cancellationRatePercent: row.total > 0 ? Math.round((row.cancelled / row.total) * 100) : 0,
        advanceCollectedBdt: Number(money?.advancePaidBdt ?? 0),
        balanceCollectedBdt: Number(money?.balanceCollectedBdt ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ─── CSV export ─────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export type BookingExportFilters = {
  status?: string;
  clinicBranchId?: string;
  procedure?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
};

/** Same filter shape as the admin booking list (listBookingsAdmin) — CSV export always reflects the current filter, never the unfiltered table. */
export async function exportBookingsCsv(filters: BookingExportFilters): Promise<string> {
  const where = {
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.clinicBranchId ? { clinicBranchId: filters.clinicBranchId } : {}),
    ...(filters.procedure ? { procedure: filters.procedure as never } : {}),
    ...(filters.search
      ? {
          OR: [
            { bookingNumber: { contains: filters.search, mode: 'insensitive' as const } },
            { bookingCode: { contains: filters.search.toUpperCase() } },
            { contactPhone: { contains: filters.search } },
            { contactName: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(filters.fromDate || filters.toDate
      ? {
          scheduledStartAt: {
            ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
            ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
          },
        }
      : {}),
  };

  const bookings = await prisma.spayBooking.findMany({
    where,
    orderBy: { scheduledStartAt: 'desc' },
    take: 10_000,
    select: {
      bookingNumber: true,
      bookingCode: true,
      procedure: true,
      status: true,
      clinicNameSnapshot: true,
      scheduledStartAt: true,
      contactName: true,
      contactPhone: true,
      totalPriceBdt: true,
      advancePaidBdt: true,
      balanceDueBdt: true,
      balanceCollectedBdt: true,
      cancellationReasonCode: true,
      createdAt: true,
    },
  });

  const header = [
    'Booking Number',
    'Booking Code',
    'Procedure',
    'Status',
    'Clinic',
    'Scheduled Start (UTC)',
    'Contact Name',
    'Contact Phone',
    'Total Price BDT',
    'Advance Paid BDT',
    'Balance Due BDT',
    'Balance Collected BDT',
    'Cancellation Reason',
    'Created At (UTC)',
  ];

  const rows = bookings.map((b) => [
    b.bookingNumber,
    b.bookingCode,
    b.procedure,
    b.status,
    b.clinicNameSnapshot,
    b.scheduledStartAt.toISOString(),
    b.contactName,
    b.contactPhone,
    Number(b.totalPriceBdt),
    Number(b.advancePaidBdt),
    Number(b.balanceDueBdt),
    Number(b.balanceCollectedBdt),
    b.cancellationReasonCode ?? '',
    b.createdAt.toISOString(),
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}
