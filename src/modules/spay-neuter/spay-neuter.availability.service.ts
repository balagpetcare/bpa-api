import { createHmac } from 'crypto';
import type { SpayBookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { config } from '../../config';
import { AppError } from '../../utils/AppError';
import {
  generateCandidateStarts,
  resolveDayWindows,
  sweepMaxConcurrency,
  type Interval,
  type NamedInterval,
} from './spay-neuter.scheduling';
import { dhakaWallClockToUtc, toDhakaDisplay } from './spay-neuter.timezone';
import { buildServiceChoices } from './spay-neuter.domain';
import type { SpayProcedureKind } from './spay-neuter.types';

// ─── Availability token ─────────────────────────────────────────────
//
// A server-generated, verifiable correlation id for one (clinic, service,
// start time) combination. It is NOT a capability/authorization — hold
// creation ALWAYS re-derives (clinicBranchId, procedure, startAt) from its
// own request body and re-checks live capacity under a fresh DB lock; nothing
// about a cached availability response, this token included, is ever trusted
// as proof that capacity still exists at booking time.
export function signAvailabilityId(clinicBranchId: string, serviceId: string, startAtIso: string): string {
  return createHmac('sha256', config.QR_SECRET)
    .update(`availability:${clinicBranchId}:${serviceId}:${startAtIso}`)
    .digest('hex')
    .slice(0, 32);
}

// ─── Public offer detail ─────────────────────────────────────────────
//
// Confirmed defect fix: the owner-facing booking flow (Flutter + public
// web) previously had NO way to fetch a SpayOffer's actual price/advance/
// policy text — every prior "offer detail" screen was reading a stale,
// unrelated CampaignModel (CampaignType.spay_neuter has zero real backing
// data — see the implementation contract's decision to build a new
// clinic-scoped domain instead of extending Campaign). Only PUBLISHED,
// non-deleted offers are exposed here, and only the fields an owner needs
// to decide whether to book — no internal admin metadata (createdById,
// audit fields, etc.), matching the output-minimization principle applied
// everywhere else in this module.
const PUBLIC_OFFER_SELECT = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  description: true,
  neuterTotalPriceBdt: true,
  spayTotalPriceBdt: true,
  advanceBdt: true,
  eligibilityText: true,
  medicalInstructions: true,
  fastingRules: true,
  cancellationPolicy: true,
  medicallyUnfitRefundable: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  startsAt: true,
  endsAt: true,
  bookingOpensAt: true,
  bookingClosesAt: true,
  status: true,
  mobileImage: { select: { id: true, url: true, altText: true } },
  webImage: { select: { id: true, url: true, altText: true } },
  gallery: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      mediaFileId: true,
      altText: true,
      caption: true,
      sortOrder: true,
      mediaFile: { select: { url: true } },
    },
  },
  videos: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      videoId: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      customThumbnailMediaId: true,
      customThumbnailMedia: { select: { url: true } },
      sortOrder: true,
    },
  },
  // Only clinics that are BOTH linked to this offer (SpayOfferClinic.isActive)
  // AND actually bookable (a SpayClinicProfile exists and is accepting
  // bookings) — a clinic linked to the offer but never given a profile, or
  // paused via isAcceptingBookings, was previously still listed here, so the
  // mobile/web booking flow could offer it as a selectable clinic and only
  // discover it was unusable once GET .../availability/dates 404'd with
  // SPAY_CLINIC_NOT_CONFIGURED (see loadClinicServiceContext below). Filtering
  // it out here means an unbookable clinic simply never appears as an option.
  clinics: {
    where: {
      isActive: true,
      clinicBranch: { spayClinicProfile: { isAcceptingBookings: true } },
    },
    select: {
      clinicBranch: {
        select: {
          id: true, branchName: true, slug: true, address: true, area: true, district: true, published: true,
          // Additive only — existing consumers (bpa_web's SpayOfferClinicBranch
          // type) read clinicBranch.{id,branchName,...} unchanged; this is a
          // new sibling field on each clinics[] entry, not a shape change.
          spayClinicProfile: {
            select: { services: { where: { isActive: true }, select: { procedure: true } } },
          },
          // Best single contact number (primary first, then sortOrder) — a
          // clinic can have several ClinicBranchPhone rows; only one is
          // surfaced here to keep the offer-detail payload minimal, matching
          // the output-minimization principle used elsewhere in this module.
          phones: {
            orderBy: [
              { isPrimary: 'desc' },
              { sortOrder: 'asc' },
            ] satisfies Prisma.ClinicBranchPhoneOrderByWithRelationInput[],
            take: 1,
            select: { phoneNumber: true },
          },
        },
      },
    },
  },
} as const;

