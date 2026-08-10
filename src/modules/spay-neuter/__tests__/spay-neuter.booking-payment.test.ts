import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold, settleSpayBookingPayment, cancelSpayBookingPayment } from '../spay-neuter.booking.service';
import { cancelBookingByOwner } from '../spay-neuter.cancellation.service';
import { isEPSConfigured } from '../../../services/eps.service';

// Furtail (/me/pets) is an external service unreachable from this test
// environment — mocked here exactly at the boundary
// createBookingFromHold uses it (ownership verification only), so the rest
// of the booking/payment pipeline runs for real against the local dev DB.
jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

import { getFurtailPet } from '../../me/furtail-pets.client';

// EPS itself is mocked at the same boundary, exactly like every sibling
// spay-neuter test file (spay-neuter.retry-fresh-attempt.test.ts,
// spay-neuter.payment-pending-policy.test.ts) — this environment has
// EPS_ENABLED=true/real credentials configured (see .env), so leaving it
// unmocked makes createBookingFromHold place a REAL HTTP call to the EPS
// sandbox on every single call in this file, which the restriction "do not
// initiate a real or sandbox payment" forbids outright, and which also
// hangs indefinitely in a network-restricted test environment. Mocking
// isEPSConfigured to `true` keeps `result.paymentGatewayUnavailable` (which
// tests below assert equals `!isEPSConfigured()`) exercising the same
// "EPS configured" branch every environment with real EPS credentials would
// take, without ever leaving this process.
jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => true),
  generateMerchantTxnId: jest.fn(() => `TESTBP${Date.now()}${Math.floor(Math.random() * 100000)}`),
  initializeEpsPayment: jest.fn(async () => ({
    RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/booking-payment-test',
    TransactionId: 'tx-booking-payment-test',
  })),
}));

// The explicit-cancellation test below calls cancelBookingByOwner, which
// (via spay-neuter.notifications.ts) enqueues a BullMQ job — see the
// identical mock/comment in payments.service.spay-settlement.test.ts. This
// test environment has no live Redis wired up for the queue client's
// expected config, so leaving this unmocked hangs indefinitely rather than
// erroring. Cancellation/slot-release correctness (what's under test) does
// not depend on notification delivery.
jest.mock('../../push-notifications/outbox', () => ({
  publishOutboxEvent: jest.fn(async () => ({ id: 'mock-outbox-event', isNew: true })),
  enqueueIfNew: jest.fn(async () => undefined),
}));

