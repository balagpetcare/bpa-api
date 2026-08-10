import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import { DHAKA_TIME_ZONE } from './spay-neuter.timezone';

// ─── Admin CRUD for offers, participating clinics, and schedule config ──
//
// Central-admin-only surface (RESOURCES.SPAY_OFFERS / SPAY_CLINICS /
// SPAY_SLOTS, gated at the router). Clinic roles hold no permission on
// spay_offers at all (see prisma/seed/roles-permissions.seed.ts), so price
// (SpayOffer.neuterTotalPriceBdt/spayTotalPriceBdt/advanceBdt) can never be
// reached by a clinic-scoped caller — enforced by RBAC, not by omission
// here. Publishing to the PUBLIC clinic directory is a distinct resource
// (RESOURCES.CLINIC_BRANCHES / clinics:publish, already seeded separately)
// from spay_offers/spay_clinics — offer-clinic participation here never
// touches ClinicBranch.published.

// ── Offers ──────────────────────────────────────────────────────────

export async function listOffers(params: { page?: number; limit?: number; status?: string; search?: string }) {
  const { page, limit, skip } = parsePaginationQuery(params.page, params.limit, 20);
  const where = {
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.search ? { title: { contains: params.search, mode: 'insensitive' as const } } : {}),
    deletedAt: null,
  };
  const [items, total] = await Promise.all([
    prisma.spayOffer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { clinics: true, mobileImage: true, webImage: true, homepageThumbnailMedia: true },
    }),
    prisma.spayOffer.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getOffer(id: string) {
  const offer = await prisma.spayOffer.findUnique({
    where: { id },
    include: {
      clinics: { include: { clinicBranch: { select: { id: true, branchName: true, published: true } } } },
      // Resolves mobileImageId/webImageId into full MediaFile rows (incl. url)
      // — without this, the admin edit form has no way to render the
      // already-saved image, even though the id itself is persisted correctly.
      mobileImage: true,
      webImage: true,
      homepageThumbnailMedia: true,
    },
  });
  if (!offer || offer.deletedAt) throw AppError.notFound('Offer');
  return offer;
}

export type UpsertOfferInput = {
  title: string;
  slug: string;
  summary?: string;
  description?: string;
  neuterTotalPriceBdt: number;
  spayTotalPriceBdt: number;
  advanceBdt: number;
  eligibilityText?: string;
  medicalInstructions?: string;
  fastingRules?: string;
  cancellationPolicy?: string;
  medicallyUnfitRefundable: boolean;
  featuredOnHomepage?: boolean;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  mobileImageId?: string | null;
  webImageId?: string | null;
  homepageThumbnailMediaId?: string | null;
  startsAt: string;
  endsAt: string;
  bookingOpensAt?: string | null;
  bookingClosesAt?: string | null;
};

// zod already enforces ordering on the wire, but the service layer is also
// called directly (tests, future callers) so the invariant is re-asserted
// here rather than relying solely on the router-level validate() middleware.
function assertOfferDateOrdering(startsAt: Date, endsAt: Date, bookingOpensAt: Date | null, bookingClosesAt: Date | null) {
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw AppError.badRequest('Service end must be after service start', 'SPAY_OFFER_INVALID_DATES');
  }
  if (bookingClosesAt && bookingClosesAt.getTime() > endsAt.getTime()) {
    throw AppError.badRequest('Booking close must be at or before the service end date', 'SPAY_OFFER_INVALID_DATES');
  }
  if (bookingOpensAt && bookingClosesAt && bookingOpensAt.getTime() >= bookingClosesAt.getTime()) {
    throw AppError.badRequest('Booking open must be before booking close', 'SPAY_OFFER_INVALID_DATES');
  }
  if (bookingOpensAt && bookingOpensAt.getTime() < startsAt.getTime()) {
    throw AppError.badRequest('Booking cannot open before the service start date', 'SPAY_OFFER_INVALID_DATES');
  }
}

function toOfferDateColumns(dto: Partial<UpsertOfferInput>) {
  const out: { startsAt?: Date; endsAt?: Date; bookingOpensAt?: Date | null; bookingClosesAt?: Date | null } = {};
  if (dto.startsAt !== undefined) out.startsAt = new Date(dto.startsAt);
  if (dto.endsAt !== undefined) out.endsAt = new Date(dto.endsAt);
  if (dto.bookingOpensAt !== undefined) out.bookingOpensAt = dto.bookingOpensAt ? new Date(dto.bookingOpensAt) : null;
  if (dto.bookingClosesAt !== undefined) out.bookingClosesAt = dto.bookingClosesAt ? new Date(dto.bookingClosesAt) : null;
  return out;
}

