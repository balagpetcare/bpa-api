import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../../spay-neuter/spay-neuter.hold.service';
import { createBookingFromHold } from '../../spay-neuter/spay-neuter.booking.service';
import { settlePayment } from '../payments.service';

// End-to-end (real DB, mocked EPS SDK only) coverage of the ONE code path
// that is allowed to confirm a Spay & Neuter booking: settlePayment() in
// payments.service.ts, which always calls EPS's own CheckMerchantTransactionStatus
// via eps.service.getEPS().verifyPayment(...) — never trusts the callback's
// own query parameters. This is what the success/fail/cancel routes in
// payment-callbacks.router.ts and the /eps/ipn route both delegate to, so
// proving settlePayment() itself only confirms on a genuine EPS "Success"
// response, is idempotent, and enforces the exact BDT 500 amount covers all
// of those entry points at once.

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

// The real outbox enqueues a BullMQ job (see queue/queues.ts), which needs a
// live Redis connection this test environment doesn't have. Settlement
// correctness (the thing under test here) does not depend on notification
// delivery, so the queue boundary is mocked out — same principle as mocking
// Furtail above: mock at the real external-system boundary, not by
// reimplementing settlePayment's own logic.
jest.mock('../../push-notifications/outbox', () => ({
  publishOutboxEvent: jest.fn(async () => ({ id: 'mock-outbox-event', isNew: true })),
  enqueueIfNew: jest.fn(async () => undefined),
}));

const mockVerifyPayment = jest.fn();

jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => true),
  generateMerchantTxnId: jest.fn(() => `TESTSETTLE${Date.now()}${Math.floor(Math.random() * 1000)}`),
  initializeEpsPayment: jest.fn(async () => ({ RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/settle-test', TransactionId: 'tx-settle' })),
  getEPS: jest.fn(() => ({ verifyPayment: mockVerifyPayment })),
}));

describe('settlePayment — the single server-side verification gate for Spay & Neuter bookings', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Settle Test Org ${suffix}`, slug: `settle-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Settle Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'spay', durationMinutes: 40 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Settle Test Offer',
        slug: `settle-test-offer-${suffix}`,
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
      procedure: 'spay',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `settle-test-${randomUUID()}`,
    });
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'Settle Owner',
      contactPhone: '01755555555',
      externalPetId: 'external-pet-1',
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: result.booking.id } });
    return { booking: result.booking, payment };
  }

  it('never confirms on anything but a genuine EPS "Success" verify response — a callback query string alone proves nothing — but a routine Fail only terminates the attempt, keeping the booking pending_payment and its slot reserved', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('04:00', 'settle-owner-1');
    mockVerifyPayment.mockResolvedValue({ Status: 'Failed', TotalAmount: '500.00' });

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('failed');
    expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
    expect(mockVerifyPayment).toHaveBeenCalledWith(expect.objectContaining({ merchantTransactionId: payment.merchantTxnId }));

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).not.toBe('confirmed');
    // deactivateLinkedEntities -> cancelSpayBookingPayment: a normal EPS
    // Fail only terminates THIS payment attempt — the booking stays
    // pending_payment, keeps its id/reference, and keeps its slot until the
    // payment deadline or an explicit cancellation.
    expect(after.status).toBe('pending_payment');
    expect(after.id).toBe(booking.id);

    const afterPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('failed');
  });

  it('confirms the booking, applies exactly BDT 500 advance, and preserves amount due at clinic on a verified Success', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('05:00', 'settle-owner-2');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '500.00', EPSTransactionId: 'EPSTXNTEST0001' });

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('success');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('confirmed');
    expect(Number(after.advancePaidBdt)).toBe(500);
    expect(Number(after.balanceDueBdt)).toBe(1700); // Spay: 2200 total - 500 advance

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.epsTxnId).toBe('EPSTXNTEST0001');
  });

  it('is idempotent: a duplicate settlePayment call (callback replay / duplicate IPN) after success never re-verifies or re-applies the advance', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('06:00', 'settle-owner-3');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '500.00' });

    const first = await settlePayment(payment.merchantTxnId!);
    const afterFirst = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });

    const second = await settlePayment(payment.merchantTxnId!);
    const third = await settlePayment(payment.merchantTxnId!);
    const afterReplays = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });

    expect(first).toBe('success');
    expect(second).toBe('success');
    expect(third).toBe('success');
    expect(mockVerifyPayment).toHaveBeenCalledTimes(1); // replay never re-hits EPS — already-settled short-circuit
    expect(afterReplays.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime()); // genuinely untouched on replay
  });

  it('rejects a gateway-confirmed amount that does not match the requested BDT 500 advance — booking stays pending_payment even though EPS reported Success', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('07:00', 'settle-owner-4');
    mockVerifyPayment.mockResolvedValue({ Status: 'Success', TotalAmount: '499.00' }); // tampered/mismatched amount

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('success'); // Payment row itself is marked success (EPS said so)...

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    // ...but settleSpayBookingPayment's amount-integrity check refuses to
    // confirm the BOOKING on a mismatch — left pending_payment for manual review.
    expect(after.status).toBe('pending_payment');
    expect(Number(after.advancePaidBdt)).toBe(0);
  });

  it('marks the attempt cancelled on an EPS "Cancelled" verify response, without ever calling it confirmed — and without cancelling the booking or releasing its slot', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('08:00', 'settle-owner-5');
    mockVerifyPayment.mockResolvedValue({ Status: 'Cancelled' });

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('cancelled');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment'); // booking unaffected — only the attempt/Payment are cancelled

    const afterPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('cancelled');
  });

  it('returns "pending" (never "success") when the EPS verify call itself fails/times out — network trouble is not payment success', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('09:00', 'settle-owner-6');
    mockVerifyPayment.mockRejectedValue(new Error('ECONNRESET'));

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('pending');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment'); // untouched — never silently confirmed on a network error
  });

  it('flags an unrecognized/unknown EPS status as pending_review rather than guessing success or failure', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('10:00', 'settle-owner-7');
    mockVerifyPayment.mockResolvedValue({ Status: 'SomeUnknownEpsStatus' });

    const result = await settlePayment(payment.merchantTxnId!);
    expect(result).toBe('pending_review');

    const after = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('pending_payment');
  });
});
