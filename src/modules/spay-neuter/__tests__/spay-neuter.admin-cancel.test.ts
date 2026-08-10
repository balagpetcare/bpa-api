import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import { cancelBookingByAdmin } from '../spay-neuter.cancellation.service';
import { adminCancelBookingSchema } from '../spay-neuter.types';

// Admin cancellation: mandatory structured reason (schema-level for "other"),
// actor/timestamp recorded, medically-unfit routed through the existing
// dedicated refund-policy logic, a completed booking is never cancellable
// through this path, and concurrent stale updates are rejected.

describe('cancelBookingByAdmin', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let serviceId: string;
  let offerId: string;
  let offerNoMedicalRefundId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Admin Cancel Org ${suffix}`, slug: `admin-cancel-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Admin Cancel Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });
    const service = await prisma.spayClinicService.create({ data: { clinicProfileId: profile.id, procedure: 'neuter', durationMinutes: 20 } });
    serviceId = service.id;

    const admin = await prisma.user.create({ data: { name: 'Admin Cancel Tester', email: `admincancel-${suffix}@example.test`, isActive: true } });
    adminUserId = admin.id;

    const offer = await prisma.spayOffer.create({
      data: { title: 'Admin Cancel Offer', slug: `admin-cancel-offer-${suffix}`, status: 'published', neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500, medicallyUnfitRefundable: true },
    });
    offerId = offer.id;
    const offerNoRefund = await prisma.spayOffer.create({
      data: { title: 'Admin Cancel Offer No Medical Refund', slug: `admin-cancel-offer-norefund-${suffix}`, status: 'published', neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500, medicallyUnfitRefundable: false },
    });
    offerNoMedicalRefundId = offerNoRefund.id;
  });

  afterAll(async () => {
    await prisma.spayRefundRequest.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    await prisma.spayOffer.deleteMany({ where: { id: { in: [offerId, offerNoMedicalRefundId] } } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  async function makeBooking(opts: { status: string; offerId?: string; advancePaidBdt?: number; cancellationCutoffAt?: Date }) {
    const scheduledStartAt = new Date(Date.now() + 48 * 3_600_000);
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId: opts.offerId ?? offerId, clinicBranchId, serviceId, procedure: 'neuter',
        centralAuthUserId: `admin-cancel-owner-${randomUUID()}`,
        contactName: 'Test Owner', contactPhone: '01700000003',
        totalPriceBdt: 2000, advancePaidBdt: opts.advancePaidBdt ?? 500, balanceDueBdt: 2000 - (opts.advancePaidBdt ?? 500),
        offerTitleSnapshot: 'Admin Cancel Offer', clinicNameSnapshot: 'Admin Cancel Branch', durationMinutesSnapshot: 20,
        medicallyUnfitRefundableSnapshot: opts.offerId === offerNoMedicalRefundId ? false : true,
        scheduledStartAt, scheduledEndAt: new Date(scheduledStartAt.getTime() + 20 * 60_000),
        arriveByAt: new Date(scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: opts.cancellationCutoffAt ?? new Date(scheduledStartAt.getTime() - 6 * 3_600_000),
        status: opts.status as never,
        qrToken: randomUUID(),
      },
    });
  }

  describe('mandatory reason', () => {
    it('schema rejects reasonCode="other" without a note', () => {
      const result = adminCancelBookingSchema.safeParse({ reasonCode: 'other' });
      expect(result.success).toBe(false);
    });

    it('schema accepts reasonCode="other" with a note', () => {
      const result = adminCancelBookingSchema.safeParse({ reasonCode: 'other', note: 'goodwill cancellation' });
      expect(result.success).toBe(true);
    });

    it('schema accepts a structured reason with no note', () => {
      const result = adminCancelBookingSchema.safeParse({ reasonCode: 'duplicate_booking' });
      expect(result.success).toBe(true);
    });
  });

  it('cancels a confirmed booking, recording actor/timestamp/reason, and surfaces refund eligibility', async () => {
    const booking = await makeBooking({ status: 'confirmed' });
    const before = new Date();

    const { booking: updated, eligibility, refundRequest } = await cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'duplicate_booking', note: 'owner booked twice by mistake' });

    expect(updated.status).toBe('cancelled_by_clinic');
    expect(updated.cancelledById).toBe(adminUserId);
    expect(updated.cancellationReasonCode).toBe('duplicate_booking');
    expect(updated.cancellationReason).toContain('owner booked twice');
    expect(new Date(updated.cancelledAt as unknown as string).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(eligibility).toBe('eligible');
    expect(refundRequest).not.toBeNull();
    expect(refundRequest?.status).toBe('pending');
    expect(Number(refundRequest?.amountBdt)).toBe(500);

    const historyEntry = await prisma.spayBookingStatusHistory.findFirst({ where: { bookingId: booking.id, toStatus: 'cancelled_by_clinic' } });
    expect(historyEntry?.changedById).toBe(adminUserId);
  });

  it('"other" reason opens a refund request but marks eligibility as requires_review', async () => {
    const booking = await makeBooking({ status: 'confirmed' });
    const { eligibility, refundRequest } = await cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'other', note: 'special circumstances' });
    expect(eligibility).toBe('requires_review');
    expect(refundRequest).not.toBeNull();
    expect(refundRequest?.status).toBe('pending'); // never auto-approved
  });

  it('owner_late reason is not refund-eligible and opens no refund request', async () => {
    const booking = await makeBooking({ status: 'confirmed', cancellationCutoffAt: new Date(Date.now() - 3_600_000) });
    const { eligibility, refundRequest } = await cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'owner_late' });
    expect(eligibility).toBe('not_eligible');
    expect(refundRequest).toBeNull();
  });

  describe('medically_unfit routes through the existing dedicated refund policy', () => {
    it('refundable when the offer snapshot allows it', async () => {
      const booking = await makeBooking({ status: 'checked_in', offerId });
      const { booking: updated, refundRequest, eligibility } = await cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'medically_unfit', note: 'vet determined unfit' });
      expect(updated.status).toBe('medically_unfit');
      expect(eligibility).toBe('eligible');
      expect(refundRequest).not.toBeNull();
    });

    it('non-refundable when the offer snapshot disallows it', async () => {
      const booking = await makeBooking({ status: 'checked_in', offerId: offerNoMedicalRefundId });
      const { booking: updated, refundRequest, eligibility } = await cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'medically_unfit' });
      expect(updated.status).toBe('medically_unfit');
      expect(eligibility).toBe('not_eligible');
      expect(refundRequest).toBeNull();
    });
  });

  it('never cancels a completed booking through the normal cancel operation (COMPLETED -> CANCELLED protection)', async () => {
    const booking = await makeBooking({ status: 'completed' });
    await expect(cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'administrative', note: 'test' }))
      .rejects.toMatchObject({ code: 'SPAY_BOOKING_NOT_CANCELLABLE' });

    const unchanged = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.status).toBe('completed');
    // and no refund request was ever opened for a completed booking
    const refunds = await prisma.spayRefundRequest.count({ where: { bookingId: booking.id } });
    expect(refunds).toBe(0);
  });

  it('rejects cancelling an already-cancelled booking', async () => {
    const booking = await makeBooking({ status: 'cancelled_by_owner' });
    await expect(cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'administrative' }))
      .rejects.toMatchObject({ code: 'SPAY_BOOKING_NOT_CANCELLABLE' });
  });

  it('protects against a concurrent stale-status double cancellation', async () => {
    const booking = await makeBooking({ status: 'confirmed' });

    const results = await Promise.allSettled([
      cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'administrative' }),
      cancelBookingByAdmin(booking.id, adminUserId, { reasonCode: 'scheduling_error' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'SPAY_CONCURRENT_UPDATE' });
  });
});
