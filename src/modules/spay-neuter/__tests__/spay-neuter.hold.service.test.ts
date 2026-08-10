import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import { AppError } from '../../../utils/AppError';
import { createHold, rescheduleBooking } from '../spay-neuter.hold.service';
import { expireStaleHolds } from '../spay-neuter.repository';

// Integration tests against the local dev database — see
// docs/plans/spay-neuter/implementation-contract.md. Exercises the full
// advisory-lock + transaction + interval-sweep path end to end, the way
// createHold/rescheduleBooking are actually called from the controller.
// Every fixture is scoped to a unique clinic branch per describe block and
// cleaned up in afterAll so the shared dev DB is left as found.

describe('spay-neuter hold & reschedule engine', () => {
  const suffix = Date.now();
  let clinicOrgId: string;

  // Test times are always computed relative to "now" so this suite never
  // goes stale — 5 days out, at a fixed Dhaka wall-clock hour, comfortably
  // inside the default 30-day booking horizon.
  const testDate = new Date(Date.now() + 5 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  async function makeClinic(capacity: number, offerOverrides: Partial<{ startsAt: Date | null; endsAt: Date | null; bookingOpensAt: Date | null; bookingClosesAt: Date | null }> = {}) {
    const n = randomUUID().slice(0, 8);
    const branch = await prisma.clinicBranch.create({
      data: { organizationId: clinicOrgId, branchName: `Hold Test Branch ${n}` },
    });
    const profile = await prisma.spayClinicProfile.create({
      data: { clinicBranchId: branch.id, concurrentOperationCapacity: capacity },
    });
    const service = await prisma.spayClinicService.create({
      data: { clinicProfileId: profile.id, procedure: 'neuter', durationMinutes: 20 },
    });
    const offer = await prisma.spayOffer.create({
      data: {
        title: `Hold Test Offer ${n}`,
        slug: `hold-test-offer-${n}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        ...offerOverrides,
      },
    });
    // A manual slot sidesteps weekly-schedule day-of-week setup and gives
    // every test in this suite a deterministic, always-open 09:00-17:00
    // Dhaka window on testDate.
    await prisma.spaySlot.create({
      data: { clinicProfileId: profile.id, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity },
    });
    // Clinic activity alone is not participation — the offer must explicitly
    // link this clinic branch (see assertClinicParticipatesInOffer).
    await prisma.spayOfferClinic.create({ data: { offerId: offer.id, clinicBranchId: branch.id, isActive: true } });

    return { branchId: branch.id, profileId: profile.id, serviceId: service.id, offerId: offer.id };
  }

  async function makeBooking(clinic: Awaited<ReturnType<typeof makeClinic>>, startAt: Date, status: string = 'confirmed') {
    const endAt = new Date(startAt.getTime() + 20 * 60_000);
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId: clinic.offerId,
        clinicBranchId: clinic.branchId,
        serviceId: clinic.serviceId,
        procedure: 'neuter',
        centralAuthUserId: 'test-owner',
        contactName: 'Test Owner',
        contactPhone: '01700000000',
        totalPriceBdt: 2000,
        advancePaidBdt: 500,
        balanceDueBdt: 1500,
        offerTitleSnapshot: 'Hold Test Offer',
        clinicNameSnapshot: 'Hold Test Branch',
        durationMinutesSnapshot: 20,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        arriveByAt: new Date(startAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(startAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(startAt.getTime() - 24 * 3_600_000),
        status: status as never,
        qrToken: randomUUID(),
      },
    });
  }

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({
      data: { name: `Hold Test Org ${suffix}`, slug: `hold-test-org-${suffix}` },
    });
    clinicOrgId = org.id;
  });

  afterAll(async () => {
    const branches = await prisma.clinicBranch.findMany({ where: { organizationId: clinicOrgId }, select: { id: true } });
    const branchIds = branches.map((b) => b.id);
    const profiles = await prisma.spayClinicProfile.findMany({
      where: { clinicBranchId: { in: branchIds } },
      select: { id: true },
    });
    const profileIds = profiles.map((p) => p.id);

    await prisma.spayBookingRescheduleEvent.deleteMany({ where: { booking: { clinicBranchId: { in: branchIds } } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId: { in: branchIds } } });
    await prisma.spaySlotHold.deleteMany({ where: { clinicBranchId: { in: branchIds } } });
    await prisma.spayOfferClinic.deleteMany({ where: { clinicBranchId: { in: branchIds } } });
    await prisma.spaySlot.deleteMany({ where: { clinicProfileId: { in: profileIds } } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId: { in: profileIds } } });
    await prisma.spayOffer.deleteMany({ where: { slug: { startsWith: 'hold-test-offer-' } } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId: { in: branchIds } } });
    await prisma.clinicBranch.deleteMany({ where: { organizationId: clinicOrgId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  describe('hold expiration', () => {
    it('an expired hold no longer occupies capacity, and its slot can be re-held', async () => {
      const clinic = await makeClinic(1);
      const startAt = new Date(`${dateStr}T04:00:00.000Z`); // 10:00 Dhaka

      const hold = await createHold({
        offerId: clinic.offerId,
        clinicBranchId: clinic.branchId,
        procedure: 'neuter',
        startAt,
        centralAuthUserId: 'user-a',
        idempotencyKey: `expiry-test-${randomUUID()}`,
      });

      // A second hold for the same time, same capacity=1, must fail while the first is active.
      await expect(
        createHold({
          offerId: clinic.offerId,
          clinicBranchId: clinic.branchId,
          procedure: 'neuter',
          startAt,
          centralAuthUserId: 'user-b',
          idempotencyKey: `expiry-test-blocked-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });

      // Force the first hold to be past its TTL, then sweep it.
      await prisma.spaySlotHold.update({ where: { id: hold.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expiredCount = await expireStaleHolds();
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const refreshed = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: hold.id } });
      expect(refreshed.status).toBe('expired');

      // Now the same time slot is bookable again.
      const secondHold = await createHold({
        offerId: clinic.offerId,
        clinicBranchId: clinic.branchId,
        procedure: 'neuter',
        startAt,
        centralAuthUserId: 'user-b',
        idempotencyKey: `expiry-test-retry-${randomUUID()}`,
      });
      expect(secondHold.status).toBe('active');
    });
  });

  describe('offer lifecycle window enforcement', () => {
    it('rejects a hold when the offer has not started yet', async () => {
      const clinic = await makeClinic(1, { startsAt: new Date(Date.now() + 10 * 86_400_000), endsAt: new Date(Date.now() + 40 * 86_400_000) });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `window-not-open-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'OFFER_NOT_BOOKABLE' });
    });

    it('rejects a hold once the offer booking window has closed', async () => {
      const clinic = await makeClinic(1, { startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(Date.now() + 40 * 86_400_000), bookingClosesAt: new Date(Date.now() - 86_400_000) });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `window-closed-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'OFFER_NOT_BOOKABLE' });
    });

    it('rejects a hold for a time past the offer service end date', async () => {
      const clinic = await makeClinic(1, { startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(`${dateStr}T00:00:00.000Z`) });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`); // after the offer's own endsAt (set to midnight of the same day)
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `window-outside-period-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'OFFER_NOT_BOOKABLE' });
    });

    it('allows a hold when the offer window comfortably covers the requested time', async () => {
      const clinic = await makeClinic(1, { startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(Date.now() + 40 * 86_400_000) });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      const hold = await createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `window-ok-${randomUUID()}` });
      expect(hold.status).toBe('active');
    });
  });

  describe('clinic-participates-in-offer revalidation', () => {
    it('rejects a hold against a clinic that was never linked to the offer', async () => {
      const clinic = await makeClinic(1);
      // A second, unrelated published offer that this clinic was never linked to.
      const otherOffer = await prisma.spayOffer.create({
        data: {
          title: 'Unrelated Offer',
          slug: `hold-test-offer-${suffix}-unrelated-${randomUUID().slice(0, 8)}`,
          status: 'published',
          neuterTotalPriceBdt: 2000,
          spayTotalPriceBdt: 3500,
          advanceBdt: 500,
        },
      });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      await expect(
        createHold({ offerId: otherOffer.id, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `not-participating-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'CLINIC_NOT_PARTICIPATING_IN_OFFER' });
    });

    it('rejects a hold against a clinic whose offer link has been deactivated', async () => {
      const clinic = await makeClinic(1);
      await prisma.spayOfferClinic.updateMany({ where: { offerId: clinic.offerId, clinicBranchId: clinic.branchId }, data: { isActive: false } });
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `deactivated-link-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'CLINIC_NOT_PARTICIPATING_IN_OFFER' });
    });
  });

  describe('slot-service mismatch vs. plain unavailability', () => {
    it('returns SERVICE_NOT_AVAILABLE_AT_CLINIC when the clinic does not offer the requested procedure at all', async () => {
      // makeClinic only configures a 'neuter' SpayClinicService — this is the
      // "clinic never offers this procedure" case, distinct from
      // SLOT_SERVICE_MISMATCH ("clinic offers it, but not at this exact time" —
      // see the manual-slot procedure-scoping test in spay-neuter.admin.test.ts).
      const clinic = await makeClinic(1);
      const startAt = new Date(`${dateStr}T04:00:00.000Z`);
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'spay', startAt, centralAuthUserId: 'user-a', idempotencyKey: `service-mismatch-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'SERVICE_NOT_AVAILABLE_AT_CLINIC' });
    });

    it('returns SLOT_UNAVAILABLE for a time outside the clinic\'s schedule entirely, for any procedure', async () => {
      const clinic = await makeClinic(1);
      const outsideWindow = new Date(`${dateStr}T20:00:00.000Z`); // 02:00 Dhaka — outside the 09:00-17:00 manual slot
      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt: outsideWindow, centralAuthUserId: 'user-a', idempotencyKey: `plain-unavailable-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    });

    it('returns SLOT_SERVICE_MISMATCH when a manual slot at this exact time is scoped to the OTHER procedure only', async () => {
      const clinic = await makeClinic(1);
      // The clinic offers both procedures, but the ONLY window at 14:00-16:00
      // Dhaka is a manual slot explicitly scoped to 'spay'.
      await prisma.spayClinicService.create({ data: { clinicProfileId: clinic.profileId, procedure: 'spay', durationMinutes: 40 } });
      await prisma.spaySlot.create({
        data: { clinicProfileId: clinic.profileId, slotDate: new Date(dateStr), startTime: '14:00', endTime: '16:00', capacity: 1, procedure: 'spay' },
      });
      const startAt = new Date(`${dateStr}T08:00:00.000Z`); // 14:00 Dhaka — inside the spay-only manual slot.
      // Deactivate the general open-to-either 09:00-17:00 manual slot from
      // makeClinic() so 'neuter' has NO other window to fall back on here —
      // isolating the mismatch signal from a coincidental overlap.
      await prisma.spaySlot.updateMany({ where: { clinicProfileId: clinic.profileId, procedure: null }, data: { isActive: false } });

      await expect(
        createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'neuter', startAt, centralAuthUserId: 'user-a', idempotencyKey: `slot-service-mismatch-${randomUUID()}` }),
      ).rejects.toMatchObject({ code: 'SLOT_SERVICE_MISMATCH' });

      // The same time IS bookable for spay, confirming this was genuinely a mismatch, not a real unavailability.
      const spayHold = await createHold({ offerId: clinic.offerId, clinicBranchId: clinic.branchId, procedure: 'spay', startAt, centralAuthUserId: 'user-a', idempotencyKey: `slot-service-match-${randomUUID()}` });
      expect(spayHold.status).toBe('active');
    });
  });

  describe('two users racing for the last place', () => {
    it('capacity 1, two concurrent hold requests for the same time — exactly one succeeds', async () => {
      const clinic = await makeClinic(1);
      const startAt = new Date(`${dateStr}T05:00:00.000Z`); // 11:00 Dhaka

      const [resultA, resultB] = await Promise.allSettled([
        createHold({
          offerId: clinic.offerId,
          clinicBranchId: clinic.branchId,
          procedure: 'neuter',
          startAt,
          centralAuthUserId: 'racer-a',
          idempotencyKey: `race-a-${randomUUID()}`,
        }),
        createHold({
          offerId: clinic.offerId,
          clinicBranchId: clinic.branchId,
          procedure: 'neuter',
          startAt,
          centralAuthUserId: 'racer-b',
          idempotencyKey: `race-b-${randomUUID()}`,
        }),
      ]);

      const outcomes = [resultA, resultB];
      const fulfilled = outcomes.filter((r) => r.status === 'fulfilled');
      const rejected = outcomes.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'SPAY_SLOT_FULL' });

      const activeHolds = await prisma.spaySlotHold.count({
        where: { clinicBranchId: clinic.branchId, status: 'active', candidateStartAt: startAt },
      });
      expect(activeHolds).toBe(1); // never both — the advisory lock serialized the race
    });

    it('capacity 2, three concurrent hold requests for the same time — exactly two succeed', async () => {
      const clinic = await makeClinic(2);
      const startAt = new Date(`${dateStr}T06:00:00.000Z`); // 12:00 Dhaka

      const results = await Promise.allSettled(
        ['racer-1', 'racer-2', 'racer-3'].map((user) =>
          createHold({
            offerId: clinic.offerId,
            clinicBranchId: clinic.branchId,
            procedure: 'neuter',
            startAt,
            centralAuthUserId: user,
            idempotencyKey: `race3-${user}-${randomUUID()}`,
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
  });

  describe('reschedule collision', () => {
    it('rejects a reschedule into a time already fully occupied by another booking', async () => {
      const clinic = await makeClinic(1);
      const occupiedAt = new Date(`${dateStr}T07:00:00.000Z`); // 13:00 Dhaka
      const freeAt = new Date(`${dateStr}T08:00:00.000Z`); // 14:00 Dhaka

      await makeBooking(clinic, occupiedAt);
      const bookingB = await makeBooking(clinic, freeAt);

      await expect(rescheduleBooking(bookingB.id, occupiedAt)).rejects.toMatchObject({ code: 'SPAY_SLOT_FULL' });

      // bookingB's own row must be untouched by the failed attempt.
      const stillAtFreeAt = await prisma.spayBooking.findUniqueOrThrow({ where: { id: bookingB.id } });
      expect(stillAtFreeAt.scheduledStartAt.toISOString()).toBe(freeAt.toISOString());
    });

    it('allows a reschedule into a genuinely free time, and records the reschedule event', async () => {
      const clinic = await makeClinic(1);
      const originalAt = new Date(`${dateStr}T09:00:00.000Z`); // 15:00 Dhaka
      const newAt = new Date(`${dateStr}T10:00:00.000Z`); // 16:00 Dhaka

      const booking = await makeBooking(clinic, originalAt);
      const updated = await rescheduleBooking(booking.id, newAt, 'owner requested');

      expect(updated.scheduledStartAt.toISOString()).toBe(newAt.toISOString());
      expect(updated.rescheduleCount).toBe(1);
      expect(updated.status).toBe('confirmed');

      const events = await prisma.spayBookingRescheduleEvent.findMany({ where: { bookingId: booking.id } });
      expect(events).toHaveLength(1);
      expect(events[0].fromScheduledStartAt.toISOString()).toBe(originalAt.toISOString());
      expect(events[0].toScheduledStartAt.toISOString()).toBe(newAt.toISOString());
      expect(events[0].reason).toBe('owner requested');
    });

    it('a booking rescheduled within its own already-reserved window does not collide with itself', async () => {
      const clinic = await makeClinic(1);
      const withinHorizon = new Date(`${dateStr}T10:30:00.000Z`); // 16:30 Dhaka
      const nearbyAt = new Date(`${dateStr}T10:35:00.000Z`); // 16:35 Dhaka — overlaps the booking's own original 20-min span

      const booking = await makeBooking(clinic, withinHorizon);

      // Without excluding the booking's own interval, this would spuriously
      // conflict with itself (capacity 1, and the booking's own row still
      // exists at query time). It must succeed.
      const updated = await rescheduleBooking(booking.id, nearbyAt);
      expect(updated.scheduledStartAt.toISOString()).toBe(nearbyAt.toISOString());
    });

    it('rejects an owner-initiated reschedule once the booking has entered any clinic-side workflow', async () => {
      // Regression test: the guard used to only exclude terminal statuses,
      // which meant an owner could "reschedule" a booking to a new time
      // while the pet was checked in, mid pre-op assessment, ready for
      // operation, or literally in surgery.
      const clinic = await makeClinic(1);
      const newAt = new Date(`${dateStr}T12:00:00.000Z`);

      for (const status of ['checked_in', 'pre_op_assessment', 'ready_for_operation', 'in_operation', 'medically_unfit', 'refund_pending']) {
        const booking = await makeBooking(clinic, new Date(`${dateStr}T11:00:00.000Z`), status);
        await expect(rescheduleBooking(booking.id, newAt)).rejects.toMatchObject({ code: 'SPAY_BOOKING_NOT_RESCHEDULABLE' });
      }
    });

    it('still allows the owner-initiated reschedule from pending_payment or confirmed', async () => {
      const clinic = await makeClinic(1);
      const cases: [string, string, string][] = [
        ['pending_payment', '05:00', '05:30'],
        ['confirmed', '06:00', '06:30'],
      ];
      for (const [status, startHhmm, newHhmm] of cases) {
        const booking = await makeBooking(clinic, new Date(`${dateStr}T${startHhmm}:00.000Z`), status);
        const newAt = new Date(`${dateStr}T${newHhmm}:00.000Z`);
        const updated = await rescheduleBooking(booking.id, newAt);
        expect(updated.scheduledStartAt.toISOString()).toBe(newAt.toISOString());
      }
    });
  });
});
