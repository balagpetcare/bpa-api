import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { generateBookingCode } from '../spay-neuter.identifiers';
import { getClinicBookingById, listClinicOperations, lookupClinicBooking } from '../spay-neuter.clinic-dashboard.service';
import {
  checkInBooking,
  completeOperation,
  completePreOpAssessment,
  markReadyForOperation,
  moveCheckedInBookingEarlier,
  sendPostOperativeUpdate,
  startOperation,
  startPreOpAssessment,
} from '../spay-neuter.clinic-ops.service';

describe('spay-neuter clinic operation-day workflow', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let branchAId: string;
  let branchBId: string;
  let staffAUserId: string;
  let staffBUserId: string;
  let doctorId: string;
  let offerId: string;
  let profileAId: string;
  let profileBId: string;
  let serviceAId: string;
  let serviceBId: string;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `Ops Test Org ${suffix}`, slug: `ops-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const [branchA, branchB, staffA, staffB, doctor] = await Promise.all([
      prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Ops Branch A' } }),
      prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'Ops Branch B' } }),
      prisma.user.create({ data: { name: 'Ops Staff A', email: `ops-a-${suffix}@example.test`, isActive: true } }),
      prisma.user.create({ data: { name: 'Ops Staff B', email: `ops-b-${suffix}@example.test`, isActive: true } }),
      prisma.doctor.create({ data: { name: `Ops Doctor ${suffix}`, licenseNumber: `OPS-${suffix}`, isActive: true } }),
    ]);

    branchAId = branchA.id;
    branchBId = branchB.id;
    staffAUserId = staffA.id;
    staffBUserId = staffB.id;
    doctorId = doctor.id;

    const [profileA, profileB, offer] = await Promise.all([
      prisma.spayClinicProfile.create({ data: { clinicBranchId: branchAId, concurrentOperationCapacity: 2 } }),
      prisma.spayClinicProfile.create({ data: { clinicBranchId: branchBId, concurrentOperationCapacity: 1 } }),
      prisma.spayOffer.create({
        data: {
          title: `Ops Offer ${suffix}`,
          slug: `ops-offer-${suffix}`,
          status: 'published',
          neuterTotalPriceBdt: 2000,
          spayTotalPriceBdt: 3500,
          advanceBdt: 500,
          medicallyUnfitRefundable: true,
        },
      }),
    ]);
    offerId = offer.id;
    profileAId = profileA.id;
    profileBId = profileB.id;

    const [serviceA, serviceB] = await Promise.all([
      prisma.spayClinicService.upsert({
        where: { clinicProfileId_procedure: { clinicProfileId: profileA.id, procedure: 'neuter' } },
        update: { durationMinutes: 20, isActive: true },
        create: { clinicProfileId: profileA.id, procedure: 'neuter', durationMinutes: 20, isActive: true },
      }),
      prisma.spayClinicService.upsert({
        where: { clinicProfileId_procedure: { clinicProfileId: profileB.id, procedure: 'neuter' } },
        update: { durationMinutes: 20, isActive: true },
        create: { clinicProfileId: profileB.id, procedure: 'neuter', durationMinutes: 20, isActive: true },
      }),
    ]);
    serviceAId = serviceA.id;
    serviceBId = serviceB.id;

    await Promise.all([
      prisma.spayClinicStaff.createMany({
        data: [
          { clinicBranchId: branchAId, clinicProfileId: profileA.id, userId: staffAUserId, staffRole: 'clinic_admin', isActive: true },
          { clinicBranchId: branchBId, clinicProfileId: profileB.id, userId: staffBUserId, staffRole: 'clinic_admin', isActive: true },
        ],
      }),
      prisma.spayClinicSchedule.createMany({
        data: [profileA.id, profileB.id].flatMap((clinicProfileId) =>
          Array.from({ length: 7 }, (_, dayOfWeek) => ({
            clinicProfileId,
            dayOfWeek,
            startTime: '00:00',
            endTime: '23:59',
            isActive: true,
          })),
        ),
      }),
    ]);
  });

  afterAll(async () => {
    await prisma.spayRefundRequest.deleteMany({ where: { booking: { clinicBranchId: { in: [branchAId, branchBId] } } } });
    await prisma.spayMedicalQuestionnaire.deleteMany({ where: { bookingPet: { booking: { clinicBranchId: { in: [branchAId, branchBId] } } } } });
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId: { in: [branchAId, branchBId] } } } });
    await prisma.spayBookingRescheduleEvent.deleteMany({ where: { booking: { clinicBranchId: { in: [branchAId, branchBId] } } } });
    await prisma.spayBookingPet.deleteMany({ where: { booking: { clinicBranchId: { in: [branchAId, branchBId] } } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId: { in: [branchAId, branchBId] } } });
    await prisma.spayClinicStaff.deleteMany({ where: { clinicBranchId: { in: [branchAId, branchBId] } } });
    await prisma.spayClinicService.deleteMany({ where: { id: { in: [serviceAId, serviceBId] } } });
    await prisma.spayClinicSchedule.deleteMany({ where: { clinicProfileId: { in: [profileAId, profileBId] } } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId: { in: [branchAId, branchBId] } } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [staffAUserId, staffBUserId] } } });
    await prisma.clinicBranch.deleteMany({ where: { id: { in: [branchAId, branchBId] } } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  async function makeBooking(branchId: string, serviceId: string, startAt: Date, status: 'confirmed' | 'checked_in' = 'confirmed') {
    const endAt = new Date(startAt.getTime() + 20 * 60_000);
    const booking = await prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-T${randomUUID().slice(0, 8)}`,
        bookingCode: generateBookingCode(),
        offerId,
        clinicBranchId: branchId,
        serviceId,
        procedure: 'neuter',
        centralAuthUserId: `owner-${randomUUID().slice(0, 8)}`,
        contactName: 'Clinic Ops Owner',
        contactPhone: '01700000000',
        totalPriceBdt: 2000,
        advancePaidBdt: 500,
        balanceDueBdt: 1500,
        offerTitleSnapshot: 'Ops Offer',
        clinicNameSnapshot: branchId === branchAId ? 'Ops Branch A' : 'Ops Branch B',
        durationMinutesSnapshot: 20,
        medicallyUnfitRefundableSnapshot: true,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        arriveByAt: new Date(startAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(startAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(startAt.getTime() - 24 * 60 * 60_000),
        status,
        checkedInAt: status === 'checked_in' ? new Date(startAt.getTime() - 45 * 60_000) : null,
        qrToken: randomUUID().split('-').join(''),
      },
    });

    await prisma.spayBookingPet.create({
      data: { bookingId: booking.id, externalPetId: `pet-${randomUUID().slice(0, 8)}`, petNameSnapshot: 'Rex', speciesSnapshot: 'dog' },
    });

    return booking;
  }

  it('enforces branch isolation on clinic list/detail/lookup', async () => {
    const bookingA = await makeBooking(branchAId, serviceAId, new Date('2026-08-05T05:00:00.000Z'));
    const bookingB = await makeBooking(branchBId, serviceBId, new Date('2026-08-06T05:30:00.000Z'));

    const listForA = await listClinicOperations(staffAUserId, ['clinic_admin'], { fromDate: '2026-08-05', toDate: '2026-08-06' });
    expect(listForA.items.map((item) => item.id)).toContain(bookingA.id);
    expect(listForA.items.map((item) => item.id)).not.toContain(bookingB.id);

    await expect(getClinicBookingById(bookingB.id, staffAUserId, ['clinic_admin'])).rejects.toMatchObject({ statusCode: 404 });
    await expect(lookupClinicBooking({ bookingCode: bookingB.bookingCode }, staffAUserId, ['clinic_admin'])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('moves through checked_in -> pre_op_assessment -> ready_for_operation -> in_operation -> completed and records follow-up', async () => {
    const booking = await makeBooking(branchAId, serviceAId, new Date(Date.now() + 30 * 60_000));

    const checkedIn = await checkInBooking(booking.id, staffAUserId);
    expect(checkedIn.status).toBe('checked_in');
    expect(checkedIn.actualArrivalAt).not.toBeNull();

    const preOpStarted = await startPreOpAssessment(booking.id, staffAUserId);
    expect(preOpStarted.status).toBe('pre_op_assessment');

    const assessed = await completePreOpAssessment(booking.id, staffAUserId, {
      weightKg: 11.8,
      temperatureC: 38.3,
      notes: 'Stable for surgery',
      fastingConfirmed: true,
      fitnessDecision: 'fit',
      assignedDoctorId: doctorId,
    });
    expect(assessed.status).toBe('pre_op_assessment');
    expect(assessed.pets[0]?.questionnaire?.isEligibleForSurgery).toBe(true);

    const ready = await markReadyForOperation(booking.id, staffAUserId, { assignedDoctorId: doctorId, operationLane: 'Lane A' });
    expect(ready.status).toBe('ready_for_operation');
    expect(ready.operationLane).toBe('Lane A');

    const inOperation = await startOperation(booking.id, staffAUserId, { assignedDoctorId: doctorId, operationLane: 'Lane A' });
    expect(inOperation.status).toBe('in_operation');
    expect(inOperation.operationStartedAt).not.toBeNull();

    const completed = await completeOperation(booking.id, staffAUserId, 1500, true);
    expect(completed.status).toBe('completed');
    expect(Number(completed.balanceCollectedBdt)).toBe(1500);
    expect(completed.clinicBalanceCollected).toBe(true);

    const postOp = await sendPostOperativeUpdate(booking.id, staffAUserId, { sendInstructions: true, followUpDate: new Date('2026-08-11'), notes: 'Review incision site in one week' });
    expect(postOp.postOpInstructionsSentAt).not.toBeNull();
    expect(postOp.followUpDate).not.toBeNull();
    expect(postOp.followUpNotes).toContain('incision');
  });

  it('only allows move-earlier overrides for checked-in bookings when capacity exists and records the override', async () => {
    const booking = await makeBooking(branchAId, serviceAId, new Date('2026-08-07T06:00:00.000Z'), 'checked_in');
    const moved = await moveCheckedInBookingEarlier(booking.id, staffAUserId, {
      newStartAt: new Date('2026-08-07T05:30:00.000Z'),
      reason: 'Earlier theatre slot opened',
      assignedDoctorId: doctorId,
      operationLane: 'Lane B',
    });

    expect(moved.status).toBe('checked_in');
    expect(moved.operationLane).toBe('Lane B');
    expect(new Date(moved.scheduledStartAt).toISOString()).toBe('2026-08-07T05:30:00.000Z');

    const history = await prisma.spayBookingRescheduleEvent.findMany({ where: { bookingId: booking.id }, orderBy: { createdAt: 'desc' } });
    expect(history[0]?.reason).toContain('Earlier theatre slot opened');
  });
});
