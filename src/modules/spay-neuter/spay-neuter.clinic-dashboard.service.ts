import { prisma } from '../../database/prisma';
import { resolveAuthorizedSpayClinicBranchIds } from '../../middlewares/spayClinicAccess';
import { AppError } from '../../utils/AppError';
import { dhakaWallClockToUtc, toDhakaDateString, toDhakaDisplay } from './spay-neuter.timezone';
import type { ClinicBookingLookupQuery, ClinicOperationListQuery } from './spay-neuter.types';

function addDhakaDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function toClinicRange(fromDate?: string, toDate?: string): { start: Date; end?: Date } {
  const today = toDhakaDateString(new Date());
  const from = fromDate ?? today;
  const to = toDate;
  return {
    start: dhakaWallClockToUtc(from, '00:00'),
    end: to ? dhakaWallClockToUtc(addDhakaDays(to, 1), '00:00') : undefined,
  };
}

function isWithinDhakaTimeRange(instant: Date, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const hhmm = toDhakaDisplay(instant).time;
  if (from && hhmm < from) return false;
  if (to && hhmm > to) return false;
  return true;
}

async function resolveClinicScope(userId: string, roles: string[]) {
  const branchIds = await resolveAuthorizedSpayClinicBranchIds(userId, roles);
  if (branchIds && branchIds.length === 0) {
    throw AppError.forbidden('You are not assigned to any spay/neuter clinic branches', 'SPAY_NOT_CLINIC_STAFF');
  }
  return branchIds;
}

const clinicBookingInclude = {
  pets: { include: { questionnaire: true } },
  statusHistory: { orderBy: { createdAt: 'desc' as const } },
  rescheduleEvents: { orderBy: { createdAt: 'desc' as const } },
  paymentAttempts: { orderBy: { createdAt: 'desc' as const } },
  refundRequests: { orderBy: { createdAt: 'desc' as const } },
  payment: true,
  assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
} as const;

export async function listClinicOperations(userId: string, roles: string[], query: ClinicOperationListQuery) {
  const branchIds = await resolveClinicScope(userId, roles);
  const range = toClinicRange(query.fromDate, query.toDate);

  const bookings = await prisma.spayBooking.findMany({
    where: {
      ...(branchIds ? { clinicBranchId: { in: branchIds } } : {}),
      scheduledStartAt: {
        gte: range.start,
        ...(range.end ? { lt: range.end } : {}),
      },
      ...(query.status ? { status: query.status as never } : { status: { not: 'pending_payment' as never } }),
      ...(query.procedure ? { procedure: query.procedure } : {}),
      ...(query.assignedDoctorId ? { assignedDoctorId: query.assignedDoctorId } : {}),
      ...(query.lane ? { operationLane: { equals: query.lane, mode: 'insensitive' as const } } : {}),
      ...(query.search
        ? {
            OR: [
              { bookingNumber: { contains: query.search, mode: 'insensitive' as const } },
              { bookingCode: { contains: query.search.toUpperCase() } },
              { contactName: { contains: query.search, mode: 'insensitive' as const } },
              { contactPhone: { contains: query.search } },
            ],
          }
        : {}),
    },
    orderBy: [{ scheduledStartAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      pets: { include: { questionnaire: true } },
      payment: true,
      assignedDoctor: { select: { id: true, name: true } },
    },
    take: 500,
  });

  const filtered = bookings.filter((booking) => isWithinDhakaTimeRange(booking.scheduledStartAt, query.startTimeFrom, query.startTimeTo));

  return {
    items: filtered,
    authorizedClinicBranchIds: branchIds ?? null,
    availableLanes: [...new Set(filtered.map((booking) => booking.operationLane).filter((lane): lane is string => Boolean(lane)))].sort(),
    availableDoctors: filtered
      .filter((booking) => booking.assignedDoctor)
      .map((booking) => booking.assignedDoctor!)
      .filter((doctor, index, doctors) => doctors.findIndex((candidate) => candidate.id === doctor.id) === index),
  };
}

export async function getClinicBookingById(bookingId: string, userId: string, roles: string[]) {
  const branchIds = await resolveClinicScope(userId, roles);
  const booking = await prisma.spayBooking.findFirst({
    where: {
      id: bookingId,
      ...(branchIds ? { clinicBranchId: { in: branchIds } } : {}),
    },
    include: clinicBookingInclude,
  });
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

export async function lookupClinicBooking(query: ClinicBookingLookupQuery, userId: string, roles: string[]) {
  const branchIds = await resolveClinicScope(userId, roles);
  const booking = await prisma.spayBooking.findFirst({
    where: {
      ...(branchIds ? { clinicBranchId: { in: branchIds } } : {}),
      ...(query.qrToken
        ? { qrToken: query.qrToken }
        : query.bookingCode
          ? { bookingCode: query.bookingCode.toUpperCase() }
          : { bookingNumber: query.bookingNumber }),
    },
    include: clinicBookingInclude,
  });

  if (!booking) throw AppError.notFound('Booking');
  return booking;
}