// Confirms a non-null mobileImageId/webImageId actually references an
// existing MediaFile before the write — without this, an invalid id only
// surfaces as an opaque Prisma FK-constraint error at the database layer
// instead of a clean, structured 400.
async function assertImageReferencesExist(mobileImageId: string | null | undefined, webImageId: string | null | undefined, homepageThumbnailMediaId?: string | null) {
  const ids = [mobileImageId, webImageId, homepageThumbnailMediaId].filter((v): v is string => typeof v === 'string');
  if (ids.length === 0) return;
  const found = await prisma.mediaFile.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const foundIds = new Set(found.map((f) => f.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest(`Referenced media file(s) not found: ${missing.join(', ')}`, 'SPAY_OFFER_INVALID_MEDIA_REFERENCE');
  }
}

export async function createOffer(dto: UpsertOfferInput, actorId: string, auditCtx: AuditContext = {}) {
  if (dto.advanceBdt > dto.neuterTotalPriceBdt || dto.advanceBdt > dto.spayTotalPriceBdt) {
    throw AppError.badRequest('Advance cannot exceed either procedure\'s total price', 'SPAY_ADVANCE_EXCEEDS_TOTAL');
  }
  await assertImageReferencesExist(dto.mobileImageId, dto.webImageId, dto.homepageThumbnailMediaId);
  const dates = toOfferDateColumns(dto);
  assertOfferDateOrdering(dates.startsAt!, dates.endsAt!, dates.bookingOpensAt ?? null, dates.bookingClosesAt ?? null);
  const offer = await prisma.spayOffer.create({
    data: { ...dto, ...dates, createdById: actorId, updatedById: actorId },
  });
  await writeAuditLog({ action: 'create', resource: 'spay_offers', resourceId: offer.id, newValues: { title: offer.title, status: offer.status } }, auditCtx);
  return offer;
}

export async function updateOffer(id: string, dto: Partial<UpsertOfferInput>, actorId: string, auditCtx: AuditContext = {}) {
  const existing = await getOffer(id);
  const neuterTotal = dto.neuterTotalPriceBdt ?? Number(existing.neuterTotalPriceBdt);
  const spayTotal = dto.spayTotalPriceBdt ?? Number(existing.spayTotalPriceBdt);
  const advance = dto.advanceBdt ?? Number(existing.advanceBdt);
  if (advance > neuterTotal || advance > spayTotal) {
    throw AppError.badRequest('Advance cannot exceed either procedure\'s total price', 'SPAY_ADVANCE_EXCEEDS_TOTAL');
  }
  await assertImageReferencesExist(dto.mobileImageId, dto.webImageId, dto.homepageThumbnailMediaId);
  const dates = toOfferDateColumns(dto);
  const effectiveStartsAt = dates.startsAt ?? existing.startsAt;
  const effectiveEndsAt = dates.endsAt ?? existing.endsAt;
  if (effectiveStartsAt && effectiveEndsAt) {
    assertOfferDateOrdering(
      effectiveStartsAt,
      effectiveEndsAt,
      dates.bookingOpensAt !== undefined ? dates.bookingOpensAt : existing.bookingOpensAt,
      dates.bookingClosesAt !== undefined ? dates.bookingClosesAt : existing.bookingClosesAt,
    );
  }
  const offer = await prisma.spayOffer.update({ where: { id }, data: { ...dto, ...dates, updatedById: actorId } });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: id, newValues: dto as Record<string, unknown> }, auditCtx);
  return offer;
}

const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  publish: ['draft', 'paused'],
  pause: ['published'],
  complete: ['published', 'paused'],
  archive: ['draft', 'published', 'paused', 'completed'],
};
const LIFECYCLE_TARGET: Record<string, string> = { publish: 'published', pause: 'paused', complete: 'completed', archive: 'completed' };

