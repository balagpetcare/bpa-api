import { AppError } from '../../utils/AppError';
import { sendCampaignSms } from '../../services/campaign-sms.service';
import { calculateNextDueDate } from '../../utils/vaccination-schedule';
import { prisma } from '../../database/prisma';
import * as repo from './campaign-checkin.repository';
import type { ScanQrDto, SearchBookingDto, VaccinateDto, VaccinationRecordListQuery } from './campaign-checkin.types';

// ─── QR / Search ─────────────────────────────────────────────────

export async function scanQr(dto: ScanQrDto, scannedById: string, ipAddress?: string) {
  const booking = await repo.findPetBookingByQrToken(dto.qrToken);

  // Log the scan regardless of result
  repo.logQrScan({
    qrToken: dto.qrToken,
    petBookingId: booking?.id ?? null,
    scannedById,
    scanResult: booking ? 'found' : 'not_found',
    ipAddress,
  }).catch(() => { /* non-critical */ });

  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

export async function searchBookings(dto: SearchBookingDto) {
  return repo.searchPetBookings({ q: dto.q, campaignId: dto.campaignId, sessionId: dto.sessionId });
}

export async function getPetBooking(petBookingId: string) {
  const booking = await repo.findPetBookingById(petBookingId);
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

// ─── Check-In ────────────────────────────────────────────────────

export async function checkIn(petBookingId: string) {
  try {
    return await repo.checkInPetBooking(petBookingId);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Cannot check in')) {
      throw AppError.badRequest(err.message);
    }
    throw err;
  }
}

// ─── Vaccinate ───────────────────────────────────────────────────

export async function vaccinate(petBookingId: string, dto: VaccinateDto) {
  // Gather service names for VaccinationRecord.vaccineName
  const serviceIds = dto.services.map(s => s.campaignServiceId);
  const campaignServices = await prisma.campaignService.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true },
  });
  const serviceNames = new Map(campaignServices.map(s => [s.id, s.name]));

  // Pre-compute next due dates
  const administeredAt = new Date();
  const nextDueDates = new Map<string, Date | null>(
    campaignServices.map(s => [s.id, calculateNextDueDate(s.name, administeredAt)]),
  );

  try {
    const booking = await repo.vaccinatePetBooking({
      petBookingId,
      services: dto.services,
      doctorId: dto.doctorId,
      notes: dto.notes,
      serviceNames,
      nextDueDates,
    });

    // SMS notification (fire-and-forget, with analytics counter)
    const ownerMobile = booking.pet.owner?.mobile;
    const petName = booking.pet.name;
    if (ownerMobile) {
      sendCampaignSms({
        to: ownerMobile,
        message: `Dear owner, your pet ${petName} has been vaccinated at the BPA campaign. Certificate will be issued shortly.`,
        campaignId: booking.registration.campaignId,
      });
    }

    return booking;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Cannot vaccinate')) {
      throw AppError.badRequest(err.message);
    }
    throw err;
  }
}

// ─── Vaccination History ─────────────────────────────────────────

export async function getPetVaccinationHistory(petId: string) {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { id: true, name: true, petType: true, breed: true, owner: { select: { ownerName: true } } },
  });
  if (!pet) throw AppError.notFound('Pet');
  const records = await repo.getPetVaccinationHistory(petId);
  return { pet, records };
}

export async function listVaccinationRecords(query: VaccinationRecordListQuery) {
  return repo.listVaccinationRecords(query);
}