describe('spay-neuter booking + EPS advance-payment workflow', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Pay Test Org ${suffix}`, slug: `pay-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Pay Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Pay Test Offer',
        slug: `pay-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 2 },
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

  async function makeHold(hour: string, centralAuthUserId = 'owner-1') {
    return createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `booking-test-${randomUUID()}`,
    });
  }

  it('creates a pending_payment booking from a hold, with server-computed price snapshot (advance is part of, not additive to, the total)', async () => {
    const hold = await makeHold('04:00');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'owner-1',
      authToken: 'Bearer test-token',
      contactName: 'Owner One',
      contactPhone: '01711111111',
      externalPetId: 'external-pet-1',
      petNameSnapshot: 'Tommy',
      speciesSnapshot: 'dog',
      wasAlreadyNeuteredSnapshot: false,
    });

    expect(getFurtailPet).toHaveBeenCalledWith('Bearer test-token', 'external-pet-1');
    expect(result.booking.status).toBe('pending_payment');
    expect(Number(result.booking.totalPriceBdt)).toBe(2000);
    // balanceDueBdt is the fixed "remaining at clinic" figure, known from
    // creation (total - the REQUIRED advance) — not total - advancePAID
    // (which is 0 pre-confirmation and would wrongly show the full total as
    // still owed at the clinic on top of the advance). See advanceRequiredBdt/
    // balanceDueBdt's field docs on createBookingFromHold.
    expect(Number(result.booking.balanceDueBdt)).toBe(1500); // 2000 total - 500 advance
    expect(result.booking.bookingCode).toHaveLength(12);
    expect(result.booking.qrToken).toHaveLength(64); // HMAC-SHA256 hex
    expect(result.paymentGatewayUnavailable).toBe(!isEPSConfigured());

    const hold2 = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(hold2.status).toBe('converted');

    const pet = await prisma.spayBookingPet.findFirstOrThrow({ where: { bookingId: result.booking.id } });
    expect(pet.externalPetId).toBe('external-pet-1');

    const history = await prisma.spayBookingStatusHistory.findMany({ where: { bookingId: result.booking.id } });
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe('pending_payment');
  });

  it('allows a neuter booking for a pet recorded as male', async () => {
    const hold = await makeHold('05:15');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'owner-1',
      authToken: 'Bearer test-token',
      contactName: 'Owner One',
      contactPhone: '01711111111',
      externalPetId: 'external-pet-1',
      sexSnapshot: 'male',
    });
    expect(result.booking.status).toBe('pending_payment');
  });

  it('PET_SEX_SERVICE_MISMATCH: rejects a neuter booking for a pet recorded as female', async () => {
    const hold = await makeHold('05:30');
    await expect(
      createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-1',
        authToken: 'Bearer test-token',
        contactName: 'Owner One',
        contactPhone: '01711111111',
        externalPetId: 'external-pet-1',
        sexSnapshot: 'female',
      }),
    ).rejects.toMatchObject({ code: 'PET_SEX_SERVICE_MISMATCH' });

    // The hold must remain usable — a sex-mismatch rejection must not burn the hold or the capacity it reserved.
    const stillActive = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(stillActive.status).toBe('active');
  });

  it('rejects booking creation when pet ownership cannot be verified', async () => {
    (getFurtailPet as jest.Mock).mockRejectedValueOnce(new Error('404 not found'));
    const hold = await makeHold('05:00');

    await expect(
      createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-1',
        authToken: 'Bearer bad-token',
        contactName: 'Owner One',
        contactPhone: '01711111111',
        externalPetId: 'not-owned-pet',
      }),
    ).rejects.toMatchObject({ code: 'SPAY_PET_OWNERSHIP_UNVERIFIED' });

    // The hold must remain usable — a failed ownership check must not burn the hold.
    const stillActive = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(stillActive.status).toBe('active');
  });

  describe('payment settlement (simulating what settlePayment() calls after a server-verified EPS callback)', () => {
    async function makePendingBookingWithPayment(hour: string) {
      const hold = await makeHold(hour, 'owner-2');
      const { booking } = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-2',
        authToken: 'Bearer test-token',
        contactName: 'Owner Two',
        contactPhone: '01722222222',
        externalPetId: 'external-pet-1',
      });
      // createBookingFromHold already created its own Payment+Attempt (EPS
      // is mocked as configured above) — deliberately superseded here with
      // a fresh, independently-controlled Payment row (booking.paymentId
      // repointed below) so this fixture's Payment.status/payload are exactly
      // what each settlement test needs, regardless of what the mocked EPS
      // init call returned.
      const payment = await prisma.payment.create({
        data: {
          gateway: 'eps',
          merchantTxnId: `TEST${randomUUID().replace(/-/g, '').slice(0, 13)}`,
          amount: 500,
          currency: 'BDT',
          purpose: 'spay_neuter_advance',
          entityType: 'spay_booking',
          entityId: booking.id,
          status: 'success',
        },
      });
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { paymentId: payment.id } });
      return { booking, payment };
    }

    // Distinct from makePendingBookingWithPayment above (which pre-seeds
    // Payment.status as 'success' purely as an inert placeholder for the
    // settlement tests, which never gate on it): the fail/cancel tests below
    // exercise cancelSpayBookingPayment's own Payment.status transition, so
    // this fixture needs a genuinely still-open ('pending') Payment and a
    // matching live SpayPaymentAttempt — exactly what createBookingFromHold
    // would have produced had EPS been configured.
    async function makePendingBookingWithLivePayment(hour: string) {
      const hold = await makeHold(hour, 'owner-3');
      const { booking } = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-3',
        authToken: 'Bearer test-token',
        contactName: 'Owner Three',
        contactPhone: '01733333333',
        externalPetId: 'external-pet-1',
      });
      const merchantTxnId = `TEST${randomUUID().replace(/-/g, '').slice(0, 13)}`;
      const payment = await prisma.payment.create({
        data: {
          gateway: 'eps',
          merchantTxnId,
          amount: 500,
          currency: 'BDT',
          purpose: 'spay_neuter_advance',
          entityType: 'spay_booking',
          entityId: booking.id,
          status: 'pending',
        },
      });
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { paymentId: payment.id } });
      await prisma.spayPaymentAttempt.create({
        data: { bookingId: booking.id, paymentId: payment.id, gateway: 'eps', merchantTxnId, amountBdt: 500, status: 'pending' },
      });
      return { booking, payment };
    }

    it('PAYMENT_AMOUNT_MISMATCH: leaves the booking pending_payment when the gateway-confirmed amount does not match the requested advance', async () => {
      const hold = await makeHold('06:30', 'owner-2');
      const { booking } = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-2',
        authToken: 'Bearer test-token',
        contactName: 'Owner Two',
        contactPhone: '01722222222',
        externalPetId: 'external-pet-1',
      });
      // Requested advance is 500, but the persisted EPS verify payload
      // (as settlePayment() would have written via updatePaymentStatus)
      // claims a different confirmed amount — a gateway integrity failure.
      const payment = await prisma.payment.create({
        data: {
          gateway: 'eps',
          merchantTxnId: `TEST${randomUUID().replace(/-/g, '').slice(0, 13)}`,
          amount: 500,
          currency: 'BDT',
          purpose: 'spay_neuter_advance',
          entityType: 'spay_booking',
          entityId: booking.id,
          status: 'success',
          payload: { TotalAmount: '999.00' },
        },
      });
      await prisma.spayBooking.update({ where: { id: booking.id }, data: { paymentId: payment.id } });

      await settleSpayBookingPayment(payment.id);

      const stillPending = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stillPending.status).toBe('pending_payment');
      expect(Number(stillPending.advancePaidBdt)).toBe(0);
    });

    it('confirms the booking and applies the advance exactly (remaining = total - advance)', async () => {
      const { booking, payment } = await makePendingBookingWithPayment('06:00');

      await settleSpayBookingPayment(payment.id);

      const confirmed = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(confirmed.status).toBe('confirmed');
      expect(Number(confirmed.advancePaidBdt)).toBe(500);
      expect(Number(confirmed.balanceDueBdt)).toBe(1500); // 2000 total - 500 advance
      expect(Number(confirmed.advancePaidBdt) + Number(confirmed.balanceDueBdt)).toBe(Number(confirmed.totalPriceBdt));
    });

    it('duplicate callback processing does not create duplicate bookings, payments, or double-apply the advance', async () => {
      const { booking, payment } = await makePendingBookingWithPayment('07:00');

      await settleSpayBookingPayment(payment.id);
      const afterFirst = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });

      // Simulate the callback firing again (IPN retry, browser back-button replay, etc).
      await settleSpayBookingPayment(payment.id);
      await settleSpayBookingPayment(payment.id);
      const afterReplays = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });

      expect(afterReplays.status).toBe('confirmed');
      expect(Number(afterReplays.advancePaidBdt)).toBe(Number(afterFirst.advancePaidBdt));
      expect(afterReplays.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime()); // no-op after the first — row genuinely untouched

      const bookingsForPayment = await prisma.spayBooking.count({ where: { paymentId: payment.id } });
      expect(bookingsForPayment).toBe(1); // exactly one booking, never duplicated

      const history = await prisma.spayBookingStatusHistory.count({ where: { bookingId: booking.id, toStatus: 'confirmed' } });
      expect(history).toBe(1); // exactly one history row, not three
    });

    it('EPS FAIL: a failed payment attempt keeps the booking pending_payment and its slot reserved (no whole-booking cancellation)', async () => {
      // Clinic capacity at this hour is 2 (concurrentOperationCapacity) — a
      // filler booking occupies the other slot so the SPAY_SLOT_FULL check
      // below is only satisfied if the booking under test STILL occupies
      // its own slot too (not just coincidentally full from the filler).
      const fillerHold = await makeHold('08:00', 'owner-2-filler');
      await createBookingFromHold({
        holdId: fillerHold.id,
        centralAuthUserId: 'owner-2-filler',
        authToken: 'Bearer test-token',
        contactName: 'Filler Owner',
        contactPhone: '01700000001',
        externalPetId: 'external-pet-1',
      });
      const { booking, payment } = await makePendingBookingWithLivePayment('08:00');

      await cancelSpayBookingPayment(payment.id, payment.merchantTxnId ?? undefined, 'failed');

      const stillPending = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stillPending.status).toBe('pending_payment');
      expect(stillPending.id).toBe(booking.id); // same booking id
      expect(stillPending.bookingNumber).toBe(booking.bookingNumber); // same booking reference

      const failedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(failedPayment.status).toBe('failed');

      const attempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });
      expect(attempt.status).toBe('failed');

      // The slot is still occupied — a new hold for the same time must be refused.
      await expect(makeHold('08:00')).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });
    });

    it('EPS CANCEL: a cancelled payment attempt keeps the booking pending_payment and its slot reserved (no whole-booking cancellation)', async () => {
      const fillerHold = await makeHold('08:40', 'owner-2-filler2');
      await createBookingFromHold({
        holdId: fillerHold.id,
        centralAuthUserId: 'owner-2-filler2',
        authToken: 'Bearer test-token',
        contactName: 'Filler Owner 2',
        contactPhone: '01700000002',
        externalPetId: 'external-pet-1',
      });
      const { booking, payment } = await makePendingBookingWithLivePayment('08:40');

      await cancelSpayBookingPayment(payment.id, payment.merchantTxnId ?? undefined, 'cancelled');

      const stillPending = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stillPending.status).toBe('pending_payment');

      const cancelledPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(cancelledPayment.status).toBe('cancelled');

      const attempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });
      expect(attempt.status).toBe('cancelled');

      await expect(makeHold('08:40')).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });
    });

    it('is idempotent in the same way on the fail/cancel path — a repeated callback never changes the booking', async () => {
      const { booking, payment } = await makePendingBookingWithLivePayment('09:00');
      await cancelSpayBookingPayment(payment.id, payment.merchantTxnId ?? undefined, 'failed');
      const afterFirst = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(afterFirst.status).toBe('pending_payment');
      await cancelSpayBookingPayment(payment.id, payment.merchantTxnId ?? undefined, 'failed');
      const afterSecond = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(afterSecond.status).toBe('pending_payment');
      expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime());
    });
  });

  describe('explicit owner cancellation — slot release (distinct from a routine EPS Fail/Cancel)', () => {
    it('releases the slot immediately — unlike an EPS Fail/Cancel, an explicit cancellation DOES free capacity right away', async () => {
      // Fill the 2-capacity clinic at this hour with two bookings, then
      // cancel one explicitly — proving that path (unlike cancelSpayBookingPayment
      // on a routine gateway result) really does release the slot.
      const filler = await makeHold('10:00', 'owner-cancel-filler');
      await createBookingFromHold({
        holdId: filler.id,
        centralAuthUserId: 'owner-cancel-filler',
        authToken: 'Bearer test-token',
        contactName: 'Filler Owner',
        contactPhone: '01799999999',
        externalPetId: 'external-pet-1',
      });
      const hold = await makeHold('10:00', 'owner-cancel-target');
      const { booking } = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-cancel-target',
        authToken: 'Bearer test-token',
        contactName: 'Target Owner',
        contactPhone: '01788888888',
        externalPetId: 'external-pet-1',
      });

      // Capacity is now full at this hour.
      await expect(makeHold('10:00', 'owner-cancel-full-check')).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });

      const { booking: cancelled } = await cancelBookingByOwner({ bookingId: booking.id, centralAuthUserId: 'owner-cancel-target' });
      expect(cancelled.status).toBe('cancelled_by_owner');

      // The slot is free again — a new hold for the same time must now succeed.
      const newHold = await makeHold('10:00', 'owner-cancel-after-release');
      expect(newHold.status).toBe('active');
    });
  });
});
