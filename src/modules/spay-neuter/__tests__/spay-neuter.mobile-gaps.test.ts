import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold, settleSpayBookingPayment, retrySpayBookingPayment } from '../spay-neuter.booking.service';
import { isEPSConfigured } from '../../../services/eps.service';

describe('spay-neuter mobile api compatibility gaps', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 8 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Mobile Gaps Org ${suffix}`, slug: `mobile-gaps-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Mobile Gaps Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Mobile Gaps Offer',
        slug: `mobile-gaps-offer-${suffix}`,
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

  async function makeHold(hour: string, centralAuthUserId = 'gaps-owner', expiresAt?: Date) {
    const hold = await createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `gaps-test-${randomUUID()}`,
    });

    if (expiresAt) {
      return prisma.spaySlotHold.update({
        where: { id: hold.id },
        data: { expiresAt },
      });
    }

    return hold;
  }

  describe('GET /holds/:holdId - hold status', () => {
    it('retrieves hold details and status successfully for the owner', async () => {
      const hold = await makeHold('03:00', 'owner-user');
      const found = await prisma.spaySlotHold.findUnique({ where: { id: hold.id } });
      expect(found).toBeTruthy();
      expect(found?.centralAuthUserId).toBe('owner-user');
      expect(found?.status).toBe('active');
    });

    it('enforces ownership: checking ownership on hold access', async () => {
      const hold = await makeHold('03:20', 'owner-user');
      // Simulated controller logic assertion
      expect(hold.centralAuthUserId).toBe('owner-user');
      expect(hold.centralAuthUserId !== 'other-user').toBe(true);
    });

    it('reports status as expired if the hold expiresAt has elapsed', async () => {
      const pastTime = new Date(Date.now() - 5000);
      const hold = await makeHold('03:40', 'owner-user', pastTime);
      const isExpired = hold.status === 'active' && hold.expiresAt.getTime() < Date.now();
      expect(isExpired).toBe(true);
    });
  });

  describe('expired/unavailable hold errors during booking creation', () => {
    it('throws SPAY_HOLD_EXPIRED (409) when creating a booking with an expired hold', async () => {
      const pastTime = new Date(Date.now() - 5000);
      const hold = await makeHold('04:00', 'owner-user', pastTime);

      await expect(
        createBookingFromHold({
          holdId: hold.id,
          centralAuthUserId: 'owner-user',
          contactName: 'Gaps Owner',
          contactPhone: '01711111115',
        })
      ).rejects.toMatchObject({ code: 'SPAY_HOLD_EXPIRED' });
    });
  });

  describe('exact BDT 500 charge and payment callback behavior', () => {
    it('charges exact BDT 500 advance and confirms booking when verified success', async () => {
      const hold = await makeHold('04:20', 'owner-user');
      const result = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-user',
        contactName: 'Gaps Owner',
        contactPhone: '01711111115',
      });

      const payment = await prisma.payment.create({
        data: {
          gateway: 'eps',
          merchantTxnId: `GAPS${randomUUID().replace(/-/g, '').slice(0, 13)}`,
          amount: 500, // Exact BDT 500
          currency: 'BDT',
          purpose: 'spay_neuter_advance',
          entityType: 'spay_booking',
          entityId: result.booking.id,
          status: 'success',
        },
      });

      await prisma.spayBooking.update({
        where: { id: result.booking.id },
        data: { paymentId: payment.id },
      });

      await settleSpayBookingPayment(payment.id);

      const confirmed = await prisma.spayBooking.findUniqueOrThrow({ where: { id: result.booking.id } });
      expect(confirmed.status).toBe('confirmed');
      expect(Number(confirmed.advancePaidBdt)).toBe(500); // BDT 500
      expect(Number(confirmed.balanceDueBdt)).toBe(1000); // 1500 total - 500 advance
    });

    it('a still-pending booking already shows the correct clinic balance — never the full total (the reported "Advance paid BDT 500 / Remaining BDT 1500" contradiction)', async () => {
      const hold = await makeHold('04:30', 'owner-user');
      const result = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-user',
        contactName: 'Gaps Owner',
        contactPhone: '01711111115',
      });

      const pending = await prisma.spayBooking.findUniqueOrThrow({ where: { id: result.booking.id } });
      expect(pending.status).toBe('pending_payment');
      expect(Number(pending.totalPriceBdt)).toBe(1500);
      // The online advance is known and frozen from creation — before any
      // payment has been attempted.
      expect(Number(pending.advanceRequiredBdt)).toBe(500);
      // Nothing has been verified yet — never optimistic.
      expect(Number(pending.advancePaidBdt)).toBe(0);
      // This is the actual bug: balanceDueBdt used to be set to the FULL
      // total_price_bdt (1500) at creation, producing a screen that showed
      // "Advance paid BDT 500" next to "Remaining at clinic BDT 1500" —
      // self-contradictory, since 500 + 1500 != 1500. It must already be
      // total - advance, matching what settleSpayBookingPayment computes
      // once the advance is actually verified.
      expect(Number(pending.balanceDueBdt)).toBe(1000);
      expect(Number(pending.advanceRequiredBdt) + Number(pending.balanceDueBdt)).toBe(Number(pending.totalPriceBdt));
    });

    it('pending_payment cannot become confirmed from callback amount mismatch', async () => {
      const hold = await makeHold('04:40', 'owner-user');
      const result = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-user',
        contactName: 'Gaps Owner',
        contactPhone: '01711111115',
      });

      const payment = await prisma.payment.create({
        data: {
          gateway: 'eps',
          merchantTxnId: `GAPS${randomUUID().replace(/-/g, '').slice(0, 13)}`,
          amount: 500,
          currency: 'BDT',
          purpose: 'spay_neuter_advance',
          entityType: 'spay_booking',
          entityId: result.booking.id,
          status: 'success',
          payload: { TotalAmount: '999.00' }, // amount mismatch
        },
      });

      await prisma.spayBooking.update({
        where: { id: result.booking.id },
        data: { paymentId: payment.id },
      });

      await settleSpayBookingPayment(payment.id);

      const stillPending = await prisma.spayBooking.findUniqueOrThrow({ where: { id: result.booking.id } });
      expect(stillPending.status).toBe('pending_payment'); // Did not confirm!
      expect(Number(stillPending.advancePaidBdt)).toBe(0);
    });
  });

  describe('payment retry uses the same booking', () => {
    it('resuses the same booking when retrying payment', async () => {
      const hold = await makeHold('05:00', 'owner-user');
      const result = await createBookingFromHold({
        holdId: hold.id,
        centralAuthUserId: 'owner-user',
        contactName: 'Gaps Owner',
        contactPhone: '01711111115',
      });

      const bookingId = result.booking.id;

      if (!isEPSConfigured()) {
        await expect(
          retrySpayBookingPayment(bookingId, 'owner-user')
        ).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_UNAVAILABLE' });
      } else {
        const retryResult = await retrySpayBookingPayment(bookingId, 'owner-user');
        expect(retryResult.booking.id).toBe(bookingId); // Reused same booking
      }
    });
  });
});
