import { config } from '../../config';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { computeOpenNowStatus, haversineDistanceKm } from './clinic-hours.util';
import * as repo from './clinics-public.repository';
import type { PublicBranchRow } from './clinics-public.repository';
import type { PublicClinicListQuery } from './clinics-public.types';

export interface PublicClinicActionLinks {
  call: string | null;
  whatsapp: string | null;
  directions: string | null;
  website: string | null;
  share: string;
}

export interface PublicClinicDto {
  id: string;
  slug: string;
  organizationName: string;
  organizationSlug: string;
  // Central Media Library asset URL when the organization has one selected,
  // falling back to the legacy plain-URL field — never both, and never a
  // raw storage path/media ID (the server always resolves the final URL).
  organizationLogoUrl: string | null;
  organizationCoverUrl: string | null;
  branchName: string;
  address: string | null;
  area: string | null;
  cityCorporation: string | null;
  district: string | null;
  postalCode: string | null;
  location: { latitude: number; longitude: number } | null;
  distanceKm: number | null;
  emergencyAvailability: string;
  open24Hours: string;
  appointmentRequired: string;
  accessibilityNotes: string | null;
  verificationStatus: string;
  lastVerifiedAt: string | null;
  featured: boolean;
  phones: Array<{ phoneNumber: string; label: string | null; isPrimary: boolean; whatsappAvailable: string }>;
  services: string[];
  animalTypes: string[];
  facilities: Array<{ facilityType: string; available: string; notes: string | null }>;
  openingHoursStatus: ReturnType<typeof computeOpenNowStatus>;
  weeklyHours: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }>;
  closures: Array<{ startDate: string; endDate: string | null; reason: string | null }>;
  images: Array<{ url: string; isCover: boolean; altText: string | null }>;
  socialLinks: Array<{ platform: string; url: string; label: string | null }>;
  actions: PublicClinicActionLinks;
}

function buildActionLinks(branch: PublicBranchRow): PublicClinicActionLinks {
  const primaryPhone = branch.phones.find((p) => p.isPrimary) ?? branch.phones[0];
  const whatsappPhone = branch.phones.find((p) => p.whatsappAvailable === 'YES');

  const directions =
    branch.googleMapUrl ??
    (branch.latitude != null && branch.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`
      : null);

  return {
    call: primaryPhone ? `tel:${primaryPhone.phoneNumber}` : null,
    whatsapp: whatsappPhone ? `https://wa.me/${whatsappPhone.phoneNumber.replace(/^0/, '880')}` : null,
    directions,
    website: branch.organization.website ?? null,
    share: `${config.FRONTEND_URL.replace(/\/$/, '')}/clinics/${branch.slug}`,
  };
}

function toDto(branch: PublicBranchRow, distanceKm: number | null): PublicClinicDto {
  return {
    id: branch.id,
    slug: branch.slug!,
    organizationName: branch.organization.name,
    organizationSlug: branch.organization.slug,
    organizationLogoUrl: branch.organization.logoMedia?.url ?? branch.organization.logoUrl ?? null,
    organizationCoverUrl: branch.organization.coverMedia?.url ?? branch.organization.coverImageUrl ?? null,
    branchName: branch.branchName,
    address: branch.address,
    area: branch.area,
    cityCorporation: branch.cityCorporation,
    district: branch.district,
    postalCode: branch.postalCode,
    location:
      branch.latitude != null && branch.longitude != null
        ? { latitude: Number(branch.latitude), longitude: Number(branch.longitude) }
        : null,
    distanceKm,
    emergencyAvailability: branch.emergencyAvailability,
    open24Hours: branch.open24Hours,
    appointmentRequired: branch.appointmentRequired,
    accessibilityNotes: branch.accessibilityNotes,
    verificationStatus: branch.verificationStatus,
    lastVerifiedAt: branch.lastVerifiedAt ? branch.lastVerifiedAt.toISOString() : null,
    featured: branch.organization.featured,
    phones: branch.phones.map((p) => ({
      phoneNumber: p.phoneNumber,
      label: p.label,
      isPrimary: p.isPrimary,
      whatsappAvailable: p.whatsappAvailable,
    })),
    services: branch.services.map((s) => s.serviceName),
    animalTypes: branch.animalTypes.map((a) => a.animalType),
    facilities: branch.facilities.map((f) => ({ facilityType: f.facilityType, available: f.available, notes: f.notes })),
    openingHoursStatus: computeOpenNowStatus(branch.openingHours, branch.timezone),
    weeklyHours: branch.openingHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      opensAt: h.opensAt,
      closesAt: h.closesAt,
      isClosed: h.isClosed,
    })),
    closures: branch.closures.map((c) => ({
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
      reason: c.reason,
    })),
    // Prefer the Media Library asset's URL when this image came from the
    // picker; fall back to the legacy plain-URL column for older rows.
    images: branch.images.map((i) => ({ url: i.mediaFile?.url ?? i.url, isCover: i.isCover, altText: i.altText })),
    socialLinks: branch.socialLinks.map((s) => ({ platform: s.platform, url: s.url, label: s.label })),
    actions: buildActionLinks(branch),
  };
}

