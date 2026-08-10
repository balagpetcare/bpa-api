import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold } from '../spay-neuter.booking.service';

// Regression coverage: every spay-neuter booking originates from the
// Flutter app — there is no web booking flow for this feature — so the EPS
// success/fail/cancel callback MUST redirect via the bpa:// deep link, not
// a FRONTEND_URL web page. That redirect decision (isMobilePayment() in
// payment-callbacks.router.ts) reads Payment.payload.platform === 'mobile'.
// This test proves the booking service actually stamps that field onto the
// created Payment when the client sends platform: 'mobile', and defaults
// safely to 'web' when omitted (matching the existing campaign-registration
// convention) rather than silently defaulting to the wrong value.

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

jest.mock('../../../services/eps.service', () => ({
  isEPSConfigured: jest.fn(() => true),
  generateMerchantTxnId: jest.fn(() => `TESTPLAT${Date.now()}`),
  initializeEpsPayment: jest.fn(async () => ({
    RedirectURL: 'https://sandbox-pgapi.eps.com.bd/redirect/test',
  })),
}));

describe('spay-neuter booking — EPS payment payload.platform propagation', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Platform Test Org ${suffix}`, slug: `platform-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Platform Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 2 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Platform Test Offer',
        slug: `platform-test-offer-${suffix}`,
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

  async function makeHold(hour: string) {
    return createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId: 'owner-platform-1',
      idempotencyKey: `booking-platform-test-${randomUUID()}`,
    });
  }

  it("stamps payload.platform = 'mobile' on the Payment when the client sends platform: 'mobile'", async () => {
    const hold = await makeHold('10:00');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'owner-platform-1',
      authToken: 'Bearer test-token',
      contactName: 'Owner Platform',
      contactPhone: '01733333333',
      externalPetId: 'external-pet-1',
      platform: 'mobile',
    });

    expect(result.paymentGatewayUnavailable).toBe(false);
    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: result.booking.id } });
    expect((payment.payload as Record<string, unknown>).platform).toBe('mobile');
  });

  it("defaults payload.platform to 'web' when the client omits platform (never leaves it undefined)", async () => {
    const hold = await makeHold('08:30');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'owner-platform-1',
      authToken: 'Bearer test-token',
      contactName: 'Owner Platform',
      contactPhone: '01733333333',
      externalPetId: 'external-pet-1',
    });

    const payment = await prisma.payment.findFirstOrThrow({ where: { entityType: 'spay_booking', entityId: result.booking.id } });
    expect((payment.payload as Record<string, unknown>).platform).toBe('web');
  });
});