export async function transitionOffer(id: string, action: 'publish' | 'pause' | 'complete' | 'archive', actorId: string, auditCtx: AuditContext = {}) {
  const offer = await getOffer(id);
  const allowedFrom = LIFECYCLE_TRANSITIONS[action];
  if (!allowedFrom.includes(offer.status)) {
    throw AppError.conflict(`Cannot ${action} an offer that is ${offer.status}`, 'SPAY_OFFER_INVALID_TRANSITION');
  }
  const timestampField = action === 'publish' ? 'publishedAt' : action === 'pause' ? 'pausedAt' : action === 'complete' ? 'completedAt' : undefined;
  const updated = await prisma.spayOffer.update({
    where: { id },
    data: {
      status: (action === 'archive' ? offer.status : LIFECYCLE_TARGET[action]) as never,
      ...(action === 'archive' ? { deletedAt: new Date() } : {}),
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      updatedById: actorId,
    },
  });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: id, newValues: { lifecycle: action, status: updated.status } }, auditCtx);
  return updated;
}

export async function linkOfferClinic(offerId: string, clinicBranchId: string, auditCtx: AuditContext = {}) {
  await getOffer(offerId);
  const clinicProfile = await prisma.spayClinicProfile.findUnique({ where: { clinicBranchId } });
  if (!clinicProfile) throw AppError.badRequest('Clinic must have a spay/neuter profile configured before it can participate in an offer', 'SPAY_CLINIC_NOT_CONFIGURED');
  const link = await prisma.spayOfferClinic.upsert({
    where: { offerId_clinicBranchId: { offerId, clinicBranchId } },
    update: { isActive: true },
    create: { offerId, clinicBranchId, isActive: true },
  });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: offerId, newValues: { linkedClinicBranchId: clinicBranchId } }, auditCtx);
  return link;
}

export async function unlinkOfferClinic(offerId: string, clinicBranchId: string, auditCtx: AuditContext = {}) {
  await prisma.spayOfferClinic.updateMany({ where: { offerId, clinicBranchId }, data: { isActive: false } });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: offerId, newValues: { unlinkedClinicBranchId: clinicBranchId } }, auditCtx);
}

// ── Offer Media ─────────────────────────────────────────────────────────

export async function listOfferMedia(offerId: string) {
  return prisma.spayOfferMedia.findMany({
    where: { offerId },
    orderBy: { sortOrder: 'asc' },
    include: { mediaFile: true },
  });
}

export async function addOfferMedia(
  offerId: string,
  mediaFileId: string,
  dto: { altText?: string; caption?: string; sortOrder?: number },
  _actorId: string,
  auditCtx: AuditContext = {}
) {
  await getOffer(offerId);

  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaFileId } });
  if (!mediaFile) throw AppError.notFound('Media file not found');
  if (!mediaFile.mimeType.startsWith('image/')) {
    throw AppError.badRequest('Selected media is not an image', 'INVALID_MEDIA_TYPE');
  }

  const existing = await prisma.spayOfferMedia.findUnique({ where: { offerId_mediaFileId: { offerId, mediaFileId } } });
  if (existing) {
    throw AppError.conflict('This image is already added to the gallery', 'DUPLICATE_MEDIA');
  }

  const maxOrderResult = await prisma.spayOfferMedia.aggregate({ where: { offerId }, _max: { sortOrder: true } });
  const sortOrder = dto.sortOrder ?? ((maxOrderResult._max.sortOrder ?? -1) + 1);

  const media = await prisma.spayOfferMedia.create({
    data: { offerId, mediaFileId, altText: dto.altText, caption: dto.caption, sortOrder },
    include: { mediaFile: true },
  });
  await writeAuditLog({ action: 'create', resource: 'spay_offer_media', resourceId: media.id, newValues: { offerId, mediaFileId } }, auditCtx);
  return media;
}

export async function updateOfferMedia(
  id: string,
  dto: { altText?: string; caption?: string; isActive?: boolean },
  _actorId: string,
  auditCtx: AuditContext = {}
) {
  const media = await prisma.spayOfferMedia.update({ where: { id }, data: dto, include: { mediaFile: true } });
  await writeAuditLog({ action: 'update', resource: 'spay_offer_media', resourceId: id, newValues: dto as Record<string, unknown> }, auditCtx);
  return media;
}

export async function removeOfferMedia(id: string, auditCtx: AuditContext = {}) {
  const deleted = await prisma.spayOfferMedia.delete({ where: { id } });
  await writeAuditLog({ action: 'delete', resource: 'spay_offer_media', resourceId: id, newValues: { offerId: deleted.offerId } }, auditCtx);
  return deleted;
}