export type PublicOfferLifecycleState = 'scheduled' | 'active' | 'expired' | 'closed';

/** Derives visible lifecycle state from status + the offer's own date window — never trust status alone, since an admin can forget to pause/complete an offer whose window has already lapsed. */
export function computeOfferLifecycleState(
  offer: { status: string; startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): PublicOfferLifecycleState {
  if (offer.status !== 'published') return 'closed';
  if (offer.startsAt && now.getTime() < offer.startsAt.getTime()) return 'scheduled';
  if (offer.endsAt && now.getTime() > offer.endsAt.getTime()) return 'expired';
  return 'active';
}

/** Whether a NEW booking can currently be made against this offer. */
export function computeOfferBookable(
  offer: { status: string; startsAt: Date | null; endsAt: Date | null; bookingOpensAt: Date | null; bookingClosesAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (offer.status !== 'published') return false;
  const opensAt = offer.bookingOpensAt ?? offer.startsAt;
  const closesAt = offer.bookingClosesAt ?? offer.endsAt;
  if (opensAt && now.getTime() < opensAt.getTime()) return false;
  if (closesAt && now.getTime() > closesAt.getTime()) return false;
  return true;
}

function withLifecycle<
  T extends {
    status: string;
    startsAt: Date | null;
    endsAt: Date | null;
    bookingOpensAt: Date | null;
    bookingClosesAt: Date | null;
    neuterTotalPriceBdt: unknown;
    spayTotalPriceBdt: unknown;
    advanceBdt: unknown;
    gallery?: Array<{
      id: string;
      mediaFileId: string;
      altText: string | null;
      caption: string | null;
      sortOrder: number;
      mediaFile: { url: string };
    }>;
    videos?: Array<{
      id: string;
      videoId: string;
      title: string;
      description: string | null;
      thumbnailUrl: string | null;
      customThumbnailMediaId: string | null;
      customThumbnailMedia: { url: string } | null;
      sortOrder: number;
    }>;
    clinics?: Array<{
      clinicBranch: {
        id: string;
        branchName: string;
        slug: string | null;
        address: string | null;
        area: string | null;
        district: string | null;
        published: boolean;
        spayClinicProfile: { services: Array<{ procedure: string }> } | null;
        phones: Array<{ phoneNumber: string }>;
      };
    }>;
  },
>(offer: T, now: Date) {
  return {
    ...offer,
    lifecycleState: computeOfferLifecycleState(offer, now),
    bookable: computeOfferBookable(offer, now),
    // Server-authoritative — never derived from anything a client sends.
    serviceChoices: buildServiceChoices({
      neuterTotalPriceBdt: Number(offer.neuterTotalPriceBdt),
      spayTotalPriceBdt: Number(offer.spayTotalPriceBdt),
      advanceBdt: Number(offer.advanceBdt),
    }),
    galleryImages: offer.gallery?.map((g) => ({
      id: g.id,
      mediaId: g.mediaFileId,
      url: g.mediaFile.url,
      altText: g.altText,
      caption: g.caption,
      sortOrder: g.sortOrder,
    })),
    videos: offer.videos?.map((v) => ({
      id: v.id,
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      thumbnailUrl: v.customThumbnailMedia?.url || v.thumbnailUrl || null,
      customThumbnailMediaId: v.customThumbnailMediaId,
      watchPageUrl: `https://youtube.com/watch?v=${v.videoId}`,
      sortOrder: v.sortOrder,
    })),
    // clinicBranch.{id,branchName,slug,address,area,district,published} is
    // left exactly as existing consumers (bpa_web's SpayOfferClinicBranch
    // type) already read it — spayClinicProfile was only fetched to derive
    // `procedures`, a new sibling field, and is stripped back out here so it
    // never leaks into the wire response as undocumented shape.
    clinics: offer.clinics?.map((c) => ({
      clinicBranch: {
        id: c.clinicBranch.id,
        branchName: c.clinicBranch.branchName,
        slug: c.clinicBranch.slug,
        address: c.clinicBranch.address,
        area: c.clinicBranch.area,
        district: c.clinicBranch.district,
        published: c.clinicBranch.published,
      },
      procedures: c.clinicBranch.spayClinicProfile?.services.map((s) => s.procedure) ?? [],
      phone: c.clinicBranch.phones[0]?.phoneNumber ?? null,
    })),
  };
}

export async function getPublicOffer(offerId: string) {
  const offer = await prisma.spayOffer.findFirst({
    where: { id: offerId, status: 'published', deletedAt: null },
    select: PUBLIC_OFFER_SELECT,
  });
  if (!offer) throw AppError.notFound('Offer');
  return withLifecycle(offer, new Date());
}

/** Public offers listing — published, non-deleted, not yet ended. Draft/paused/completed offers never appear here. */
export async function listPublicOffers() {
  const now = new Date();
  const offers = await prisma.spayOffer.findMany({
    where: {
      status: 'published',
      deletedAt: null,
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { startsAt: 'asc' },
    select: PUBLIC_OFFER_SELECT,
  });
  return offers.map((offer) => withLifecycle(offer, now));
}

export async function getPublicOfferVideo(offerId: string, videoId: string) {
  const offer = await prisma.spayOffer.findFirst({
    where: { id: offerId, status: 'published', deletedAt: null },
    select: { id: true },
  });
  if (!offer) throw AppError.notFound('Offer');

  const video = await prisma.spayOfferVideo.findFirst({
    where: { id: videoId, offerId, isActive: true },
    include: { customThumbnailMedia: { select: { url: true } } },
  });
  if (!video) throw AppError.notFound('Video');

  return {
    id: video.id,
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.customThumbnailMedia?.url || video.thumbnailUrl || null,
    customThumbnailMediaId: video.customThumbnailMediaId,
    watchPageUrl: `https://youtube.com/watch?v=${video.videoId}`,
    sortOrder: video.sortOrder,
  };
}

const OCCUPYING_BOOKING_STATUSES_EXCLUDED: SpayBookingStatus[] = [
  'cancelled_by_owner',
  'cancelled_by_clinic',
  'no_show',
];

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function dayOfWeekForDhakaDate(dateStr: string): number {
  // Compute the day-of-week as it reads on a Dhaka calendar, not the UTC
  // calendar — noon UTC is safely inside the same Dhaka day regardless of
  // the +6 offset, avoiding an off-by-one at either edge of the day.
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  return noonUtc.getUTCDay();
}

export type ClinicServiceContext = {
  clinicBranchId: string;
  clinicProfileId: string;
  concurrentOperationCapacity: number;
  isAcceptingBookings: boolean;
  slotHoldMinutes: number;
  cancellationCutoffHours: number;
  arriveBeforeMinutes: number;
  checkinEarlyMinutes: number;
  bookingHorizonDays: number;
  serviceId: string;
  durationMinutes: number;
  procedure: SpayProcedureKind;
};

/**
 * Confirms the clinic is an active participant of this specific offer —
 * a clinic having its own SpayClinicProfile/services configured is NOT
 * sufficient on its own; it must also be linked via SpayOfferClinic
 * (admin.service.ts's linkOfferClinic). Without this, any active clinic
 * branch could be booked against any published offer regardless of
 * whether an admin ever actually attached it to that campaign.
 */
export async function assertClinicParticipatesInOffer(offerId: string, clinicBranchId: string): Promise<void> {
  const link = await prisma.spayOfferClinic.findUnique({
    where: { offerId_clinicBranchId: { offerId, clinicBranchId } },
  });
  if (!link || !link.isActive) {
    throw AppError.badRequest('This clinic is not part of the selected offer', 'CLINIC_NOT_PARTICIPATING_IN_OFFER');
  }
}

/** Loads and validates the clinic + service context used by both availability listing and hold creation. */
export async function loadClinicServiceContext(
  clinicBranchId: string,
  procedure: SpayProcedureKind,
): Promise<ClinicServiceContext> {
  const clinicProfile = await prisma.spayClinicProfile.findUnique({
    where: { clinicBranchId },
    include: { services: { where: { procedure, isActive: true } } },
  });
  if (!clinicProfile) {
    throw AppError.notFound('Clinic is not configured for spay/neuter bookings', 'SPAY_CLINIC_NOT_CONFIGURED');
  }
  if (!clinicProfile.isAcceptingBookings) {
    throw AppError.badRequest('Clinic is not currently accepting bookings', 'SPAY_CLINIC_NOT_ACCEPTING');
  }
  const service = clinicProfile.services[0];
  if (!service) {
    throw AppError.notFound(`Clinic does not offer ${procedure}`, 'SERVICE_NOT_AVAILABLE_AT_CLINIC');
  }

  return {
    clinicBranchId,
    clinicProfileId: clinicProfile.id,
    concurrentOperationCapacity: clinicProfile.concurrentOperationCapacity,
    isAcceptingBookings: clinicProfile.isAcceptingBookings,
    slotHoldMinutes: clinicProfile.slotHoldMinutes,
    cancellationCutoffHours: clinicProfile.cancellationCutoffHours,
    arriveBeforeMinutes: clinicProfile.arriveBeforeMinutes,
    checkinEarlyMinutes: clinicProfile.checkinEarlyMinutes,
    bookingHorizonDays: clinicProfile.bookingHorizonDays,
    serviceId: service.id,
    durationMinutes: service.durationMinutes,
    procedure,
  };
}

/** Fetches every input resolveDayWindows() needs for one Asia/Dhaka calendar date. */
export async function fetchDayWindowInputs(
  ctx: ClinicServiceContext,
  dateStr: string,
): Promise<Parameters<typeof resolveDayWindows>[0]> {
  const dayOfWeek = dayOfWeekForDhakaDate(dateStr);
  const dayStartUtc = dhakaWallClockToUtc(dateStr, '00:00');
  const dayEndUtc = dhakaWallClockToUtc(addDaysToDateString(dateStr, 1), '00:00');
  const calendarDate = new Date(`${dateStr}T00:00:00.000Z`);

  const [weeklyWindows, serviceWindows, dateException, manualSlots, breaks, blockedPeriods] = await Promise.all([
    prisma.spayClinicSchedule.findMany({
      where: { clinicProfileId: ctx.clinicProfileId, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    }),
    prisma.spayClinicServiceSchedule.findMany({
      where: { serviceId: ctx.serviceId, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    }),
    prisma.spayClinicDateException.findUnique({
      where: { clinicProfileId_exceptionDate: { clinicProfileId: ctx.clinicProfileId, exceptionDate: calendarDate } },
    }),
    prisma.spaySlot.findMany({
      // NULL procedure (every pre-existing manual slot) stays open to
      // either service; a slot explicitly scoped to the OTHER procedure
      // must not open a window for this one (see SLOT_SERVICE_MISMATCH).
      where: { clinicProfileId: ctx.clinicProfileId, slotDate: calendarDate, isActive: true, OR: [{ procedure: null }, { procedure: ctx.procedure }] },
      select: { startTime: true, endTime: true },
    }),
    prisma.spayClinicBreak.findMany({
      where: { clinicProfileId: ctx.clinicProfileId, dayOfWeek },
      select: { startTime: true, endTime: true },
    }),
    prisma.spayClinicBlockedPeriod.findMany({
      where: { clinicProfileId: ctx.clinicProfileId, startAt: { lt: dayEndUtc }, endAt: { gt: dayStartUtc } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return {
    date: dateStr,
    weeklyWindows: weeklyWindows as NamedInterval[],
    serviceWindows: serviceWindows as NamedInterval[],
    dateOverride: dateException
      ? {
          isClosed: dateException.isClosed,
          overrideStartTime: dateException.overrideStartTime,
          overrideEndTime: dateException.overrideEndTime,
        }
      : undefined,
    manualSlots: manualSlots as NamedInterval[],
    breaks: breaks as NamedInterval[],
    blockedPeriods: blockedPeriods.map((b) => ({ start: b.startAt, end: b.endAt })) as Interval[],
  };
}

/**
 * All intervals that occupy clinic capacity for a given day: active,
 * non-expired holds; non-cancelled/non-no-show bookings; and doctor
 * unavailability windows folded in as synthetic occupying intervals (see
 * SpayDoctorUnavailability's schema comment for the "1 doctor ≈ 1 capacity
 * unit" modeling assumption). Excludes a given booking id, if provided —
 * used by reschedule so a booking never collides with its own current slot.
 */
export async function fetchOccupyingIntervals(
  clinicBranchId: string,
  clinicProfileId: string,
  dayStartUtc: Date,
  dayEndUtc: Date,
  excludeBookingId?: string,
  now: Date = new Date(),
): Promise<Interval[]> {
  const [holds, bookings, doctorUnavailabilities] = await Promise.all([
    prisma.spaySlotHold.findMany({
      where: {
        clinicBranchId,
        status: 'active',
        expiresAt: { gt: now },
        candidateStartAt: { lt: dayEndUtc },
        candidateEndAt: { gt: dayStartUtc },
      },
      select: { candidateStartAt: true, candidateEndAt: true },
    }),
    prisma.spayBooking.findMany({
      where: {
        clinicBranchId,
        status: { notIn: OCCUPYING_BOOKING_STATUSES_EXCLUDED },
        scheduledStartAt: { lt: dayEndUtc },
        scheduledEndAt: { gt: dayStartUtc },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { scheduledStartAt: true, scheduledEndAt: true },
    }),
    prisma.spayDoctorUnavailability.findMany({
      where: { clinicProfileId, startAt: { lt: dayEndUtc }, endAt: { gt: dayStartUtc } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return [
    ...holds.map((h) => ({ start: h.candidateStartAt, end: h.candidateEndAt })),
    ...bookings.map((b) => ({ start: b.scheduledStartAt, end: b.scheduledEndAt })),
    ...doctorUnavailabilities.map((d) => ({ start: d.startAt, end: d.endAt })),
  ];
}

export type AvailabilityWindowDto = {
  availabilityId: string;
  clinicBranchId: string;
  procedure: SpayProcedureKind;
  operationStartAt: string;
  operationEndAt: string;
  operationStartDhaka: string;
  operationEndDhaka: string;
  recommendedArrivalAt: string;
  earliestCheckinAt: string;
  capacity: number;
  remaining: number;
  bookable: boolean;
};

/** Service-specific bookable start times for one clinic + procedure + Asia/Dhaka date. */
export async function listAvailableStarts(
  clinicBranchId: string,
  procedure: SpayProcedureKind,
  dateStr: string,
  now: Date = new Date(),
): Promise<AvailabilityWindowDto[]> {
  const ctx = await loadClinicServiceContext(clinicBranchId, procedure);
  const windowInputs = await fetchDayWindowInputs(ctx, dateStr);
  const freeWindows = resolveDayWindows(windowInputs);

  const dayStartUtc = dhakaWallClockToUtc(dateStr, '00:00');
  const dayEndUtc = dhakaWallClockToUtc(addDaysToDateString(dateStr, 1), '00:00');
  const occupying = await fetchOccupyingIntervals(clinicBranchId, ctx.clinicProfileId, dayStartUtc, dayEndUtc, undefined, now);

  const results: AvailabilityWindowDto[] = [];
  for (const window of freeWindows) {
    const starts = generateCandidateStarts(window, ctx.durationMinutes);
    for (const start of starts) {
      if (start.getTime() <= now.getTime()) continue; // past times cannot be booked

      const end = new Date(start.getTime() + ctx.durationMinutes * 60_000);
      // sweepMaxConcurrency includes this candidate itself (it contributes
      // exactly 1 for the whole window), so the existing-only peak at the
      // same instant is (sweepMax - 1), and remaining = capacity - existingPeak.
      const sweepMax = sweepMaxConcurrency({ start, end }, occupying);
      const remaining = Math.max(0, ctx.concurrentOperationCapacity - (sweepMax - 1));
      const bookable = remaining >= 1;

      results.push({
        availabilityId: signAvailabilityId(clinicBranchId, ctx.serviceId, start.toISOString()),
        clinicBranchId,
        procedure,
        operationStartAt: start.toISOString(),
        operationEndAt: end.toISOString(),
        operationStartDhaka: toDhakaDisplay(start).iso,
        operationEndDhaka: toDhakaDisplay(end).iso,
        recommendedArrivalAt: new Date(start.getTime() - ctx.arriveBeforeMinutes * 60_000).toISOString(),
        earliestCheckinAt: new Date(start.getTime() - ctx.checkinEarlyMinutes * 60_000).toISOString(),
        capacity: ctx.concurrentOperationCapacity,
        remaining,
        bookable,
      });
    }
  }
  return results;
}

/** Which Asia/Dhaka dates in [fromDate, toDate] have at least one bookable start. */
export async function listAvailableDates(
  clinicBranchId: string,
  procedure: SpayProcedureKind,
  fromDateStr: string,
  toDateStr: string,
  now: Date = new Date(),
): Promise<string[]> {
  const dates: string[] = [];
  let cursor = fromDateStr;
  while (cursor <= toDateStr) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }

  const available: string[] = [];
  for (const dateStr of dates) {
    const starts = await listAvailableStarts(clinicBranchId, procedure, dateStr, now);
    if (starts.some((s) => s.bookable)) available.push(dateStr);
  }
  return available;
}
