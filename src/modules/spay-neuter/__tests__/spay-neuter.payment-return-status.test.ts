import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold, getOwnedSpayPaymentReturnStatus, reconcileOwnedSpayBookingPayment } from '../spay-neuter.booking.service';
import { computePaymentDueAt } from '../spay-neuter.domain';

// Covers GET /me/spay-neuter/payments/:ref/status — the authoritative,
// owner-scoped lookup the new /spay-neuter/payment/return web page calls.
// Regression target: this must NEVER let a caller learn about another
// user's payment (cross-user denial), must NEVER trust a merely-pending
// Payment row without re-verifying via the same idempotent settlePayment()
// path the callbacks use, and must reflect a genuine BDT 500 verified
// advance as 'verified_success' — nothing less.

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

const mockVerifyPayment = jest.fn();

jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => true),
  generateMerchantTxnId: jest.fn(() => `TESTRETSTAT${Date.now()}${Math.floor(Math.random() * 1000)}`),
  initializeEpsPayment: jest.fn(async () => ({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/ret-status-test', TransactionId: 'tx-ret-status' })),
  getEPS: jest.fn(() => ({ verifyPayment: mockVerifyPayment })),
}));

jest.mock('../../push-notifications/outbox', () => ({
  publishOutboxEvent: jest.fn(async () => ({ id: 'mock-outbox-event', isNew: true })),
  enqueueIfNew: jest.fn(async () => undefined),
}));

