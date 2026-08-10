import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import { adminMarkCompleted } from '../spay-neuter.clinic-ops.service';

// Admin "Mark Completed" — a proper state-machine transition (not a raw
// string write): valid from every pre-completion operational status,
// rejected from terminal states, records actor/timestamp, and is protected
// against a stale concurrent update from a second admin screen.

describe('adminMarkCompleted', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let serviceId: string;
  let offerId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Admin Complete Org ${suffix}`, slug: `admin-complete-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Admin Complete Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });
    const service = await prisma.spayClinicService.create({ data: { clinicProfileId: profile.id, procedure: 'neuter', durationMinutes: 20 } });
    serviceId = service.id;

    const admin = await prisma.user.create({ data: { name: 'Admin Complete Tester', email: `admincomplete-${suffix}@example.test`, isActive: true } });
    adminUserId = admin.id;

    const offer = await prisma.spayOffer.create({
      data: { title: 'Admin Complete Offer', slug: `admin-complete-offer-${suffix}`, status: 'published', neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500 },
    });
    offerId = offer.id;
  });

  afterAll(async () => {
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  async function makeBooking(status: string) {
    const scheduledStartAt = new Date(Date.now() + 3 * 3_600_000);
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId, clinicBranchId, serviceId, procedure: 'neuter',
        centralAuthUserId: `admin-complete-owner-${randomUUID()}`,
        contactName: 'Test Owner', contactPhone: '01700000002',
        totalPriceBdt: 2000, advancePaidBdt: 500, balanceDueBdt: 1500,
        offerTitleSnapshot: 'Admin Complete Offer', clinicNameSnapshot: 'Admin Complete Branch', durationMinutesSnapshot: 20,
        scheduledStartAt, scheduledEndAt: new Date(scheduledStartAt.getTime() + 20 * 60_000),
        arriveByAt: new Date(scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(scheduledStartAt.getTime() - 6 * 3_600_000),
        status: status as never,
        qrToken: randomUUID(),
      },
    });
  }

  it.each(['confirmed', 'checked_in', 'pre_op_assessment', 'ready_for_operation', 'in_operation'])(
    'completes a booking from %s and records the actor + completion timestamp',
    async (fromStatus) => {
      const booking = await makeBooking(fromStatus);
      const before = new Date();

      const updated = await adminMarkCompleted(booking.id, adminUserId, { balanceCollectedBdt: 1500, clinicBalanceCollected: true, note: 'verified in person' });

      expect(updated.status).toBe('completed');
      expect(Number(updated.balanceCollectedBdt)).toBe(1500);
      expect(updated.clinicBalanceCollected).toBe(true);
      expect(updated.operationCompletedAt).toBeTruthy();
      expect(new Date(updated.operationCompletedAt as unknown as string).getTime()).toBeGreaterThanOrEqual(before.getTime());

      const historyEntry = await prisma.spayBookingStatusHistory.findFirst({
        where: { bookingId: booking.id, toStatus: 'completed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(historyEntry?.changedById).toBe(adminUserId);
      expect(historyEntry?.reason).toContain('verified in person');
    },
  );

  it('rejects completing an already-completed booking (COMPLETED -> COMPLETED is not a valid re-entry)', async () => {
    const booking = await makeBooking('completed');
    await expect(adminMarkCompleted(booking.id, adminUserId, {})).rejects.toMatchObject({ code: 'SPAY_INVALID_TRANSITION' });
  });

  it('rejects completing a cancelled booking (COMPLETED can never be reached from a cancelled state)', async () => {
    const booking = await makeBooking('cancelled_by_owner');
    await expect(adminMarkCompleted(booking.id, adminUserId, {})).rejects.toMatchObject({ code: 'SPAY_INVALID_TRANSITION' });
  });

  it('rejects a balance-collected amount above the balance due', async () => {
    const booking = await makeBooking('in_operation');
    await expect(adminMarkCompleted(booking.id, adminUserId, { balanceCollectedBdt: 999999 })).rejects.toMatchObject({ code: 'SPAY_INVALID_BALANCE_COLLECTED' });
  });

  it('protects against a concurrent stale-status double completion', async () => {
    const booking = await makeBooking('in_operation');

    const results = await Promise.allSettled([
      adminMarkCompleted(booking.id, adminUserId, {}),
      adminMarkCompleted(booking.id, adminUserId, {}),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'SPAY_CONCURRENT_UPDATE' });

    const final = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(final.status).toBe('completed');
  });
});