export async function reorderOfferMedia(offerId: string, orderedIds: string[], auditCtx: AuditContext = {}) {
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.spayOfferMedia.updateMany({
        where: { id: orderedIds[i], offerId },
        data: { sortOrder: i },
      });
    }
  });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: offerId, newValues: { action: 'reorder_media' } }, auditCtx);
}

// ── Offer Videos ────────────────────────────────────────────────────────

const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(urlOrId: string): string {
  if (!urlOrId) throw AppError.badRequest('Video URL or ID is required', 'INVALID_VIDEO');
  const match = urlOrId.match(YOUTUBE_REGEX);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  throw AppError.badRequest('Invalid YouTube URL or ID', 'INVALID_YOUTUBE_VIDEO');
}

export async function listOfferVideos(offerId: string) {
  return prisma.spayOfferVideo.findMany({
    where: { offerId },
    include: { customThumbnailMedia: { select: { url: true } } },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createOfferVideo(
  offerId: string,
  dto: { urlOrId: string; title: string; description?: string; thumbnailUrl?: string; sortOrder?: number; customThumbnailMediaId?: string | null },
  _actorId: string,
  auditCtx: AuditContext = {}
) {
  await getOffer(offerId);
  const videoId = extractYouTubeId(dto.urlOrId);

  const maxOrderResult = await prisma.spayOfferVideo.aggregate({ where: { offerId }, _max: { sortOrder: true } });
  const sortOrder = dto.sortOrder ?? ((maxOrderResult._max.sortOrder ?? -1) + 1);

  const video = await prisma.spayOfferVideo.create({
    data: { offerId, videoId, title: dto.title, description: dto.description, thumbnailUrl: dto.thumbnailUrl, customThumbnailMediaId: dto.customThumbnailMediaId, sortOrder },
  });
  await writeAuditLog({ action: 'create', resource: 'spay_offer_videos', resourceId: video.id, newValues: { offerId, videoId } }, auditCtx);
  return video;
}

export async function updateOfferVideo(
  id: string,
  dto: { urlOrId?: string; title?: string; description?: string; thumbnailUrl?: string; isActive?: boolean; customThumbnailMediaId?: string | null },
  _actorId: string,
  auditCtx: AuditContext = {}
) {
  const data: any = { ...dto };
  if (dto.urlOrId) {
    data.videoId = extractYouTubeId(dto.urlOrId);
    delete data.urlOrId;
  }
  const video = await prisma.spayOfferVideo.update({ where: { id }, data });
  await writeAuditLog({ action: 'update', resource: 'spay_offer_videos', resourceId: id, newValues: data }, auditCtx);
  return video;
}

export async function removeOfferVideo(id: string, auditCtx: AuditContext = {}) {
  const deleted = await prisma.spayOfferVideo.delete({ where: { id } });
  await writeAuditLog({ action: 'delete', resource: 'spay_offer_videos', resourceId: id, newValues: { offerId: deleted.offerId } }, auditCtx);
  return deleted;
}

export async function reorderOfferVideos(offerId: string, orderedIds: string[], auditCtx: AuditContext = {}) {
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.spayOfferVideo.updateMany({
        where: { id: orderedIds[i], offerId },
        data: { sortOrder: i },
      });
    }
  });
  await writeAuditLog({ action: 'update', resource: 'spay_offers', resourceId: offerId, newValues: { action: 'reorder_videos' } }, auditCtx);
}

// ── Participating clinics (SpayClinicProfile) ─────────────────────────