describe('getOwnedSpayPaymentReturnStatus', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `RetStatus Test Org ${suffix}`, slug: `retstatus-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'RetStatus Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'RetStatus Test Offer',
        slug: `retstatus-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 1500,
        spayTotalPriceBdt: 2200,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 3 },
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
    mockVerifyPayment.mockReset();
  });

  async function makePendingBookingWithPayment(hour: string, centralAuthUserId: string) {
    const hold = await createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `retstatus-test-${randomUUID()}`,
    });
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'RetStatus Owner',
      contactPhone: '01766666666',
      externalPetId: 'external-pet-1',
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: result.booking.id } });
    return { booking: result.booking, payment };
  }

  it('9. denies cross-user lookup with the SAME safe not_found outcome as a genuinely unknown reference (no existence leak)', async () => {
    const { payment } = await makePendingBookingWithPayment('06:00', 'retstatus-owner-a');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '500.00' });

    const wrongUserResult = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'a-completely-different-user');
    expect(wrongUserResult).toEqual({ outcome: 'not_found', terminal: true, bookingId: null, bookingNumber: null, paymentDueAt: null });
  });

  it('10. an entirely unknown reference shows the same safe not_found outcome', async () => {
    const result = await getOwnedSpayPaymentReturnStatus('99999999999999999', 'retstatus-owner-a');
    expect(result).toEqual({ outcome: 'not_found', terminal: true, bookingId: null, bookingNumber: null, paymentDueAt: null });
  });

  it('6. verified BDT 500 payment (already settled) returns verified_success with booking details and correct amount due at clinic', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('06:15', 'retstatus-owner-b');
    // Simulate the callback having already settled this payment (status already 'success').
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success' } });
    await prisma.spayBooking.update({
      where: { id: booking.id },
      data: { status: 'confirmed', advancePaidBdt: 500, balanceDueBdt: 1000 }, // Neuter: 1500 - 500
    });

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-b');
    expect(result.outcome).toBe('verified_success');
    if (result.outcome === 'verified_success') {
      expect(result.booking.bookingNumber).toBe(booking.bookingNumber);
      expect(result.booking.advancePaidBdt).toBe(500);
      expect(result.booking.balanceDueBdt).toBe(1000);
    }
    // Consistent contract fields present on every outcome.
    expect(result.terminal).toBe(true);
    expect(result.bookingId).toBe(booking.id);
    expect(result.bookingNumber).toBe(booking.bookingNumber);
    expect(result.paymentDueAt).toBeNull(); // confirmed — no deadline left to show
    expect(mockVerifyPayment).not.toHaveBeenCalled(); // already-settled — never re-hits EPS
  });

  it('7. re-verifies a still-pending payment via the real settlement path and reports "pending" if EPS has no verdict yet', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('06:30', 'retstatus-owner-c');
    mockVerifyPayment.mockRejectedValue(new Error('ECONNRESET')); // EPS unreachable — settlePayment() returns 'pending'

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-c');
    expect(result.outcome).toBe('pending');
    if (result.outcome === 'pending') {
      expect(result.retryableBookingId).toBe(booking.id);
      expect(result.totalPriceBdt).toBe(1500); // neuter
      expect(result.advancePaidBdt).toBe(0);
      expect(result.balanceDueBdt).toBe(1000);
    }
    expect(result.terminal).toBe(false); // still bounded-poll-eligible
    expect(result.bookingId).toBe(booking.id);
    expect(result.bookingNumber).toBe(booking.bookingNumber);
    const freshBooking = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(result.paymentDueAt).toBe(computePaymentDueAt(freshBooking.createdAt).toISOString());
    expect(mockVerifyPayment).toHaveBeenCalledTimes(1); // DID attempt a fresh, authoritative re-check
  });

  it('a payment EPS flagged for manual review reports the distinct pending_review outcome, never plain pending, and offers no Retry', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('06:37', 'retstatus-owner-review');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'pending_review' } });

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-review');
    expect(result.outcome).toBe('pending_review');
    expect(result.terminal).toBe(false);
    expect(result).not.toHaveProperty('retryableBookingId');
    if (result.outcome === 'pending_review') {
      expect(result.totalPriceBdt).toBe(1500);
    }
    expect(result.bookingId).toBe(booking.id);
    expect(mockVerifyPayment).not.toHaveBeenCalled(); // payment.status !== 'pending' — no re-verify needed
  });

  it('re-verifies and reports verified_success when EPS newly confirms a previously-pending payment', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('06:45', 'retstatus-owner-d');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '500.00' });

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-d');
    expect(result.outcome).toBe('verified_success');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('confirmed');
  });

  it('8. a cancelled payment attempt never reports verified_success, but the booking stays pending_payment/payable and offers Retry Payment', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('07:00', 'retstatus-owner-e');
    mockVerifyPayment.mockResolvedValue({ Status: 'Cancelled' });

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-e');
    // A routine EPS Cancel on a live attempt only ever terminates that
    // attempt (see cancelSpayBookingPayment) — the booking itself is never
    // cancelled while still within its payment deadline, so the return
    // page must offer Retry Payment via retryableBookingId, never the
    // terminal 'cancelled' outcome (that outcome is reserved for a booking
    // whose slot has genuinely been released — deadline expiry or an
    // explicit cancellation).
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.retryableBookingId).toBe(booking.id);
    }
    expect(result.terminal).toBe(true); // this ATTEMPT is done, even though the booking itself stays retryable
    expect(result.bookingId).toBe(booking.id);

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).not.toBe('confirmed');
    expect(after.status).toBe('pending_payment');
  });

  it('a booking whose payment deadline has already expired reports the terminal cancelled outcome with no retryableBookingId', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('07:05', 'retstatus-owner-expired');
    const { expireStalePendingPaymentBooking } = await import('../spay-neuter.booking.service');
    await prisma.spayBooking.update({ where: { id: booking.id }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    const expired = await expireStalePendingPaymentBooking(booking.id);
    expect(expired).toBe(true);

    // Payment.status is still 'pending' post-expiry (expireStalePendingPaymentBooking
    // only resolves the ATTEMPT rows, never re-verifies with EPS) — the
    // return-status lookup re-verifies it via the same settlePayment path a
    // real callback uses; give it a definite EPS verdict so that re-verify
    // resolves deterministically rather than hitting the network.
    mockVerifyPayment.mockResolvedValue({ Status: 'Failed' });

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-expired');
    expect(result.outcome).toBe('cancelled');
    expect(result).not.toHaveProperty('retryableBookingId');
    expect(result.terminal).toBe(true);
    expect(result.bookingId).toBe(booking.id);
    expect(result.bookingNumber).toBe(booking.bookingNumber);
    expect(result.paymentDueAt).toBeNull(); // slot released — no deadline left to show
  });

  it('12. an amount mismatch (tampered/incorrect gateway-confirmed amount) never reports verified_success even though EPS said Success', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('07:15', 'retstatus-owner-f');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '1.00' }); // tampered amount

    const result = await getOwnedSpayPaymentReturnStatus(payment.merchantTxnId!, 'retstatus-owner-f');
    expect(result.outcome).not.toBe('verified_success');
    expect(result.outcome).toBe('pending'); // booking stays pending_payment for manual review; Payment itself is 'success' but booking never confirmed

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment');
    expect(Number(after.advancePaidBdt)).toBe(0);
  });

  it('can be looked up by the EPS transaction id too (findFirst OR clause), not only the merchant transaction id', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('07:30', 'retstatus-owner-g');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success', epsTxnId: 'EPSTXN-LOOKUP-TEST' } });
    await prisma.spayBooking.update({ where: { id: booking.id }, data: { status: 'confirmed', advancePaidBdt: 500, balanceDueBdt: 1000 } });

    const result = await getOwnedSpayPaymentReturnStatus('EPSTXN-LOOKUP-TEST', 'retstatus-owner-g');
    expect(result.outcome).toBe('verified_success');
  });
});

