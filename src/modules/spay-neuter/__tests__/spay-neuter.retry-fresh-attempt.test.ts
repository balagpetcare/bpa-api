import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import {
  createBookingFromHold,
  retrySpayBookingPayment,
  settleSpayBookingPayment,
  cancelSpayBookingPayment,
} from '../spay-neuter.booking.service';

// Covers the specific defect report: EPS returned "Invalid request!
// Transaction ID has already been used" when Retry Payment reopened
// checkout using a previously-consumed EPS transaction ID. These tests
// prove each eligible retry — regardless of whether the PRIOR attempt is
// cancelled, failed, or was never resolved — creates a fresh
// SpayPaymentAttempt with its own unique merchantTxnId, on the SAME
// booking, for the SAME BDT 500 advance, and that a late callback for a
// superseded attempt can never wrongly cancel a booking a newer attempt
// might still confirm.

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => true),
  generateMerchantTxnId: jest.fn(() => `TESTFRESH${Date.now()}${Math.floor(Math.random() * 100000)}`),
  initializeEpsPayment: jest.fn(),
}));

import { initializeEpsPayment } from '../../../services/eps.service';

describe('spay-neuter retry payment — fresh attempt per eligible retry', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 7 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Fresh Attempt Org ${suffix}`, slug: `fresh-attempt-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Fresh Attempt Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 5 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Fresh Attempt Offer',
        slug: `fresh-attempt-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 1500,
        spayTotalPriceBdt: 2200,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 5 },
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
    (initializeEpsPayment as jest.Mock).mockReset();
  });

  async function makePendingBookingWithPayment(hour: string, centralAuthUserId: string) {
    const hold = await createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `fresh-attempt-hold-${randomUUID()}`,
    });
    (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({
      RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/initial',
      TransactionId: 'tx-initial',
    });
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'Fresh Attempt Owner',
      contactPhone: '01766666666',
      externalPetId: 'external-pet-1',
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: result.booking.id } });
    return { booking: result.booking, payment };
  }

  it('first attempt CANCELLED — retry creates a new attempt with a new transaction ID, same booking, same BDT 500', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('03:00', 'fresh-owner-cancelled');
    const initialAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });
    await prisma.spayPaymentAttempt.update({ where: { id: initialAttempt.id }, data: { status: 'cancelled' } });

    (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({
      RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/after-cancel',
      TransactionId: 'tx-after-cancel',
    });
    const result = await retrySpayBookingPayment(booking.id, 'fresh-owner-cancelled');

    expect(result.booking.id).toBe(booking.id); // same booking
    expect(result.booking.bookingNumber).toBe(booking.bookingNumber); // same reference
    expect(result.paymentUrl).toBe('https://sandbox-pgapi.eps.com.bd/redirect/after-cancel');

    const attempts = await prisma.spayPaymentAttempt.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: 'asc' } });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].merchantTxnId).not.toBe(attempts[1].merchantTxnId); // new unique EPS transaction ID
    expect(attempts[1].status).toBe('pending');
    expect(Number(attempts[0].amountBdt)).toBe(500);
    expect(Number(attempts[1].amountBdt)).toBe(500); // BDT 500 unchanged across attempts

    const bookingCount = await prisma.spayBooking.count({ where: { bookingNumber: booking.bookingNumber } });
    expect(bookingCount).toBe(1); // retry never creates a second booking
  });

  it('first attempt FAILED — retry creates a new attempt with a new transaction ID', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('03:20', 'fresh-owner-failed');
    const initialAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });
    await prisma.spayPaymentAttempt.update({ where: { id: initialAttempt.id }, data: { status: 'failed' } });

    (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({
      RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/after-fail',
      TransactionId: 'tx-after-fail',
    });
    const result = await retrySpayBookingPayment(booking.id, 'fresh-owner-failed');

    expect(result.booking.id).toBe(booking.id);
    const attempts = await prisma.spayPaymentAttempt.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: 'asc' } });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].merchantTxnId).not.toBe(attempts[1].merchantTxnId);
    expect(attempts[0].status).toBe('failed'); // untouched — original failure reason preserved for audit
    expect(attempts[1].status).toBe('pending');
  });

  it('a late FAIL callback for an OLDER, superseded attempt never cancels a booking a newer attempt might still confirm', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('03:40', 'fresh-owner-late-fail');
    const olderAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });

    (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({
      RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/newer-live',
      TransactionId: 'tx-newer-live',
    });
    await retrySpayBookingPayment(booking.id, 'fresh-owner-late-fail'); // creates the newer, live attempt

    // The OLDER attempt's own callback finally arrives, reporting failure —
    // this must be recorded on that attempt only, never cancel the booking.
    await cancelSpayBookingPayment(payment.id, olderAttempt.merchantTxnId, 'failed');

    const afterLateFail = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(afterLateFail.status).toBe('pending_payment'); // untouched — a newer attempt is still live

    const staleAttempt = await prisma.spayPaymentAttempt.findUniqueOrThrow({ where: { merchantTxnId: olderAttempt.merchantTxnId } });
    expect(staleAttempt.status).toBe('failed'); // recorded on the specific stale attempt

    const newerAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({
      where: { paymentId: payment.id, merchantTxnId: { not: olderAttempt.merchantTxnId } },
    });
    expect(newerAttempt.status).toBe('pending'); // untouched by the older attempt's late failure

    // The newer, live attempt then genuinely succeeds — the booking must
    // still be confirmable (a late failure from an old attempt must never
    // have poisoned Payment.status against a real later success).
    await settleSpayBookingPayment(payment.id, newerAttempt.merchantTxnId);
    const confirmed = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe('confirmed');
    expect(Number(confirmed.advancePaidBdt)).toBe(500);
  });

  it('a late SUCCESS callback for an OLDER attempt still confirms the booking (any genuine success counts) and does not double-confirm on replay', async () => {
    const { booking, payment } = await makePendingBookingWithPayment('04:00', 'fresh-owner-late-success');
    const olderAttempt = await prisma.spayPaymentAttempt.findFirstOrThrow({ where: { paymentId: payment.id } });

    (initializeEpsPayment as jest.Mock).mockResolvedValueOnce({
      RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/newer-2',
      TransactionId: 'tx-newer-2',
    });
    await retrySpayBookingPayment(booking.id, 'fresh-owner-late-success'); // supersedes olderAttempt

    // olderAttempt's checkout, somehow, is the one that actually completed —
    // its late success callback must still be able to confirm the booking.
    await settleSpayBookingPayment(payment.id, olderAttempt.merchantTxnId);
    const confirmed = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe('confirmed');

    const settledOlderAttempt = await prisma.spayPaymentAttempt.findUniqueOrThrow({ where: { merchantTxnId: olderAttempt.merchantTxnId } });
    expect(settledOlderAttempt.status).toBe('success');

    // A duplicate/replayed settlement (e.g. the newer attempt's own late
    // callback arriving afterward) must never re-confirm or double-apply
    // the advance — settleSpayBookingPayment's own pending_payment guard.
    const beforeReplay = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    await settleSpayBookingPayment(payment.id, olderAttempt.merchantTxnId);
    const afterReplay = await prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(afterReplay.updatedAt.getTime()).toBe(beforeReplay.updatedAt.getTime()); // untouched no-op
  });
});
