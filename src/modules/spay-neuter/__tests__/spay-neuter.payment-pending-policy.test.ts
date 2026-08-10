import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import {
  createBookingFromHold,
  expireStalePendingPaymentBooking,
  retrySpayBookingPayment,
} from '../spay-neuter.booking.service';
import { SPAY_PENDING_PAYMENT_MINUTES, computePaymentDueAt } from '../spay-neuter.domain';

// Covers the approved online-advance policy's two enforcement mechanisms:
//   1. an unpaid `pending_payment` booking cannot occupy a clinic slot
//      forever (expireStalePendingPaymentBooking / the cleanup job that
//      calls it on a timer);
//   2. "Retry Payment" always resumes the SAME booking/Payment, never
//      creates a second booking, and is itself idempotent against a
//      double-click (retrySpayBookingPayment).

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => false),
  generateMerchantTxnId: jest.fn(() => `TESTRETRY${Date.now()}${Math.floor(Math.random() * 1000)}`),
  initializeEpsPayment: jest.fn(),
}));

import { isEPSConfigured, initializeEpsPayment } from '../../../services/eps.service';

describe('spay-neuter payment-pending slot policy', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Retry Test Org ${suffix}`, slug: `retry-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Retry Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Retry Test Offer',
        slug: `retry-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 1 },
    });
    await prisma.spayOfferClinic.create({ data: { offerId, clinicBranchId, isActive: true } });
  });

  afterAll(async () => {
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayOfferClinic.deleteMany({ where: { clinicBranchId } });
    await prisma.spayPaymentAttempt.deleteMany({ where: { booking: { clinicBranchId } } });
    const bookings = await prisma.spayBooking.findMany({ where: { clinicBranchId }, select: { id: true, paymentId: true } });
    await prisma.spayBookingPet.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    const paymentIds = bookings.map((b) => b.paymentId).filter((id): id is string => !!id);
    if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.spaySlotHold.deleteMany({ where: { clinicBranchId } });
    await prisma.spaySlot.deleteMany({ where: { clinicProfileId } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    (isEPSConfigured as jest.Mock).mockReturnValue(false);
    (initializeEpsPayment as jest.Mock).mockReset();
  });

  async function makeHold(hour: string, centralAuthUserId = 'retry-owner-1') {
    return createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `retry-policy-test-${randomUUID()}`,
    });
  }

  async function makePendingBooking(hour: string, centralAuthUserId = 'retry-owner-1') {
    const hold = await makeHold(hour, centralAuthUserId);
    const { booking } = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'Retry Owner',
      contactPhone: '01744444444',
      externalPetId: 'external-pet-1',
    });
    return booking;
  }

  describe('computePaymentDueAt (pure)', () => {
    it('is exactly SPAY_PENDING_PAYMENT_MINUTES after createdAt — the single source of truth for both the cleanup job and the client-shown countdown', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const due = computePaymentDueAt(createdAt);
      expect(due.getTime() - createdAt.getTime()).toBe(SPAY_PENDING_PAYMENT_MINUTES * 60_000);
    });
  });

  describe('expireStalePendingPaymentBooking (slot-release policy)', () => {
    it('cancels a stale pending_payment booking and releases its slot capacity back to the pool', async () => {
      // Clinic capacity at this hour is 3 (concurrentOperationCapacity) —
      // fill it completely with 3 pending_payment bookings so that whether
      // the slot is truly released hinges entirely on the one we expire.
      const filler1 = await makePendingBooking('03:00', 'retry-owner-stale-filler-1');
      const filler2 = await makePendingBooking('03:00', 'retry-owner-stale-filler-2');
      const booking = await makePendingBooking('03:00', 'retry-owner-stale-1');
      void filler1;
      void filler2;

      // Capacity is now fully occupied — confirm a 4th hold for the same
      // time is correctly refused before expiring anything (sanity check
      // that the "slot is free again" assertion below is actually meaningful).
      await expect(makeHold('03:00', 'retry-owner-stale-full-check')).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });

      // Backdate createdAt past the payment window, simulating time passing
      // without the advance ever being paid.
      const staleCreatedAt = new Date(Date.now() - (SPAY_PENDING_PAYMENT_MINUTES + 1) * 60_000);
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { createdAt: staleCreatedAt } });

      const expired = await expireStalePendingPaymentBooking(booking.id);
      expect(expired).toBe(true);

      const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe('cancelled_by_owner');
      expect(after.cancellationReasonCode).toBe('payment_failed');

      const history = await prisma.spayBookingStatusHistory.findFirst({
        where: { bookingId: booking.id, toStatus: 'cancelled_by_owner' },
      });
      expect(history).not.toBeNull();

      // Proof the slot is actually free again: exactly one of the three
      // occupying bookings was expired, and the (now-cancelled) booking is
      // excluded from the occupying set (OCCUPYING_BOOKING_STATUSES_EXCLUDED),
      // so a new hold for the exact same time — which was full a moment
      // ago — must now succeed.
      const newHold = await makeHold('03:00', 'retry-owner-stale-2');
      expect(newHold.status).toBe('active');
    });

    it('is a no-op for a booking that is not pending_payment (idempotent — a concurrent settlement/cancellation is never clobbered)', async () => {
      const booking = await makePendingBooking('03:30', 'retry-owner-stale-3');
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });

      const expired = await expireStalePendingPaymentBooking(booking.id);
      expect(expired).toBe(false);

      const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe('confirmed'); // untouched
    });

    it('returns false for an unknown bookingId instead of throwing (cleanup job must not crash on a stale/raced id)', async () => {
      await expect(expireStalePendingPaymentBooking(randomUUID())).resolves.toBe(false);
    });
  });

  describe('retrySpayBookingPayment (idempotent resume, never a second booking)', () => {
    it('rejects a caller who is not the booking owner', async () => {
      const booking = await makePendingBooking('04:00', 'retry-owner-a');
      await expect(retrySpayBookingPayment(booking.id, 'someone-else')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects retry for an already-confirmed booking (nothing left to pay online)', async () => {
      const booking = await makePendingBooking('04:15', 'retry-owner-b');
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });
      await expect(retrySpayBookingPayment(booking.id, 'retry-owner-b')).rejects.toMatchObject({ code: 'SPAY_BOOKING_NOT_PAYABLE' });
    });

    it('rejects retry once the payment window has expired, with a typed code (never the generic 500 banner)', async () => {
      const booking = await makePendingBooking('04:30', 'retry-owner-c');
      const staleCreatedAt = new Date(Date.now() - (SPAY_PENDING_PAYMENT_MINUTES + 1) * 60_000);
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { createdAt: staleCreatedAt } });

      await expect(retrySpayBookingPayment(booking.id, 'retry-owner-c')).rejects.toMatchObject({ code: 'SPAY_PAYMENT_WINDOW_EXPIRED' });
    });

    it('once the slot has actually been released (the cleanup job already expired the booking), retry refuses with a typed reschedule-required error instead of opening EPS', async () => {
      const booking = await makePendingBooking('04:37', 'retry-owner-c2');
      const staleCreatedAt = new Date(Date.now() - (SPAY_PENDING_PAYMENT_MINUTES + 1) * 60_000);
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { createdAt: staleCreatedAt } });

      const expired = await expireStalePendingPaymentBooking(booking.id);
      expect(expired).toBe(true);
      const released = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(released.status).toBe('cancelled_by_owner'); // slot released

      (isEPSConfigured as jest.Mock).mockReturnValue(true);
      await expect(retrySpayBookingPayment(booking.id, 'retry-owner-c2')).rejects.toMatchObject({ code: 'SPAY_BOOKING_NOT_PAYABLE' });
      expect(initializeEpsPayment).not.toHaveBeenCalled(); // never opens an EPS checkout for a released slot
    });

    it('returns a typed PAYMENT_GATEWAY_UNAVAILABLE error (not a generic crash) when EPS is not configured', async () => {
      const booking = await makePendingBooking('04:45', 'retry-owner-d');
      await expect(retrySpayBookingPayment(booking.id, 'retry-owner-d')).rejects.toMatchObject({
        code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        statusCode: 503,
      });
    });

    describe('with EPS configured', () => {
      // isEPSConfigured is deliberately flipped to true INSIDE each test,
      // after makePendingBooking() — not in a beforeEach — because
      // createBookingFromHold (called by makePendingBooking) checks EPS
      // configuration too. Flipping it before booking creation would make
      // the booking take the "EPS configured" branch instead of the
      // "paymentGatewayUnavailable" branch these tests are simulating
      // (a booking created while EPS was down, retried once it's back).

      it('creates exactly one Payment and one initiated SpayPaymentAttempt on first retry, and reuses the SAME booking (never a second one)', async () => {
        const booking = await makePendingBooking('05:00', 'retry-owner-e');
        expect(booking.paymentId).toBeNull(); // EPS was unconfigured at booking-creation time — no Payment yet

        (isEPSConfigured as jest.Mock).mockReturnValue(true);
        (initializeEpsPayment as jest.Mock).mockResolvedValue({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-1', TransactionId: 'tx-1' });
        const result = await retrySpayBookingPayment(booking.id, 'retry-owner-e');
        expect(result.paymentUrl).toBe('https://sandbox-pgapi.eps.com.bd/redirect/retry-1');
        expect(result.booking.id).toBe(booking.id);

        const bookingCount = await prisma.spayBooking.count({ where: { bookingNumber: booking.bookingNumber } });
        expect(bookingCount).toBe(1); // never duplicated

        const paymentCount = await prisma.payment.count({ where: { entityType: 'spay_booking', entityId: booking.id } });
        expect(paymentCount).toBe(1);

        const attempts = await prisma.spayPaymentAttempt.findMany({ where: { bookingId: booking.id } });
        expect(attempts).toHaveLength(1);
        expect(attempts[0].status).toBe('pending');
        expect(attempts[0].providerRef).toBe('https://sandbox-pgapi.eps.com.bd/redirect/retry-1');
      });

      it('a second "Retry Payment" call WITHOUT a matching idempotency key opens a brand new EPS transaction — it must never hand back a previous attempt\'s (possibly already-consumed) URL', async () => {
        // This is the exact defect that produced EPS's own "Invalid request!
        // Transaction ID has already been used" error: the old
        // implementation treated a still-"pending" attempt as reusable and
        // handed its redirect URL back unchanged. EPS marks a
        // merchantTransactionId consumed the moment its checkout page is
        // loaded, so re-serving that URL on a genuinely separate retry
        // reliably failed at EPS. Every eligible retry must now generate a
        // fresh attempt and a fresh EPS transaction, full stop.
        const booking = await makePendingBooking('05:15', 'retry-owner-f');

        (isEPSConfigured as jest.Mock).mockReturnValue(true);
        (initializeEpsPayment as jest.Mock)
          .mockResolvedValueOnce({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-2a', TransactionId: 'tx-2a' })
          .mockResolvedValueOnce({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-2b', TransactionId: 'tx-2b' });

        const first = await retrySpayBookingPayment(booking.id, 'retry-owner-f');
        const second = await retrySpayBookingPayment(booking.id, 'retry-owner-f');

        expect(second.paymentUrl).not.toBe(first.paymentUrl);
        expect(initializeEpsPayment).toHaveBeenCalledTimes(2); // each call is a genuinely new EPS transaction

        const firstCallTxnId = (initializeEpsPayment as jest.Mock).mock.calls[0][0].merchantTransactionId;
        const secondCallTxnId = (initializeEpsPayment as jest.Mock).mock.calls[1][0].merchantTransactionId;
        expect(firstCallTxnId).not.toBe(secondCallTxnId); // new unique EPS transaction ID per attempt

        const attempts = await prisma.spayPaymentAttempt.findMany({ where: { bookingId: booking.id }, orderBy: { createdAt: 'asc' } });
        expect(attempts).toHaveLength(2); // full attempt history retained for audit — never overwritten
        expect(attempts[0].status).toBe('failed'); // superseded, not silently left "pending" forever
        expect(attempts[1].status).toBe('pending'); // the live one
        expect(attempts[0].merchantTxnId).not.toBe(attempts[1].merchantTxnId);

        const paymentCount = await prisma.payment.count({ where: { entityType: 'spay_booking', entityId: booking.id } });
        expect(paymentCount).toBe(1); // still exactly one Payment row — never a second booking/payment
      });

      it('replaying the SAME idempotencyKey returns the SAME attempt without a second EPS call (double-tap safety)', async () => {
        const booking = await makePendingBooking('05:20', 'retry-owner-f2');

        (isEPSConfigured as jest.Mock).mockReturnValue(true);
        (initializeEpsPayment as jest.Mock).mockResolvedValue({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-key', TransactionId: 'tx-key' });

        const key = `retry-double-tap-${randomUUID()}`;
        const first = await retrySpayBookingPayment(booking.id, 'retry-owner-f2', key);
        const second = await retrySpayBookingPayment(booking.id, 'retry-owner-f2', key);

        expect(second.paymentUrl).toBe(first.paymentUrl);
        expect(initializeEpsPayment).toHaveBeenCalledTimes(1); // replay never re-hit EPS

        const attempts = await prisma.spayPaymentAttempt.count({ where: { bookingId: booking.id } });
        expect(attempts).toBe(1); // no duplicate attempt row for the same key

        // A DIFFERENT key (a later, genuinely new "Retry Payment" tap) still
        // opens a fresh attempt — the idempotency guarantee is scoped to the
        // key, not to the booking as a whole.
        (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-key-2', TransactionId: 'tx-key-2' });
        const third = await retrySpayBookingPayment(booking.id, 'retry-owner-f2', `retry-double-tap-${randomUUID()}`);
        expect(third.paymentUrl).not.toBe(first.paymentUrl);
        expect(initializeEpsPayment).toHaveBeenCalledTimes(2);
      });

      it('marks the attempt failed and throws PAYMENT_INITIATION_FAILED when EPS itself errors, and a following retry opens a fresh attempt', async () => {
        const booking = await makePendingBooking('05:30', 'retry-owner-g');

        (isEPSConfigured as jest.Mock).mockReturnValue(true);
        (initializeEpsPayment as jest.Mock).mockRejectedValueOnce(new Error('EPS sandbox unreachable'));
        await expect(retrySpayBookingPayment(booking.id, 'retry-owner-g')).rejects.toMatchObject({ code: 'PAYMENT_INITIATION_FAILED' });

        const failedAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { bookingId: booking.id } });
        expect(failedAttempt.status).toBe('failed');

        (initializeEpsPayment as jest.Mock).mockResolvedValue({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/retry-3', TransactionId: 'tx-3' });
        const retried = await retrySpayBookingPayment(booking.id, 'retry-owner-g');
        expect(retried.paymentUrl).toBe('https://sandbox-pgapi.eps.com.bd/redirect/retry-3');

        const attempts = await prisma.spayPaymentAttempt.count({ where: { bookingId: booking.id } });
        expect(attempts).toBe(2); // the failed attempt plus the new one — never overwritten, never a duplicate booking/payment
        const paymentCount = await prisma.payment.count({ where: { entityType: 'spay_booking', entityId: booking.id } });
        expect(paymentCount).toBe(1);
      });
    });
  });
});