// Regression coverage for GET /me/spay-neuter/bookings/:bookingId/verify-status
// — the mobile app's polling loop root cause fix: a payment that genuinely
// succeeded/failed/cancelled at EPS but whose callback never reached this
// backend (unreachable BACKEND_URL from a device/emulator's WebView, a
// dropped webhook) must not be shown as "pending payment" forever. This is
// the SAME re-verify mechanism as getOwnedSpayPaymentReturnStatus above,
// just keyed by bookingId (which the mobile app always has) instead of
// merchantTxnId.
describe('reconcileOwnedSpayBookingPayment', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Reconcile Test Org ${suffix}`, slug: `reconcile-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Reconcile Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Reconcile Test Offer',
        slug: `reconcile-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 1500,
        spayTotalPriceBdt: 2200,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 3 },
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
    mockVerifyPayment.mockReset();
  });

  async function makePendingBooking(hour: string, centralAuthUserId: string) {
    const hold = await createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `reconcile-test-${randomUUID()}`,
    });
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'Reconcile Owner',
      contactPhone: '01755555555',
      externalPetId: 'external-pet-1',
    });
    return result.booking;
  }

  it('actively re-verifies a stuck-pending payment and returns the booking as confirmed once EPS says Success — never left showing pending forever', async () => {
    const booking = await makePendingBooking('08:00', 'reconcile-owner-a');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '500.00' });

    const before = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(before.status).toBe('pending_payment'); // no callback ever landed — this is the exact bug scenario

    await reconcileOwnedSpayBookingPayment(booking.id, 'reconcile-owner-a');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('confirmed');
    expect(Number(after.advancePaidBdt)).toBe(500);
    expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
  });

  it('a booking with a linked payment already resolved (failed) is not re-queried against EPS again', async () => {
    const booking = await makePendingBooking('08:15', 'reconcile-owner-b');
    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: booking.id } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });

    await reconcileOwnedSpayBookingPayment(booking.id, 'reconcile-owner-b');

    expect(mockVerifyPayment).not.toHaveBeenCalled();
    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment'); // still payable — Retry Payment stays available
  });

  it('cross-user access is rejected — never leaks or mutates another owner\'s booking', async () => {
    const booking = await makePendingBooking('08:30', 'reconcile-owner-c');
    await expect(reconcileOwnedSpayBookingPayment(booking.id, 'a-different-user')).rejects.toMatchObject({ statusCode: 403 });
    expect(mockVerifyPayment).not.toHaveBeenCalled();
  });

  it('an unknown bookingId is a 404, not a crash', async () => {
    await expect(reconcileOwnedSpayBookingPayment(randomUUID(), 'reconcile-owner-a')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a network/EPS error during re-verification never invents a result — booking stays pending_payment, no crash', async () => {
    const booking = await makePendingBooking('08:45', 'reconcile-owner-d');
    mockVerifyPayment.mockRejectedValue(new Error('ECONNRESET'));

    await reconcileOwnedSpayBookingPayment(booking.id, 'reconcile-owner-d');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment');
  });
});