export async function listClinicProfiles(params: { page?: number; limit?: number }) {
  const { page, limit, skip } = parsePaginationQuery(params.page, params.limit, 20);
  const [items, total] = await Promise.all([
    prisma.spayClinicProfile.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        clinicBranch: { select: { id: true, branchName: true, published: true, area: true, district: true } },
        services: true,
        schedules: true,
        breaks: true,
        blockedPeriods: true,
        dateExceptions: true,
        slots: { orderBy: { slotDate: 'asc' }, take: 50 },
        staff: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }),
    prisma.spayClinicProfile.count(),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getClinicProfile(id: string) {
  const profile = await prisma.spayClinicProfile.findUnique({
    where: { id },
    include: {
      clinicBranch: { select: { id: true, branchName: true, published: true, address: true } },
      services: true,
      schedules: true,
      breaks: true,
      blockedPeriods: true,
      dateExceptions: true,
      slots: { orderBy: { slotDate: 'asc' }, take: 50 },
      staff: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!profile) throw AppError.notFound('Clinic profile');
  return profile;
}

export type UpsertClinicProfileInput = {
  clinicBranchId: string;
  concurrentOperationCapacity: number;
  isAcceptingBookings?: boolean;
  slotHoldMinutes?: number;
  cancellationCutoffHours?: number;
  arriveBeforeMinutes?: number;
  checkinEarlyMinutes?: number;
  bookingHorizonDays?: number;
  timezone?: string;
};

export async function createClinicProfile(dto: UpsertClinicProfileInput, actorId: string, auditCtx: AuditContext = {}) {
  const branch = await prisma.clinicBranch.findUnique({ where: { id: dto.clinicBranchId } });
  if (!branch) throw AppError.notFound('Clinic branch');
  const existing = await prisma.spayClinicProfile.findUnique({ where: { clinicBranchId: dto.clinicBranchId } });
  if (existing) throw AppError.conflict('This clinic already has a spay/neuter profile', 'SPAY_CLINIC_PROFILE_EXISTS');

  // Transactional: the clinic profile and its two default service rows
  // must be created atomically — a failure partway through (e.g. the
  // createMany failing after the profile row commits) must never leave a
  // clinic profile with zero configured services.
  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.spayClinicProfile.create({ data: { ...dto, createdById: actorId, updatedById: actorId } });

    // Seed the two default service durations — 20 min neuter / 40 min spay,
    // per spec — the clinic can override afterward.
    await tx.spayClinicService.createMany({
      data: [
        { clinicProfileId: created.id, procedure: 'neuter', durationMinutes: 20 },
        { clinicProfileId: created.id, procedure: 'spay', durationMinutes: 40 },
      ],
    });

    return created;
  });

  await writeAuditLog({ action: 'create', resource: 'spay_clinics', resourceId: profile.id, newValues: { clinicBranchId: dto.clinicBranchId } }, auditCtx);
  return getClinicProfile(profile.id);
}

export async function updateClinicProfile(id: string, dto: Partial<UpsertClinicProfileInput>, actorId: string, auditCtx: AuditContext = {}) {
  await getClinicProfile(id);
  const { clinicBranchId: _ignored, ...rest } = dto;
  const profile = await prisma.spayClinicProfile.update({ where: { id }, data: { ...rest, updatedById: actorId } });
  await writeAuditLog({ action: 'update', resource: 'spay_clinics', resourceId: id, newValues: rest as Record<string, unknown> }, auditCtx);
  return profile;
}

export async function upsertClinicService(clinicProfileId: string, procedure: 'neuter' | 'spay', durationMinutes: number, isActive: boolean, auditCtx: AuditContext = {}) {
  const service = await prisma.spayClinicService.upsert({
    where: { clinicProfileId_procedure: { clinicProfileId, procedure } },
    update: { durationMinutes, isActive },
    create: { clinicProfileId, procedure, durationMinutes, isActive },
  });
  await writeAuditLog({ action: 'update', resource: 'spay_clinics', resourceId: clinicProfileId, newValues: { procedure, durationMinutes, isActive } }, auditCtx);
  return service;
}

// ── Weekly schedule, breaks, blocked periods, date exceptions ────────

export async function addSchedule(clinicProfileId: string, dayOfWeek: number, startTime: string, endTime: string) {
  await getClinicProfile(clinicProfileId);
  if (dayOfWeek < 0 || dayOfWeek > 6) throw AppError.badRequest('dayOfWeek must be 0-6', 'SPAY_INVALID_DAY_OF_WEEK');
  if (startTime >= endTime) throw AppError.badRequest('startTime must be before endTime', 'SPAY_INVALID_TIME_RANGE');
  // Overlaps are intentionally NOT hard-blocked here — the admin UI lets a
  // clinic-ops user create windows freely (e.g. while restructuring a
  // schedule) and then surfaces overlaps via detectScheduleConflicts() for
  // review/cleanup. See spay-neuter.admin.test.ts for the existing,
  // intentional round-trip test of that flow.
  return prisma.spayClinicSchedule.create({ data: { clinicProfileId, dayOfWeek, startTime, endTime } });
}

export async function removeSchedule(clinicProfileId: string, scheduleId: string) {
  await prisma.spayClinicSchedule.deleteMany({ where: { id: scheduleId, clinicProfileId } });
}

export async function addBreak(clinicProfileId: string, dayOfWeek: number, startTime: string, endTime: string, label?: string) {
  await getClinicProfile(clinicProfileId);
  if (startTime >= endTime) throw AppError.badRequest('startTime must be before endTime', 'SPAY_INVALID_TIME_RANGE');
  return prisma.spayClinicBreak.create({ data: { clinicProfileId, dayOfWeek, startTime, endTime, label } });
}

export async function removeBreak(clinicProfileId: string, breakId: string) {
  await prisma.spayClinicBreak.deleteMany({ where: { id: breakId, clinicProfileId } });
}

export async function addBlockedPeriod(clinicProfileId: string, startAt: Date, endAt: Date, reason: string | undefined, actorId: string) {
  await getClinicProfile(clinicProfileId);
  if (startAt >= endAt) throw AppError.badRequest('startAt must be before endAt', 'SPAY_INVALID_TIME_RANGE');
  return prisma.spayClinicBlockedPeriod.create({ data: { clinicProfileId, startAt, endAt, reason, createdById: actorId } });
}

export async function removeBlockedPeriod(clinicProfileId: string, blockedPeriodId: string) {
  await prisma.spayClinicBlockedPeriod.deleteMany({ where: { id: blockedPeriodId, clinicProfileId } });
}

export async function upsertDateException(clinicProfileId: string, exceptionDate: Date, isClosed: boolean, overrideStartTime?: string, overrideEndTime?: string, reason?: string) {
  await getClinicProfile(clinicProfileId);
  return prisma.spayClinicDateException.upsert({
    where: { clinicProfileId_exceptionDate: { clinicProfileId, exceptionDate } },
    update: { isClosed, overrideStartTime, overrideEndTime, reason },
    create: { clinicProfileId, exceptionDate, isClosed, overrideStartTime, overrideEndTime, reason },
  });
}

export async function removeDateException(clinicProfileId: string, exceptionId: string) {
  await prisma.spayClinicDateException.deleteMany({ where: { id: exceptionId, clinicProfileId } });
}

export async function createManualSlot(
  clinicProfileId: string,
  slotDate: Date,
  startTime: string,
  endTime: string,
  capacity: number,
  procedure?: 'neuter' | 'spay' | null,
) {
  const profile = await getClinicProfile(clinicProfileId);
  if (startTime >= endTime) throw AppError.badRequest('startTime must be before endTime', 'SPAY_INVALID_TIME_RANGE');
  if (capacity < 1 || capacity > profile.concurrentOperationCapacity) {
    throw AppError.badRequest(`Capacity must be between 1 and the clinic's concurrent capacity (${profile.concurrentOperationCapacity})`, 'SPAY_INVALID_CAPACITY');
  }
  // null/omitted = open to either procedure (matches every pre-existing manual slot).
  return prisma.spaySlot.create({ data: { clinicProfileId, slotDate, startTime, endTime, capacity, procedure: procedure ?? null } });
}

export async function removeManualSlot(clinicProfileId: string, slotId: string) {
  await prisma.spaySlot.deleteMany({ where: { id: slotId, clinicProfileId } });
}

/**
 * Schedule-conflict detection for the admin preview screen — flags overlaps
 * BETWEEN configured inputs themselves (e.g. two weekly-schedule rows for
 * the same day that overlap, or a break that falls entirely outside every
 * schedule window), distinct from the runtime capacity engine in
 * spay-neuter.scheduling.ts, which checks bookings/holds against a single
 * resolved window. This is a configuration sanity check, not a booking check.
 */
export async function detectScheduleConflicts(clinicProfileId: string) {
  const profile = await getClinicProfile(clinicProfileId);
  const conflicts: { type: string; message: string }[] = [];

  const byDay = new Map<number, { startTime: string; endTime: string }[]>();
  for (const s of profile.schedules) {
    const list = byDay.get(s.dayOfWeek) ?? [];
    list.push({ startTime: s.startTime, endTime: s.endTime });
    byDay.set(s.dayOfWeek, list);
  }
  for (const [day, windows] of byDay) {
    const sorted = [...windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        conflicts.push({ type: 'overlapping_schedule', message: `Day ${day}: schedule windows ${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime} overlap` });
      }
    }
  }

  for (const b of profile.breaks) {
    const windows = byDay.get(b.dayOfWeek) ?? [];
    const covered = windows.some((w) => w.startTime <= b.startTime && b.endTime <= w.endTime);
    if (!covered) {
      conflicts.push({ type: 'break_outside_schedule', message: `Day ${b.dayOfWeek}: break ${b.startTime}-${b.endTime} falls outside any scheduled window` });
    }
  }

  for (const svc of profile.services) {
    if (svc.durationMinutes <= 0) conflicts.push({ type: 'invalid_duration', message: `${svc.procedure} has a non-positive duration` });
  }

  if (profile.schedules.length === 0 && profile.slots.length === 0) {
    conflicts.push({ type: 'no_availability', message: 'No weekly schedule and no manual slots — this clinic has zero bookable time' });
  }

  return conflicts;
}

