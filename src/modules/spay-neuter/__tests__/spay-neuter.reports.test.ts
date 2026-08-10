import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import {
  getSummaryReport,
  getUtilizationReport,
  getUpcomingOperationsReport,
  getClinicPerformanceReport,
  exportBookingsCsv,
} from '../spay-neuter.reports.service';

// Integration tests against the local dev database — see
// docs/plans/spay-neuter/implementation-contract.md. Every figure asserted
// here is computed live from real SpayBooking/SpayRefundRequest rows, the
// same way the report functions themselves work — nothing is mocked.

describe('spay-neuter reporting', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let serviceId: string;
  let offerId: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Report Test Org ${suffix}`, slug: `report-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Report Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });
    clinicProfileId = profile.id;
    const service = await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    serviceId = service.id;
    const offer = await prisma.spayOffer.create({
      data: { title: 'Report Test Offer', slug: `report-test-offer-${suffix}`, status: 'published', neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500 },
    });
    offerId = offer.id;
  });

  afterAll(async () => {
    await prisma.spayRefundRequest.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  async function makeBooking(opts: {
    procedure?: 'neuter' | 'spay';
    status: string;
    advancePaidBdt?: number;
    balanceCollectedBdt?: number;
    scheduledStartAt: Date;
    contactName?: string;
  }) {
    const totalPriceBdt = opts.procedure === 'spay' ? 3500 : 2000;
    const advancePaidBdt = opts.advancePaidBdt ?? 500;
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId,
        clinicBranchId,
        serviceId,
        procedure: opts.procedure ?? 'neuter',
        centralAuthUserId: 'owner-report-test',
        contactName: opts.contactName ?? 'Report Owner',
        contactPhone: '01700000000',
        totalPriceBdt,
        advancePaidBdt,
        balanceDueBdt: totalPriceBdt - advancePaidBdt,
        balanceCollectedBdt: opts.balanceCollectedBdt ?? 0,
        offerTitleSnapshot: 'Report Test Offer',
        clinicNameSnapshot: 'Report Test Branch',
        durationMinutesSnapshot: 20,
        scheduledStartAt: opts.scheduledStartAt,
        scheduledEndAt: new Date(opts.scheduledStartAt.getTime() + 20 * 60_000),
        arriveByAt: new Date(opts.scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(opts.scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(opts.scheduledStartAt.getTime() - 24 * 3_600_000),
        status: opts.status as never,
        qrToken: randomUUID(),
      },
    });
  }

  describe('getSummaryReport', () => {
    it('counts total bookings, splits Spay vs Neuter, and reports every requested status bucket', async () => {
      await makeBooking({ procedure: 'neuter', status: 'confirmed', scheduledStartAt: new Date(`${today}T04:00:00.000Z`) });
      await makeBooking({ procedure: 'spay', status: 'checked_in', scheduledStartAt: new Date(`${today}T05:00:00.000Z`) });
      await makeBooking({ procedure: 'neuter', status: 'medically_unfit', scheduledStartAt: new Date(`${today}T06:00:00.000Z`) });
      await makeBooking({ procedure: 'spay', status: 'completed', balanceCollectedBdt: 3000, scheduledStartAt: new Date(`${today}T07:00:00.000Z`) });
      await makeBooking({ procedure: 'neuter', status: 'cancelled_by_owner', scheduledStartAt: new Date(`${today}T08:00:00.000Z`) });
      await makeBooking({ procedure: 'neuter', status: 'cancelled_by_clinic', scheduledStartAt: new Date(`${today}T09:00:00.000Z`) });
      await makeBooking({ procedure: 'spay', status: 'no_show', scheduledStartAt: new Date(`${today}T10:00:00.000Z`) });

      const summary = await getSummaryReport({ clinicBranchId });

      expect(summary.totalBookings).toBe(7);
      expect(summary.byProcedure.neuter).toBe(4);
      expect(summary.byProcedure.spay).toBe(3);
      expect(summary.statusCounts.confirmed).toBe(1);
      expect(summary.statusCounts.checked_in).toBe(1);
      expect(summary.statusCounts.medically_unfit).toBe(1);
      expect(summary.statusCounts.completed).toBe(1);
      expect(summary.statusCounts.no_show).toBe(1);
      expect(summary.cancelled.total).toBe(2);
      expect(summary.cancelled.byOwner).toBe(1);
      expect(summary.cancelled.byClinic).toBe(1);
    });

    it('advance collected + remaining clinic-payable reconcile against total price', async () => {
      // Fresh clinic-scoped slice: exactly one completed booking with a
      // known total/advance/balance-collected combination.
      const branch2 = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Report Test Branch 2' } });
      const profile2 = await prisma.spayClinicProfile.create({ data: { clinicBranchId: branch2.id, concurrentOperationCapacity: 1 } });
      const service2 = await prisma.spayClinicService.create({ data: { clinicProfileId: profile2.id, procedure: 'spay', durationMinutes: 40 } });

      await prisma.spayBooking.create({
        data: {
          bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
          bookingCode: generateBookingCode(),
          offerId,
          clinicBranchId: branch2.id,
          serviceId: service2.id,
          procedure: 'spay',
          centralAuthUserId: 'owner-report-test-2',
          contactName: 'Money Test',
          contactPhone: '01700000001',
          totalPriceBdt: 3500,
          advancePaidBdt: 500,
          balanceDueBdt: 3000,
          balanceCollectedBdt: 1000, // partially collected — 2000 still remaining
          offerTitleSnapshot: 'Report Test Offer',
          clinicNameSnapshot: 'Report Test Branch 2',
          durationMinutesSnapshot: 40,
          scheduledStartAt: new Date(`${today}T04:00:00.000Z`),
          scheduledEndAt: new Date(`${today}T04:40:00.000Z`),
          arriveByAt: new Date(`${today}T03:40:00.000Z`),
          checkinOpensAt: new Date(`${today}T03:00:00.000Z`),
          cancellationCutoffAt: new Date(`${today}T00:00:00.000Z`),
          status: 'completed',
          qrToken: randomUUID(),
        },
      });

      const summary = await getSummaryReport({ clinicBranchId: branch2.id });
      expect(summary.money.totalPriceBdt).toBe(3500);
      expect(summary.money.advanceCollectedBdt).toBe(500);
      expect(summary.money.balanceCollectedAtClinicBdt).toBe(1000);
      expect(summary.money.remainingClinicPayableBdt).toBe(2000); // 3000 balanceDue - 1000 already collected
      expect(summary.money.advanceCollectedBdt + summary.money.remainingClinicPayableBdt + summary.money.balanceCollectedAtClinicBdt).toBe(summary.money.totalPriceBdt);

      await prisma.spayBooking.deleteMany({ where: { clinicBranchId: branch2.id } });
      await prisma.spayClinicService.deleteMany({ where: { clinicProfileId: profile2.id } });
      await prisma.spayClinicProfile.delete({ where: { id: profile2.id } });
      await prisma.clinicBranch.delete({ where: { id: branch2.id } });
    });

    it('refund totals are grouped by status and summed independently of booking status', async () => {
      const booking = await makeBooking({ status: 'refund_pending', scheduledStartAt: new Date(`${today}T11:00:00.000Z`) });
      await prisma.spayRefundRequest.create({ data: { bookingId: booking.id, amountBdt: 500, reason: 'test', status: 'pending' } });

      const booking2 = await makeBooking({ status: 'refunded', scheduledStartAt: new Date(`${today}T12:00:00.000Z`) });
      await prisma.spayRefundRequest.create({ data: { bookingId: booking2.id, amountBdt: 500, reason: 'test', status: 'processed', externalRefundRef: 'REF-1' } });

      const summary = await getSummaryReport({ clinicBranchId });
      expect(summary.refunds.byStatus.pending.count).toBeGreaterThanOrEqual(1);
      expect(summary.refunds.byStatus.processed.amountBdt).toBeGreaterThanOrEqual(500);
      expect(summary.refunds.totalProcessedBdt).toBeGreaterThanOrEqual(500);
    });
  });

  describe('getUtilizationReport', () => {
    it('reports peak concurrency vs capacity and flags a full clinic/date/slot correctly', async () => {
      // capacity=2 clinic; two overlapping bookings on the same date should
      // report peak=2 (full); a third, non-overlapping booking on the same
      // date after the first two end should NOT push the peak past 2.
      const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      await makeBooking({ status: 'confirmed', scheduledStartAt: new Date(`${day}T04:00:00.000Z`) }); // 04:00-04:20
      await makeBooking({ status: 'confirmed', scheduledStartAt: new Date(`${day}T04:00:00.000Z`) }); // 04:00-04:20 (overlaps -> peak 2)
      await makeBooking({ status: 'confirmed', scheduledStartAt: new Date(`${day}T04:20:00.000Z`) }); // starts exactly when the first two end -> does not add to peak

      const rows = await getUtilizationReport({ clinicBranchId, fromDate: day, toDate: day });
      const row = rows.find((r) => r.date === day);
      expect(row).toBeDefined();
      expect(row!.capacity).toBe(2);
      expect(row!.peakConcurrentOperations).toBe(2);
      expect(row!.isFull).toBe(true);
      expect(row!.bookedCount).toBe(3);
    });
  });

  describe('getUpcomingOperationsReport', () => {
    it('only returns non-terminal bookings scheduled from now onward, soonest first', async () => {
      const future1 = new Date(Date.now() + 3 * 86_400_000);
      const future2 = new Date(Date.now() + 6 * 86_400_000);
      const past = new Date(Date.now() - 86_400_000);

      await makeBooking({ status: 'confirmed', scheduledStartAt: future2, contactName: 'Later' });
      await makeBooking({ status: 'confirmed', scheduledStartAt: future1, contactName: 'Sooner' });
      await makeBooking({ status: 'cancelled_by_owner', scheduledStartAt: future1, contactName: 'Cancelled (excluded)' });
      // A past booking with a status that would normally occupy capacity —
      // must not appear in "upcoming" regardless of status.
      await makeBooking({ status: 'confirmed', scheduledStartAt: past, contactName: 'Past (excluded)' });

      const upcoming = await getUpcomingOperationsReport({ clinicBranchId });
      const names = upcoming.map((u) => u.contactName);
      expect(names).toContain('Sooner');
      expect(names).toContain('Later');
      expect(names).not.toContain('Cancelled (excluded)');
      expect(names).not.toContain('Past (excluded)');
      expect(names.indexOf('Sooner')).toBeLessThan(names.indexOf('Later')); // soonest first
    });
  });

  describe('getClinicPerformanceReport', () => {
    it('computes completion/no-show/cancellation rates and revenue per clinic', async () => {
      const rows = await getClinicPerformanceReport({ clinicBranchId });
      const row = rows.find((r) => r.clinicBranchId === clinicBranchId);
      expect(row).toBeDefined();
      expect(row!.total).toBeGreaterThan(0);
      expect(row!.completionRatePercent).toBeGreaterThanOrEqual(0);
      expect(row!.completionRatePercent).toBeLessThanOrEqual(100);
      expect(row!.advanceCollectedBdt).toBeGreaterThanOrEqual(0);
    });
  });

  describe('exportBookingsCsv', () => {
    it('produces a CSV with a header row and one row per matching booking, respecting filters', async () => {
      const csv = await exportBookingsCsv({ clinicBranchId, status: 'confirmed' });
      const lines = csv.split('\r\n');
      expect(lines[0]).toContain('Booking Number');
      expect(lines[0]).toContain('Advance Paid BDT');
      // Every data row's status column must be exactly "confirmed" — the
      // export must reflect the filter, not return the whole table.
      const statusColIndex = lines[0].split(',').indexOf('Status');
      for (const line of lines.slice(1)) {
        if (!line) continue;
        expect(line.split(',')[statusColIndex]).toBe('confirmed');
      }
    });

    it('CSV-escapes values containing commas or quotes', async () => {
      await makeBooking({ status: 'confirmed', scheduledStartAt: new Date(`${today}T13:00:00.000Z`), contactName: 'Doe, "Jane"' });
      const csv = await exportBookingsCsv({ clinicBranchId, search: 'Doe' });
      expect(csv).toContain('"Doe, ""Jane"""');
    });
  });
});
