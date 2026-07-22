import { Prisma, CampaignRegistrationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { VaccinationRecordListQuery } from './campaign-checkin.types';

// ─── PetBooking includes ─────────────────────────────────────────

const petBookingInclude = {
  pet: {
    include: {
      owner: { select: { id: true, ownerName: true, mobile: true, email: true } },
    },
  },
  session: {
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      venue: { select: { name: true, address: true } },
    },
  },
  registration: {
    select: {
      id: true,
      bookingNumber: true,
      status: true,
      campaignId: true,
      campaign: { select: { id: true, title: true } },
    },
  },
  services: {
    include: {
      campaignService: {
        select: { id: true, name: true, isRequired: true, vaccineCatalogId: true },
      },
    },
    orderBy: { campaignService: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.PetBookingInclude;

// ─── QR Lookup ───────────────────────────────────────────────────

export async function logQrScan(params: {
  qrToken: string;
  petBookingId: string | null;
  scannedById: string;
  scanResult: 'found' | 'not_found';
  ipAddress?: string;
}) {
  return prisma.qRScanLog.create({
    data: {
      qrToken: params.qrToken,
      petBookingId: params.petBookingId,
      scannedById: params.scannedById,
      scanResult: params.scanResult,
      ipAddress: params.ipAddress,
    },
  });
}

export async function findPetBookingByQrToken(qrToken: string) {
  return prisma.petBooking.findUnique({ where: { qrToken }, include: petBookingInclude });
}

export async function findPetBookingById(id: string) {
  return prisma.petBooking.findUnique({ where: { id }, include: petBookingInclude });
}

// ─── Search ──────────────────────────────────────────────────────

export async function searchPetBookings(params: {
  q: string;
  campaignId?: string;
  sessionId?: string;
}) {
  const { q, campaignId, sessionId } = params;
  const where: Prisma.PetBookingWhereInput = {
    OR: [
      { pet: { name: { contains: q, mode: 'insensitive' } } },
      { pet: { owner: { mobile: { contains: q } } } },
      { registration: { bookingNumber: { contains: q, mode: 'insensitive' } } },
      { registration: { owner: { ownerName: { contains: q, mode: 'insensitive' } } } },
    ],
  };
  if (campaignId) where.registration = { ...(where.registration as object), campaignId };
  if (sessionId) where.sessionId = sessionId;

  return prisma.petBooking.findMany({
    where,
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: petBookingInclude,
  });
}

// ─── Check-In ────────────────────────────────────────────────────

export async function checkInPetBooking(petBookingId: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.petBooking.findUniqueOrThrow({
      where: { id: petBookingId },
      include: { registration: true },
    });

    if (booking.status !== CampaignRegistrationStatus.paid) {
      throw new Error(`Cannot check in a booking with status: ${booking.status}`);
    }

    const updated = await tx.petBooking.update({
      where: { id: petBookingId },
      data: { status: CampaignRegistrationStatus.checked_in, checkedInAt: new Date() },
    });

    // Promote registration to checked_in if still at paid
    if (booking.registration.status === CampaignRegistrationStatus.paid) {
      await tx.campaignRegistration.update({
        where: { id: booking.registrationId },
        data: { status: CampaignRegistrationStatus.checked_in },
      });
    }

    return updated;
  });
}

// ─── Vaccinate ───────────────────────────────────────────────────

export async function vaccinatePetBooking(params: {
  petBookingId: string;
  services: Array<{ campaignServiceId: string; batchNumber?: string }>;
  doctorId?: string;
  notes?: string;
  serviceNames: Map<string, string>; // campaignServiceId → name
  nextDueDates: Map<string, Date | null>; // campaignServiceId → nextDueDate
}) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.petBooking.findUniqueOrThrow({
      where: { id: params.petBookingId },
      include: {
        registration: true,
        services: true,
      },
    });

    const allowedStatuses: CampaignRegistrationStatus[] = [
      CampaignRegistrationStatus.paid,
      CampaignRegistrationStatus.checked_in,
    ];
    if (!allowedStatuses.includes(booking.status)) {
      throw new Error(`Cannot vaccinate a booking with status: ${booking.status}`);
    }

    const administeredAt = new Date();

    for (const svc of params.services) {
      // Find the PetBookingService row
      const pbs = booking.services.find(s => s.campaignServiceId === svc.campaignServiceId);
      if (!pbs) continue;

      // Mark administered
      await tx.petBookingService.update({
        where: { id: pbs.id },
        data: { administered: true, administeredAt },
      });

      // Create permanent vaccination record
      const vaccineName = params.serviceNames.get(svc.campaignServiceId) ?? 'Unknown';
      const nextDueDate = params.nextDueDates.get(svc.campaignServiceId) ?? null;

      await tx.vaccinationRecord.create({
        data: {
          petId: booking.petId,
          petBookingId: booking.id,
          petBookingServiceId: pbs.id,
          campaignServiceId: svc.campaignServiceId,
          campaignId: booking.registration.campaignId,
          vaccineName,
          batchNumber: svc.batchNumber,
          administeredAt,
          nextDueDate,
          doctorId: params.doctorId,
          notes: params.notes,
        },
      });
    }

    // Check if all required services are now administered
    const allServices = await tx.petBookingService.findMany({
      where: { petBookingId: booking.id },
      include: { campaignService: { select: { isRequired: true } } },
    });
    const allRequiredAdministered = allServices
      .filter(s => s.campaignService.isRequired)
      .every(s => s.administered);

    if (allRequiredAdministered) {
      await tx.petBooking.update({
        where: { id: booking.id },
        data: { status: CampaignRegistrationStatus.vaccinated, vaccinatedAt: administeredAt },
      });

      // Check if all pets in the registration are vaccinated
      const allSiblings = await tx.petBooking.findMany({
        where: { registrationId: booking.registrationId },
      });
      const vaccinatedStatuses: CampaignRegistrationStatus[] = [
        CampaignRegistrationStatus.vaccinated,
        CampaignRegistrationStatus.certificate_issued,
        CampaignRegistrationStatus.completed,
      ];
      const allVaccinated = allSiblings
        .filter(pb => pb.id !== booking.id)
        .every(pb => vaccinatedStatuses.includes(pb.status));

      if (allVaccinated) {
        await tx.campaignRegistration.update({
          where: { id: booking.registrationId },
          data: { status: CampaignRegistrationStatus.vaccinated },
        });
      }

      // Increment analytics
      await tx.campaignAnalytics.upsert({
        where: { campaignId: booking.registration.campaignId },
        update: { totalPets: { increment: 1 }, totalVaccinated: { increment: 1 } },
        create: {
          campaignId: booking.registration.campaignId,
          totalPets: 1,
          totalVaccinated: 1,
        },
      });
    }

    return tx.petBooking.findUniqueOrThrow({ where: { id: booking.id }, include: petBookingInclude });
  });
}

// ─── Vaccination History ─────────────────────────────────────────

export async function getPetVaccinationHistory(petId: string) {
  return prisma.vaccinationRecord.findMany({
    where: { petId },
    orderBy: { administeredAt: 'desc' },
    include: {
      campaignService: { select: { id: true, name: true } },
      campaign: { select: { id: true, title: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
}

export async function listVaccinationRecords(query: VaccinationRecordListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.VaccinationRecordWhereInput = {};
  if (query.petId) where.petId = query.petId;
  if (query.campaignId) where.campaignId = query.campaignId;

  const [items, total] = await Promise.all([
    prisma.vaccinationRecord.findMany({
      where, skip, take: limit, orderBy: { administeredAt: 'desc' },
      include: {
        pet: { select: { id: true, name: true, petType: true } },
        campaignService: { select: { id: true, name: true } },
        campaign: { select: { id: true, title: true } },
        doctor: { select: { id: true, name: true } },
      },
    }),
    prisma.vaccinationRecord.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}