// ── Bookings (admin, cross-clinic) ────────────────────────────────────

export interface AdminBookingListParams {
  page?: number;
  limit?: number;
  status?: string;
  clinicBranchId?: string;
  procedure?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  timeFrom?: string;
  timeTo?: string;
  paymentStatus?: string;
  refundStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'processed';
}

const BOOKING_LIST_INCLUDE = {
  pets: true,
  assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
  payment: true,
} as const;

export async function listBookingsAdmin(params: AdminBookingListParams) {
  const { page, limit, skip } = parsePaginationQuery(params.page, params.limit, 20);

  const fromDate = params.fromDate ? new Date(params.fromDate) : undefined;
  // A bare "YYYY-MM-DD" toDate must include the whole day, not just its
  // midnight instant — otherwise `fromDate === toDate` (a single-day
  // filter, e.g. "today") would only ever match a booking scheduled at
  // exactly 00:00:00 UTC and silently exclude everything else that day.
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const toDate = params.toDate
    ? isDateOnly(params.toDate)
      ? new Date(new Date(params.toDate).getTime() + 24 * 3_600_000 - 1)
      : new Date(params.toDate)
    : undefined;
  if ((params.fromDate && Number.isNaN(fromDate?.getTime())) || (params.toDate && Number.isNaN(toDate?.getTime()))) {
    throw AppError.badRequest('Invalid fromDate/toDate', 'SPAY_INVALID_DATE_RANGE');
  }

  const where: Prisma.SpayBookingWhereInput = {
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.clinicBranchId ? { clinicBranchId: params.clinicBranchId } : {}),
    ...(params.procedure ? { procedure: params.procedure as never } : {}),
    ...(params.search
      ? {
          OR: [
            { bookingNumber: { contains: params.search, mode: 'insensitive' as const } },
            { bookingCode: { contains: params.search.toUpperCase() } },
            { contactPhone: { contains: params.search } },
            { contactName: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(fromDate || toDate
      ? {
          scheduledStartAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(params.paymentStatus ? { payment: { is: { status: params.paymentStatus as never } } } : {}),
    ...(params.refundStatus
      ? params.refundStatus === 'none'
        ? { refundRequests: { none: {} } }
        : { refundRequests: { some: { status: params.refundStatus as never } } }
      : {}),
  };

  // Time-of-day (Asia/Dhaka wall-clock) has no direct Prisma comparison on a
  // UTC timestamp column. When requested, resolve the matching id set with
  // one parameterized raw query carrying every other filter too (so it can
  // still use the scheduledStartAt/clinicBranchId indexes via the date/
  // clinic predicates), then hydrate the actual page normally. Untouched
  // (zero extra query) when no time filter is given.
  if (params.timeFrom || params.timeTo) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`(scheduled_start_at AT TIME ZONE ${DHAKA_TIME_ZONE})::time >= ${params.timeFrom ?? '00:00'}::time`,
      Prisma.sql`(scheduled_start_at AT TIME ZONE ${DHAKA_TIME_ZONE})::time <= ${params.timeTo ?? '23:59'}::time`,
    ];
    if (params.status) conditions.push(Prisma.sql`status = ${params.status}::"SpayBookingStatus"`);
    if (params.clinicBranchId) conditions.push(Prisma.sql`clinic_branch_id = ${params.clinicBranchId}::uuid`);
    if (params.procedure) conditions.push(Prisma.sql`procedure = ${params.procedure}::"SpayProcedure"`);
    if (fromDate) conditions.push(Prisma.sql`scheduled_start_at >= ${fromDate}`);
    if (toDate) conditions.push(Prisma.sql`scheduled_start_at <= ${toDate}`);
    if (params.search) {
      conditions.push(Prisma.sql`(
        booking_number ILIKE ${`%${params.search}%`}
        OR booking_code LIKE ${`%${params.search.toUpperCase()}%`}
        OR contact_phone LIKE ${`%${params.search}%`}
        OR contact_name ILIKE ${`%${params.search}%`}
      )`);
    }

    const idRows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM spay_bookings WHERE ${Prisma.join(conditions, ' AND ')}`,
    );
    const timeFilteredIds = idRows.map((r) => r.id);
    // payment/refund-status filters aren't expressible in the raw pass above
    // (they're relation filters) — AND them in via the normal Prisma where,
    // scoped to just this id set, so every filter still composes correctly.
    const combinedWhere: Prisma.SpayBookingWhereInput = { ...where, id: { in: timeFilteredIds } };
    const [items, total] = await Promise.all([
      prisma.spayBooking.findMany({
        where: combinedWhere, skip, take: limit, orderBy: { scheduledStartAt: 'desc' }, include: BOOKING_LIST_INCLUDE,
      }),
      prisma.spayBooking.count({ where: combinedWhere }),
    ]);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  const [items, total] = await Promise.all([
    prisma.spayBooking.findMany({
      where, skip, take: limit, orderBy: { scheduledStartAt: 'desc' }, include: BOOKING_LIST_INCLUDE,
    }),
    prisma.spayBooking.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getBookingAdmin(id: string) {
  const booking = await prisma.spayBooking.findUnique({
    where: { id },
    include: {
      pets: { include: { questionnaire: true } },
      statusHistory: { orderBy: { createdAt: 'desc' } },
      rescheduleEvents: { orderBy: { createdAt: 'desc' } },
      paymentAttempts: { orderBy: { createdAt: 'desc' } },
      refundRequests: { orderBy: { createdAt: 'desc' } },
      payment: true,
      assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

// ── Dashboard summary ─────────────────────────────────────────────────

export async function getDashboardSummary() {
  const [offersByStatus, bookingsByStatus, refundsPending, clinicCount, todayBookings] = await Promise.all([
    prisma.spayOffer.groupBy({ by: ['status'], _count: true, where: { deletedAt: null } }),
    prisma.spayBooking.groupBy({ by: ['status'], _count: true }),
    prisma.spayRefundRequest.count({ where: { status: 'pending' } }),
    prisma.spayClinicProfile.count(),
    prisma.spayBooking.count({
      where: { scheduledStartAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)), lt: new Date(new Date().setUTCHours(24, 0, 0, 0)) } },
    }),
  ]);
  return {
    offersByStatus: Object.fromEntries(offersByStatus.map((o) => [o.status, o._count])),
    bookingsByStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count])),
    refundsPending,
    clinicCount,
    todayBookings,
  };
}

// ── Reports ────────────────────────────────────────────────────────────

export async function getRevenueReport(params: { fromDate?: string; toDate?: string }) {
  const where = {
    status: { in: ['confirmed', 'checked_in', 'pre_op_assessment', 'ready_for_operation', 'in_operation', 'completed'] as never },
    ...(params.fromDate || params.toDate
      ? {
          createdAt: {
            ...(params.fromDate ? { gte: new Date(params.fromDate) } : {}),
            ...(params.toDate ? { lte: new Date(params.toDate) } : {}),
          },
        }
      : {}),
  };
  const bookings = await prisma.spayBooking.findMany({
    where,
    select: { advancePaidBdt: true, balanceCollectedBdt: true, procedure: true, clinicNameSnapshot: true },
  });
  const totalAdvance = bookings.reduce((sum, b) => sum + Number(b.advancePaidBdt), 0);
  const totalBalanceCollected = bookings.reduce((sum, b) => sum + Number(b.balanceCollectedBdt), 0);
  const byProcedure = bookings.reduce<Record<string, number>>((acc, b) => {
    acc[b.procedure] = (acc[b.procedure] ?? 0) + 1;
    return acc;
  }, {});
  return { bookingCount: bookings.length, totalAdvanceBdt: totalAdvance, totalBalanceCollectedBdt: totalBalanceCollected, byProcedure };
}

// ── Audit history (spay_* resources only) ─────────────────────────────

export async function listSpayAuditLog(params: { page?: number; limit?: number; resourceId?: string }) {
  const { page, limit, skip } = parsePaginationQuery(params.page, params.limit, 20);
  const where = {
    resource: { startsWith: 'spay_' },
    ...(params.resourceId ? { resourceId: params.resourceId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}