export async function listPublicClinics(query: PublicClinicListQuery) {
  const rows = await repo.findPublishedBranches({
    search: query.search,
    organizationSlug: query.organizationSlug,
    cityCorporation: query.cityCorporation,
    area: query.area,
    district: query.district,
    service: query.service,
    animalType: query.animalType,
    facilityType: query.facilityType,
    open24Hours: query.open24Hours === 'true',
    emergencyAvailability: query.emergencyAvailability === 'true',
    appointmentRequired: query.appointmentRequired === 'true',
    verifiedOnly: query.verifiedOnly === 'true',
    featured: query.featured === 'true',
  });

  const hasOrigin = query.latitude !== undefined && query.longitude !== undefined;

  let withDistance = rows.map((branch) => {
    const distanceKm =
      hasOrigin && branch.latitude != null && branch.longitude != null
        ? haversineDistanceKm(query.latitude!, query.longitude!, Number(branch.latitude), Number(branch.longitude))
        : null;
    return { branch, distanceKm };
  });

  // Radius filtering: branches with no coordinates are never excluded by a
  // radius filter — they simply can't claim a distance (see below), but a
  // clinic with unknown coordinates must still be discoverable.
  if (query.radiusKm !== undefined && hasOrigin) {
    withDistance = withDistance.filter((r) => r.distanceKm === null || r.distanceKm <= query.radiusKm!);
  }

  if (query.openNow === 'true') {
    withDistance = withDistance.filter((r) => computeOpenNowStatus(r.branch.openingHours, r.branch.timezone).status === 'OPEN');
  }

  const sortBy = query.sortBy ?? (hasOrigin ? 'distance' : 'name');
  withDistance.sort((a, b) => {
    if (sortBy === 'distance') {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
    } else if (sortBy === 'featured') {
      const fa = a.branch.organization.featured ? 0 : 1;
      const fb = b.branch.organization.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
    } else if (sortBy === 'recentlyVerified') {
      // Nulls (never verified) always sort last, regardless of direction.
      const ta = a.branch.lastVerifiedAt?.getTime() ?? -Infinity;
      const tb = b.branch.lastVerifiedAt?.getTime() ?? -Infinity;
      if (ta !== tb) return tb - ta;
    }
    // Deterministic tiebreaker for every sort mode.
    const nameCompare = a.branch.branchName.localeCompare(b.branch.branchName);
    if (nameCompare !== 0) return nameCompare;
    return a.branch.id.localeCompare(b.branch.id);
  });

  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const total = withDistance.length;
  const pageItems = withDistance.slice(skip, skip + limit);

  return {
    items: pageItems.map(({ branch, distanceKm }) => toDto(branch, distanceKm)),
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function getPublicClinicBySlug(slug: string): Promise<PublicClinicDto> {
  const branch = await repo.findPublishedBranchBySlug(slug);
  if (!branch) throw AppError.notFound('Clinic');
  return toDto(branch, null);
}

export async function getPublicClinicFilters() {
  return repo.getDistinctFilterOptions();
}
