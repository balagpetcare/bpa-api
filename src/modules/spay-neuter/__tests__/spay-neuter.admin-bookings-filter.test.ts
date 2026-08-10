import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import { listBookingsAdmin } from '../spay-neuter.admin.service';

// Verifies the admin bookings list combines clinic + date + time + procedure
// + status + payment + refund filters at the DB layer (never a full-table
// download filtered in application code), and that pagination metadata
// stays correct once filters are applied.

describe('listBookingsAdmin — combined server-side filtering', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchAId: string;
  let clinicBranchBId: string;
  let offerId: string;
  // clinicBranchId -> procedure -> serviceId. Created once in beforeAll —
  // concurrent per-call upserts of the same (clinicProfileId, procedure)
  // row race under Promise.all and can throw a unique-constraint error even
  // though upsert is meant to be idempotent (a test-fixture pitfall, not an
  // app-code issue).
  const serviceIdByBranchProcedure = new Map<string, string>();

  async function makeBooking(opts: {
    clinicBranchId: string;
    procedure: 'neuter' | 'spay';
    status: string;
    scheduledStartAt: Date;
    paymentStatus?: string;
    withRefund?: 'pending' | 'approved';
  }) {
    const service = serviceIdByBranchProcedure.get(`${opts.clinicBranchId}:${opts.procedure}`);
    if (!service) throw new Error(`No fixture service for ${opts.clinicBranchId}/${opts.procedure}`);
    const endAt = new Date(opts.scheduledStartAt.getTime() + 20 * 60_000);

    let payment: { id: string } | null = null;
    if (opts.paymentStatus) {
      payment = await prisma.payment.create({
        data: { gateway: 'eps', amount: 500, status: opts.paymentStatus as never, purpose: 'spay_neuter_booking' },
      });
    }

    const booking = await prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId,
        clinicBranchId: opts.clinicBranchId,
        serviceId: service,
        procedure: opts.procedure,
        centralAuthUserId: `filter-test-owner-${randomUUID()}`,
        contactName: 'Filter Test Owner',
        contactPhone: '01700000001',
        totalPriceBdt: 2000,
        advancePaidBdt: 500,
        balanceDueBdt: 1500,
        offerTitleSnapshot: 'Filter Test Offer',
        clinicNameSnapshot: 'Filter Test Branch',
        durationMinutesSnapshot: 20,
        scheduledStartAt: opts.scheduledStartAt,
        scheduledEndAt: endAt,
        arriveByAt: new Date(opts.scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(opts.scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(opts.scheduledStartAt.getTime() - 6 * 3_600_000),
        status: opts.status as never,
        qrToken: randomUUID(),
        paymentId: payment?.id,
      },
    });

    if (opts.withRefund) {
      await prisma.spayRefundRequest.create({
        data: { bookingId: booking.id, amountBdt: 500, reason: 'test', status: opts.withRefund, requestedById: undefined },
      });
    }
    return booking;
  }

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Filter Test Org ${suffix}`, slug: `filter-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const [branchA, branchB] = await Promise.all([
      prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Bala G Pet Clinic' } }),
      prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Other Branch' } }),
    ]);
    clinicBranchAId = branchA.id;
    clinicBranchBId = branchB.id;

    for (const branchId of [clinicBranchAId, clinicBranchBId]) {
      const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId: branchId, concurrentOperationCapacity: 2 } });
      for (const procedure of ['neuter', 'spay'] as const) {
        const service = await prisma.spayClinicService.create({ data: { clinicProfileId: profile.id, procedure, durationMinutes: 20 } });
        serviceIdByBranchProcedure.set(`${branchId}:${procedure}`, service.id);
      }
    }

    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Filter Test Offer', slug: `filter-test-offer-${suffix}`, status: 'published',
        neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500,
      },
    });
    offerId = offer.id;
  });

  afterAll(async () => {
    await prisma.spayRefundRequest.deleteMany({ where: { booking: { clinicBranchId: { in: [clinicBranchAId, clinicBranchBId] } } } });
    const bookings = await prisma.spayBooking.findMany({ where: { clinicBranchId: { in: [clinicBranchAId, clinicBranchBId] } }, select: { id: true, paymentId: true } });
    await prisma.spayBooking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } });
    await prisma.payment.deleteMany({ where: { id: { in: bookings.map((b) => b.paymentId).filter((id): id is string => Boolean(id)) } } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId: { in: [clinicBranchAId, clinicBranchBId] } } });
    await prisma.clinicBranch.deleteMany({ where: { id: { in: [clinicBranchAId, clinicBranchBId] } } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  it('combines clinic + date + time + procedure + status into a single correct result set', async () => {
    // Target: Clinic A, 2026-08-16, 09:00-12:00 window, Neuter, Confirmed
    const target = await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date('2026-08-16T04:00:00.000Z'), // 10:00 Asia/Dhaka
    });
    // Same clinic/date/procedure but OUTSIDE the time window
    await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date('2026-08-16T10:00:00.000Z'), // 16:00 Asia/Dhaka
    });
    // Same everything but different clinic
    await makeBooking({
      clinicBranchId: clinicBranchBId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date('2026-08-16T04:00:00.000Z'),
    });
    // Same everything but different procedure
    await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'spay', status: 'confirmed',
      scheduledStartAt: new Date('2026-08-16T04:00:00.000Z'),
    });
    // Same everything but different status
    await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'pending_payment',
      scheduledStartAt: new Date('2026-08-16T04:00:00.000Z'),
    });

    const result = await listBookingsAdmin({
      clinicBranchId: clinicBranchAId,
      procedure: 'neuter',
      status: 'confirmed',
      fromDate: '2026-08-16',
      toDate: '2026-08-16',
      timeFrom: '09:00',
      timeTo: '12:00',
    });

    expect(result.items.map((b) => b.id)).toEqual([target.id]);
  });

  it('filters by payment status', async () => {
    const success = await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date(Date.now() + 24 * 3_600_000), paymentStatus: 'success',
    });
    await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date(Date.now() + 25 * 3_600_000), paymentStatus: 'pending',
    });

    const result = await listBookingsAdmin({ clinicBranchId: clinicBranchAId, paymentStatus: 'success' });
    expect(result.items.map((b) => b.id)).toContain(success.id);
    expect(result.items.every((b) => b.payment?.status === 'success')).toBe(true);
  });

  it('filters by refund status, including "none" (no refund request at all)', async () => {
    const withPendingRefund = await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'cancelled_by_clinic',
      scheduledStartAt: new Date(Date.now() + 26 * 3_600_000), withRefund: 'pending',
    });
    const noRefund = await makeBooking({
      clinicBranchId: clinicBranchAId, procedure: 'neuter', status: 'confirmed',
      scheduledStartAt: new Date(Date.now() + 27 * 3_600_000),
    });

    const pendingResult = await listBookingsAdmin({ clinicBranchId: clinicBranchAId, refundStatus: 'pending' });
    expect(pendingResult.items.map((b) => b.id)).toContain(withPendingRefund.id);
    expect(pendingResult.items.map((b) => b.id)).not.toContain(noRefund.id);

    const noneResult = await listBookingsAdmin({ clinicBranchId: clinicBranchAId, refundStatus: 'none' });
    expect(noneResult.items.map((b) => b.id)).toContain(noRefund.id);
    expect(noneResult.items.map((b) => b.id)).not.toContain(withPendingRefund.id);
  });

  it('returns correct pagination metadata after filters are applied', async () => {
    const scheduledBase = Date.now() + 48 * 3_600_000;
    const created = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => makeBooking({
        clinicBranchId: clinicBranchBId, procedure: 'spay', status: 'confirmed',
        scheduledStartAt: new Date(scheduledBase + i * 3_600_000),
      })),
    );

    const page1 = await listBookingsAdmin({ clinicBranchId: clinicBranchBId, procedure: 'spay', page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta.total).toBeGreaterThanOrEqual(5);
    expect(page1.meta.hasNext).toBe(true);

    const page2 = await listBookingsAdmin({ clinicBranchId: clinicBranchBId, procedure: 'spay', page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);

    void created;
  });
});
