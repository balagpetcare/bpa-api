import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold } from '../spay-neuter.booking.service';
import * as admin from '../spay-neuter.admin.service';
import { isEPSConfigured } from '../../../services/eps.service';

// A registered pet is optional for Spay & Neuter promotional bookings — this
// suite verifies hold creation, booking creation, and admin reads all work
// correctly with ZERO pet identity, without weakening the path where a real
// externalPetId is still supplied (existing/legacy bookings, or a caller
// that does have one).
jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

import { getFurtailPet } from '../../me/furtail-pets.client';

describe('spay-neuter booking flow — pet profile is optional', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 7 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Pet Optional Org ${suffix}`, slug: `pet-optional-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Pet Optional Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Pet Optional Offer',
        slug: `pet-optional-offer-${suffix}`,
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

  async function makeHold(hour: string, centralAuthUserId = 'pet-optional-owner') {
    return createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `pet-optional-test-${randomUUID()}`,
    });
  }

  it('4. hold creation succeeds without any pet reference at all (holds never carry pet identity)', async () => {
    const hold = await makeHold('03:00');
    expect(hold.procedure).toBe('neuter');
    expect(hold.status).toBe('active');
  });

  it('5. + 6. + 12. booking creation and payment initiation succeed with no externalPetId, no SpayBookingPet row, no placeholder id, and Furtail is never called', async () => {
    (getFurtailPet as jest.Mock).mockClear();
    const hold = await makeHold('03:20');

    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'pet-optional-owner',
      authToken: 'Bearer test-token',
      contactName: 'Pet-less Owner',
      contactPhone: '01711111112',
      // externalPetId intentionally omitted
    });

    expect(getFurtailPet).not.toHaveBeenCalled(); // ownership is never checked when no pet is supplied
    expect(result.booking.status).toBe('pending_payment');
    expect(result.paymentGatewayUnavailable).toBe(!isEPSConfigured()); // initiation code path still ran without throwing on the missing pet

    const pets = await prisma.spayBookingPet.findMany({ where: { bookingId: result.booking.id } });
    expect(pets).toHaveLength(0); // no row created — not even one with a null/empty/placeholder externalPetId

    const hold2 = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(hold2.status).toBe('converted');
  });

  it('9. an existing/legacy booking that supplies a real externalPetId remains fully supported (pet requirement is optional, not removed)', async () => {
    const hold = await makeHold('03:40');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'pet-optional-owner',
      authToken: 'Bearer test-token',
      contactName: 'Owner With Pet',
      contactPhone: '01711111113',
      externalPetId: 'external-pet-1',
      petNameSnapshot: 'Tommy',
      speciesSnapshot: 'cat',
      sexSnapshot: 'male',
    });

    expect(getFurtailPet).toHaveBeenCalledWith('Bearer test-token', 'external-pet-1');
    const pet = await prisma.spayBookingPet.findFirstOrThrow({ where: { bookingId: result.booking.id } });
    expect(pet.externalPetId).toBe('external-pet-1');
    expect(pet.petNameSnapshot).toBe('Tommy');
  });

  it('11. admin booking detail/list render a pet-less booking safely — pets is an empty array, never null/undefined/throwing', async () => {
    const hold = await makeHold('04:00');
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId: 'pet-optional-owner',
      authToken: 'Bearer test-token',
      contactName: 'Admin View Owner',
      contactPhone: '01711111114',
    });

    const detail = await admin.getBookingAdmin(result.booking.id);
    expect(detail.pets).toEqual([]);
    expect(detail.bookingNumber).toBe(result.booking.bookingNumber);
    expect(detail.contactName).toBe('Admin View Owner');
    expect(detail.clinicBranchId).toBe(clinicBranchId);

    const list = await admin.listBookingsAdmin({ clinicBranchId, limit: 50 });
    const listed = list.items.find((b: { id: string }) => b.id === result.booking.id) as { pets: unknown[] } | undefined;
    expect(listed).toBeTruthy();
    expect(listed?.pets).toEqual([]);
  });
});
