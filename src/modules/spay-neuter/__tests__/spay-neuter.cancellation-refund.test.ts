import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import {
  cancelBookingByClinic,
  cancelBookingByOwner,
  markMedicallyUnfit,
  markNoShow,
} from '../spay-neuter.cancellation.service';
import {
  approveRefund,
  createManualRefundRequest,
  processRefund,
  rejectRefund,
} from '../spay-neuter.refund.service';
import { verifyByQrToken, lookupByBookingCode } from '../spay-neuter.verification.service';
import { getUserPermissions, hasPermission } from '../../../middlewares/authorize';

describe('spay-neuter cancellation → refund-eligibility workflow', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let offerId: string;
  let offerNoMedicalRefundId: string;
  // staffUserId/adminUserId/vetUserId are real `users` rows — cancelledById/
  // requestedById/reviewedById/processedById/changedById are FK columns, so
  // a bare crypto.randomUUID() (satisfies the UUID *format* but references
  // no row) fails at the database, correctly — these must be real staff.
  let staffUserId: string;
  let vetUserId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Cancel Test Org ${suffix}`, slug: `cancel-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Cancel Test Branch' } });
    clinicBranchId = branch.id;
    await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });

    const [staff, vet, admin] = await Promise.all([
      prisma.user.create({ data: { name: 'Test Staff', email: `staff-${suffix}@example.test`, isActive: true } }),
      prisma.user.create({ data: { name: 'Test Vet', email: `vet-${suffix}@example.test`, isActive: true } }),
      prisma.user.create({ data: { name: 'Test Admin', email: `admin-${suffix}@example.test`, isActive: true } }),
    ]);
    staffUserId = staff.id;
    vetUserId = vet.id;
    adminUserId = admin.id;

    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Cancel Test Offer',
        slug: `cancel-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        medicallyUnfitRefundable: true,
      },
    });
    offerId = offer.id;

    const offerNoRefund = await prisma.spayOffer.create({
      data: {
        title: 'Cancel Test Offer No Medical Refund',
        slug: `cancel-test-offer-norefund-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        medicallyUnfitRefundable: false,
      },
    });
    offerNoMedicalRefundId = offerNoRefund.id;
  });

  afterAll(async () => {
    await prisma.spayRefundRequest.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBookingPet.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    await prisma.spayOffer.deleteMany({ where: { id: { in: [offerId, offerNoMedicalRefundId] } } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.user.deleteMany({ where: { id: { in: [staffUserId, vetUserId, adminUserId] } } });
    await prisma.$disconnect();
  });

  async function makeBooking(opts: {
    scheduledStartAt: Date;
    cancellationCutoffAt: Date;
    centralAuthUserId?: string;
    advancePaidBdt?: number;
    status?: string;
    offerId?: string;
    checkedInAt?: Date;
  }) {
    const endAt = new Date(opts.scheduledStartAt.getTime() + 20 * 60_000);
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId: opts.offerId ?? offerId,
        clinicBranchId,
        serviceId: (await prisma.spayClinicService.upsert({
          where: { clinicProfileId_procedure: { clinicProfileId: (await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } })).id, procedure: 'neuter' } },
          update: {},
          create: { clinicProfileId: (await prisma.spayClinicProfile.findFirstOrThrow({ where: { clinicBranchId } })).id, procedure: 'neuter', durationMinutes: 20 },
        })).id,
        procedure: 'neuter',
        centralAuthUserId: opts.centralAuthUserId ?? 'owner-cancel-test',
        contactName: 'Test Owner',
        contactPhone: '01700000000',
        totalPriceBdt: 2000,
        advancePaidBdt: opts.advancePaidBdt ?? 500,
        balanceDueBdt: 2000 - (opts.advancePaidBdt ?? 500),
        offerTitleSnapshot: 'Cancel Test Offer',
        clinicNameSnapshot: 'Cancel Test Branch',
        durationMinutesSnapshot: 20,
        medicallyUnfitRefundableSnapshot: opts.offerId === offerNoMedicalRefundId ? false : true,
        scheduledStartAt: opts.scheduledStartAt,
        scheduledEndAt: endAt,
        arriveByAt: new Date(opts.scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(opts.scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: opts.cancellationCutoffAt,
        checkedInAt: opts.checkedInAt,
        status: (opts.status ?? 'confirmed') as never,
        qrToken: randomUUID(),
      },
    });
  }

  describe('owner cancellation — cutoff-based refund eligibility', () => {
    it('before the cutoff: refundable, opens a pending SpayRefundRequest for the advance', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 3_600_000),
        cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000), // cutoff is in the future — we're before it
      });

      const { booking: updated, refundRequest } = await cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: booking.centralAuthUserId, reason: 'change of plans' });

      expect(updated.status).toBe('cancelled_by_owner');
      expect(updated.cancellationReasonCode).toBe('owner_before_cutoff');
      expect(refundRequest).not.toBeNull();
      expect(refundRequest?.status).toBe('pending');
      expect(Number(refundRequest?.amountBdt)).toBe(500);
      expect(refundRequest?.requestedByCentralAuthUserId).toBe(booking.centralAuthUserId);
      expect(refundRequest?.requestedById).toBeNull(); // owner has no local User row — matches Decision 2
    });

    it('after the cutoff (late cancellation): non-refundable, no refund request is opened', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 2 * 3_600_000),
        cancellationCutoffAt: new Date(Date.now() - 1 * 3_600_000), // cutoff already passed
      });

      const { booking: updated, refundRequest } = await cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: booking.centralAuthUserId });

      expect(updated.status).toBe('cancelled_by_owner');
      expect(updated.cancellationReasonCode).toBe('owner_late');
      expect(refundRequest).toBeNull();

      const requests = await prisma.spayRefundRequest.count({ where: { bookingId: booking.id } });
      expect(requests).toBe(0);
    });

    it('rejects cancelling another account\'s booking', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 3_600_000),
        cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000),
        centralAuthUserId: 'owner-real',
      });
      await expect(cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: 'owner-impersonator' })).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('rejects double-cancellation', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 3_600_000),
        cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000),
      });
      await cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: booking.centralAuthUserId });
      await expect(cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: booking.centralAuthUserId })).rejects.toMatchObject({
        code: 'SPAY_BOOKING_NOT_CANCELLABLE',
      });
    });
  });

  describe('clinic cancellation — always fully refundable', () => {
    it('is refundable even well after the cutoff has passed', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 2 * 3_600_000),
        cancellationCutoffAt: new Date(Date.now() - 1 * 3_600_000), // cutoff already passed — would be non-refundable for an owner
      });

      const { booking: updated, refundRequest } = await cancelBookingByClinic({ bookingId: booking.id, staffUserId, reason: 'clinic closed unexpectedly' });

      expect(updated.status).toBe('cancelled_by_clinic');
      expect(updated.cancellationReasonCode).toBe('clinic_cancelled');
      expect(refundRequest?.status).toBe('pending');
      expect(Number(refundRequest?.amountBdt)).toBe(500);
    });
  });

  describe('no-show — never refundable', () => {
    it('marks no-show after the scheduled time with no check-in, and opens no refund request', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() - 10 * 60_000), // already started
        cancellationCutoffAt: new Date(Date.now() - 24 * 3_600_000),
      });

      const updated = await markNoShow({ bookingId: booking.id, staffUserId });
      expect(updated.status).toBe('no_show');
      expect(updated.cancellationReasonCode).toBe('no_show');

      const requests = await prisma.spayRefundRequest.count({ where: { bookingId: booking.id } });
      expect(requests).toBe(0);
    });

    it('refuses to mark no-show for a booking that was already checked in', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() - 10 * 60_000),
        cancellationCutoffAt: new Date(Date.now() - 24 * 3_600_000),
        status: 'checked_in',
        checkedInAt: new Date(),
      });
      await expect(markNoShow({ bookingId: booking.id, staffUserId })).rejects.toMatchObject({ code: 'SPAY_ALREADY_CHECKED_IN' });
    });
  });

  describe('MEDICALLY_UNFIT — follows the offer\'s snapshotted policy, not a fixed rule', () => {
    it('refundable when the offer policy allows it', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 3_600_000),
        cancellationCutoffAt: new Date(Date.now() - 3_600_000), // even past cutoff — policy overrides the owner-cutoff rule
        offerId,
      });
      const { booking: updated, refundRequest, refundable } = await markMedicallyUnfit({ bookingId: booking.id, staffUserId: vetUserId, reason: 'pre-op assessment failed' });
      expect(refundable).toBe(true);
      expect(updated.status).toBe('medically_unfit');
      expect(updated.cancellationReasonCode).toBe('medically_unfit');
      expect(refundRequest?.status).toBe('pending');
    });

    it('non-refundable when the offer policy disallows it', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() + 3_600_000),
        cancellationCutoffAt: new Date(Date.now() + 3_600_000),
        offerId: offerNoMedicalRefundId,
      });
      const { refundRequest, refundable } = await markMedicallyUnfit({ bookingId: booking.id, staffUserId: vetUserId });
      expect(refundable).toBe(false);
      expect(refundRequest).toBeNull();
    });
  });

  describe('refund approval — permission split (clinic can create, only central admin can approve)', () => {
    it('the seeded clinic roles hold spay_refunds:create but never spay_refunds:approve or :manage', async () => {
      for (const roleName of ['clinic_admin', 'clinic_vet', 'clinic_front_desk']) {
        const role = await prisma.role.findFirst({ where: { name: roleName }, include: { rolePermissions: { include: { permission: true } } } });
        expect(role).not.toBeNull();
        const perms = role!.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
        expect(hasPermission(perms, 'spay_refunds', 'approve')).toBe(false);
        expect(perms).not.toContain('spay_refunds:manage');
      }

      const admin = await prisma.role.findFirst({ where: { name: 'admin' }, include: { rolePermissions: { include: { permission: true } } } });
      const adminPerms = admin!.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
      expect(hasPermission(adminPerms, 'spay_refunds', 'approve')).toBe(true);
    });

    it('getUserPermissions for a clinic_admin user cannot satisfy spay_refunds:approve', async () => {
      const role = await prisma.role.findFirstOrThrow({ where: { name: 'clinic_admin' } });
      const user = await prisma.user.create({
        data: { name: 'Clinic Admin Test User', email: `clinic-admin-${suffix}@example.test`, isActive: true },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

      const perms = await getUserPermissions(user.id, []);
      expect(hasPermission(perms, 'spay_refunds', 'approve')).toBe(false);
      expect(hasPermission(perms, 'spay_refunds', 'create')).toBe(true);

      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('honest refund execution — no fake provider success', () => {
    it('processRefund requires an approved request and a non-empty external reference', async () => {
      const booking = await makeBooking({ scheduledStartAt: new Date(Date.now() + 48 * 3_600_000), cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000) });
      const request = await createManualRefundRequest(booking.id, staffUserId, 500, 'owner requested');

      // Cannot process a still-pending request.
      await expect(processRefund(request.id, adminUserId, 'BANK-REF-123')).rejects.toMatchObject({ code: 'SPAY_REFUND_NOT_APPROVED' });

      const approved = await approveRefund(request.id, adminUserId, 'looks legitimate');
      expect(approved.status).toBe('approved');

      // Cannot process with an empty/blank reference — never a silent fake success.
      await expect(processRefund(request.id, adminUserId, '   ')).rejects.toMatchObject({ code: 'SPAY_REFUND_REF_REQUIRED' });

      const processed = await processRefund(request.id, adminUserId, 'BANK-REF-123');
      expect(processed.status).toBe('processed');
      expect(processed.externalRefundRef).toBe('BANK-REF-123');
      expect(processed.processedById).toBe(adminUserId);

      const finalBooking = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      // The booking was never actually cancelled in this test (we created the
      // refund request manually), so it stays out of refund_pending/refunded —
      // this asserts processRefund does not touch bookings it has no
      // relationship-chain reason to touch.
      expect(['confirmed']).toContain(finalBooking.status);
    });

    it('rejecting a request is terminal — cannot later approve or process it', async () => {
      const booking = await makeBooking({ scheduledStartAt: new Date(Date.now() + 48 * 3_600_000), cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000) });
      const request = await createManualRefundRequest(booking.id, staffUserId, 500, 'owner requested');
      await rejectRefund(request.id, adminUserId, 'duplicate request');

      await expect(approveRefund(request.id, adminUserId)).rejects.toMatchObject({ code: 'SPAY_REFUND_NOT_PENDING' });
      await expect(processRefund(request.id, adminUserId, 'REF')).rejects.toMatchObject({ code: 'SPAY_REFUND_NOT_APPROVED' });
    });

    it('a full cancel → approve → process cycle moves the booking through refund_pending to refunded', async () => {
      const booking = await makeBooking({ scheduledStartAt: new Date(Date.now() + 48 * 3_600_000), cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000) });
      const { refundRequest } = await cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: booking.centralAuthUserId });
      expect(refundRequest).not.toBeNull();

      await approveRefund(refundRequest!.id, adminUserId);
      const afterApproval = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(afterApproval.status).toBe('refund_pending');

      await processRefund(refundRequest!.id, adminUserId, 'BANK-REF-999');
      const afterProcessing = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(afterProcessing.status).toBe('refunded');
    });
  });

  describe('QR verification and booking-code lookup expose no medical data', () => {
    it('the QR verification response contains no medical fields', async () => {
      const booking = await makeBooking({ scheduledStartAt: new Date(Date.now() + 48 * 3_600_000), cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000) });
      await prisma.spayBookingPet.create({
        data: { bookingId: booking.id, externalPetId: 'pet-x', petNameSnapshot: 'Rex', speciesSnapshot: 'dog', weightKgSnapshot: 12.5, wasAlreadyNeuteredSnapshot: false },
      });

      const dto = await verifyByQrToken(booking.qrToken);
      expect(dto.bookingCode).toBe(booking.bookingCode);
      expect(dto.petNameSnapshot).toBe('Rex');
      expect(dto).not.toHaveProperty('weightKgSnapshot');
      expect(dto).not.toHaveProperty('wasAlreadyNeuteredSnapshot');
      expect(dto).not.toHaveProperty('medicalInstructionsSnapshot');
      // Digit-boundary-anchored so this never false-positives on an unrelated
      // "12.5" substring inside an ISO timestamp's milliseconds field (e.g.
      // "...T07:16:12.545Z" contains "12.5" as a coincidental substring —
      // this flaked intermittently, at whatever millisecond the test ran,
      // before the lookaround was added; the weight value's own absence is
      // already proven by the toHaveProperty checks above).
      expect(JSON.stringify(dto)).not.toMatch(/(?<!\d)12\.5(?!\d)/); // the weight value itself never appears anywhere in the payload
    });

    it('lookupByBookingCode returns the same non-medical shape and is case-insensitive', async () => {
      const booking = await makeBooking({ scheduledStartAt: new Date(Date.now() + 48 * 3_600_000), cancellationCutoffAt: new Date(Date.now() + 24 * 3_600_000) });
      const dto = await lookupByBookingCode(booking.bookingCode.toLowerCase());
      expect(dto.bookingNumber).toBe(booking.bookingNumber);
    });

    it('a recently completed booking is still fully verifiable (receipt/near-term use is not broken)', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() - 2 * 86_400_000), // 2 days ago
        cancellationCutoffAt: new Date(Date.now() - 3 * 86_400_000),
        status: 'completed',
      });
      const dto = await verifyByQrToken(booking.qrToken);
      expect(dto.status).toBe('completed');
      expect(dto.expired).toBeUndefined();
    });

    it('a terminal booking older than the staleness window collapses to a minimal "expired" response', async () => {
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() - 30 * 86_400_000), // 30 days ago — past the 14-day staleness window
        cancellationCutoffAt: new Date(Date.now() - 31 * 86_400_000),
        status: 'completed',
      });
      await prisma.spayBookingPet.create({
        data: { bookingId: booking.id, externalPetId: 'pet-stale', petNameSnapshot: 'StaleDog', speciesSnapshot: 'dog' },
      });

      const byQr = await verifyByQrToken(booking.qrToken);
      expect(byQr.status).toBe('expired');
      expect(byQr.expired).toBe(true);
      expect(byQr.contactName).toBe('');
      expect(byQr.petNameSnapshot).toBeNull();
      expect(byQr.scheduledStartAt).toBe('');

      const byCode = await lookupByBookingCode(booking.bookingCode);
      expect(byCode.status).toBe('expired');
    });

    it('a non-terminal booking (e.g. confirmed) never expires from this policy, regardless of age', async () => {
      // A confirmed-but-far-future booking whose scheduledStartAt happens to
      // be old data entry is still active/unresolved — the staleness rule
      // only applies to TERMINAL statuses, never to something still pending.
      const booking = await makeBooking({
        scheduledStartAt: new Date(Date.now() - 30 * 86_400_000),
        cancellationCutoffAt: new Date(Date.now() - 31 * 86_400_000),
        status: 'confirmed',
      });
      const dto = await verifyByQrToken(booking.qrToken);
      expect(dto.status).toBe('confirmed');
      expect(dto.expired).toBeUndefined();
    });
  });
});
