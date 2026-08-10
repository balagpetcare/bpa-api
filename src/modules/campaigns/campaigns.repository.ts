import { CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import { getAncestorChain, buildLocationTierIds } from '../locations/locations.repository';
import { withFileMeta } from '../../utils/fileType';
import { computeSessionStatus, todayInDhaka, type SessionAvailability } from './campaign-session-status';
import type {
  CreateCampaignDto, UpdateCampaignDto, CampaignListQuery,
  CreateSessionDto, UpdateSessionDto,
  CreateServiceDto, UpdateServiceDto,
  AssignDoctorDto, UpdateDoctorAssignmentDto, BulkAssignDoctorDto, AssignVolunteerDto,
  PublicCampaignSessionsQuery,
} from './campaigns.types';

const campaignInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  coverImage: { select: { id: true, url: true, altText: true } },
  homepageThumbnailMedia: { select: { id: true, url: true, altText: true } },
  _count: { select: { sessions: true, services: true, doctors: true, volunteers: true, registrations: true } },
  media: {
    where: { role: { in: ['thumbnail', 'hero', 'mobile_banner'] } } as any,
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] as any,
    include: { mediaFile: { select: { id: true, url: true, mimeType: true } } },
    take: 3,
  },
  // Minimal service pricing included on list so cards can show discount
  services: {
    where: { isActive: true },
    select: { id: true, priceBdt: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

const campaignDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  coverImage: { select: { id: true, url: true, altText: true } },
  homepageThumbnailMedia: { select: { id: true, url: true, altText: true } },
  certificateTemplate: { select: { id: true, name: true } },
  media: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] as any,
    include: { mediaFile: { select: { id: true, url: true, mimeType: true, sizeBytes: true, originalName: true } } },
  },
  videos: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' } as any,
  },
  sessions: {
    include: {
      venue: {
        select: {
          id: true, name: true, address: true, googleMapsUrl: true,
          latitude: true, longitude: true,
          zone: { include: { cityCorporation: true } },
          location: { select: { id: true, type: true, nameEn: true, nameBn: true, parentId: true } },
          divisionId: true, districtId: true, upazilaId: true, unionId: true,
          cityCorporationId: true, cityZoneId: true, wardId: true,
        },
      },
    },
    orderBy: { sessionDate: 'asc' as const },
  },
  services: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    include: {
      vaccineCatalog: {
        select: { id: true, name: true, description: true, species: true, standardIntervalDays: true, manufacturer: true },
      },
    },
  },
  doctors: { include: { doctor: { select: { id: true, name: true, licenseNumber: true } } } },
  volunteers: { include: { user: { select: { id: true, name: true, email: true } } } },
  analytics: true,
  _count: { select: { registrations: true, sessions: true, services: true, doctors: true, volunteers: true } },
} as const;

// Same shape as campaignDetailInclude but WITHOUT the (potentially
// hundreds-long) `sessions` relation — the DB never even fetches session
// rows for this variant. Used by the public campaign page, which only
// needs metadata (title/description/pricing/services/media/faq) plus small
// aggregate stats (see getCampaignSessionStats), not every raw session.
const { sessions: _sessionsIncludeOmitted, ...campaignDetailIncludeLite } = campaignDetailInclude;

// Adds derived `extension`/`fileCategory` to every media item's nested
// mediaFile so API consumers — the Flutter app's hero/gallery rendering
// in particular — can pick the right preview widget without re-deriving
// type from the URL. (coverImage isn't enriched: its Prisma select
// doesn't include mimeType, so there's nothing to derive category from
// without widening that select — out of scope for this fix.)
function withCampaignMediaMeta<
  T extends { media?: Array<{ mediaFile: Parameters<typeof withFileMeta>[0] }> },
>(campaign: T | null): T | null {
  if (!campaign) return campaign;
  if (!campaign.media) return campaign;
  return {
    ...campaign,
    media: campaign.media.map((m) => ({ ...m, mediaFile: withFileMeta(m.mediaFile) })),
  };
}

// ─── Campaign CRUD ───────────────────────────────────────────────

export async function createCampaign(dto: CreateCampaignDto, slug: string, createdById: string) {
  return prisma.campaign.create({
    data: {
      slug,
      createdById,
      title: dto.title,
      description: dto.description,
      campaignType: dto.campaignType,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      registrationOpenAt: dto.registrationOpenAt ? new Date(dto.registrationOpenAt) : undefined,
      registrationCloseAt: dto.registrationCloseAt ? new Date(dto.registrationCloseAt) : undefined,
      basePriceBdt: dto.basePriceBdt,
      maxPetsPerBooking: dto.maxPetsPerBooking,
      certificateTemplateId: dto.certificateTemplateId,
      coverImageId: dto.coverImageId,
      homepageThumbnailMediaId: dto.homepageThumbnailMediaId,
      metadata: dto.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
      isFeatured: dto.isFeatured,
      allowedPetTypes: dto.allowedPetTypes ?? [],
      termsAndConditions: dto.termsAndConditions,
      faq: dto.faq as Prisma.InputJsonValue ?? Prisma.JsonNull,
    },
    include: campaignInclude,
  });
}

export async function listCampaigns(query: CampaignListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CampaignWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.campaignType) where.campaignType = query.campaignType;
  if (query.search) where.title = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.campaign.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: campaignInclude }),
    prisma.campaign.count({ where }),
  ]);
  return { items: items.map((c) => withCampaignMediaMeta(c)!), meta: buildPaginationMeta(total, page, limit) };
}

export async function listFeaturedCampaigns() {
  const now = new Date();
  // Only campaigns whose registration window is still open (or has no close date set)
  const activeRegistrationFilter = {
    status: CampaignStatus.registration_open,
    OR: [
      { registrationCloseAt: null },
      { registrationCloseAt: { gt: now } },
    ],
  } satisfies Prisma.CampaignWhereInput;

  const [featured, registrationOpen, upcoming] = await Promise.all([
    prisma.campaign.findMany({
      where: { isFeatured: true, ...activeRegistrationFilter },
      orderBy: { startDate: 'asc' },
      take: 3,
      include: campaignInclude,
    }),
    prisma.campaign.findMany({
      where: activeRegistrationFilter,
      orderBy: { registrationCloseAt: 'asc' },
      take: 6,
      include: campaignInclude,
    }),
    prisma.campaign.findMany({
      where: { status: CampaignStatus.published, startDate: { gte: now } },
      orderBy: { startDate: 'asc' },
      take: 6,
      include: campaignInclude,
    }),
  ]);
  return {
    featured: featured.map((c) => withCampaignMediaMeta(c)!),
    registrationOpen: registrationOpen.map((c) => withCampaignMediaMeta(c)!),
    upcoming: upcoming.map((c) => withCampaignMediaMeta(c)!),
  };
}

// Location-first venue discovery for the public booking flow: "which venues
// have an upcoming campaign session in my area" (Division/District/Upazila
// or City Corporation/Zone/Ward). Returns venues with location resolved,
// each carrying the upcoming sessions/campaigns running there.
export interface PublicCampaignVenueFilters {
  divisionId?: string;
  districtId?: string;
  upazilaId?: string;
  unionId?: string;
  cityCorporationId?: string;
  cityZoneId?: string;
  wardId?: string;
}

export async function listPublicCampaignVenues(filters: PublicCampaignVenueFilters) {
  const now = new Date();
  const venueWhere: Prisma.VenueWhereInput = { isActive: true };
  if (filters.divisionId) venueWhere.divisionId = filters.divisionId;
  if (filters.districtId) venueWhere.districtId = filters.districtId;
  if (filters.upazilaId) venueWhere.upazilaId = filters.upazilaId;
  if (filters.unionId) venueWhere.unionId = filters.unionId;
  if (filters.cityCorporationId) venueWhere.cityCorporationId = filters.cityCorporationId;
  if (filters.cityZoneId) venueWhere.cityZoneId = filters.cityZoneId;
  if (filters.wardId) venueWhere.wardId = filters.wardId;

  return prisma.venue.findMany({
    where: {
      ...venueWhere,
      campaignSessions: {
        some: {
          isActive: true,
          sessionDate: { gte: now },
          campaign: {
            status: { in: [CampaignStatus.published, CampaignStatus.registration_open] },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
    include: {
      location: { select: { id: true, type: true, nameEn: true, nameBn: true, parentId: true } },
      campaignSessions: {
        where: {
          isActive: true,
          sessionDate: { gte: now },
          campaign: { status: { in: [CampaignStatus.published, CampaignStatus.registration_open] } },
        },
        orderBy: { sessionDate: 'asc' },
        select: {
          id: true, sessionDate: true, startTime: true, endTime: true, capacity: true, bookedCount: true,
          campaign: { select: { id: true, slug: true, title: true, campaignType: true, status: true } },
        },
      },
    },
  });
}

// ─── Location-first campaign discovery ────────────────────────────
// Given a selected location (any level of the tree), find campaigns whose
// CampaignCoverage matches that location or one of its ancestors (nearest
// match wins), plus any nationwide campaign. Empty result is a normal,
// expected outcome (no campaign currently serves that area).
const PUBLIC_DISCOVERY_STATUSES: CampaignStatus[] = [
  CampaignStatus.published,
  CampaignStatus.registration_open,
];

export interface DiscoveredCampaign {
  campaign: Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;
  matchedLevel: string;
  matchedLocationName: string | null;
}

export async function discoverCampaignsByLocation(locationId: string): Promise<DiscoveredCampaign[]> {
  const now = new Date();
  const ancestors = await getAncestorChain(locationId); // [self, parent, ..., root]
  const rankByLocationId = new Map(ancestors.map((a, idx) => [a.id, idx]));
  const NATIONWIDE_RANK = ancestors.length; // always ranked after every real level

  const coverages = await prisma.campaignCoverage.findMany({
    where: {
      OR: [
        { locationId: { in: ancestors.map((a) => a.id) } },
        { isNationwide: true },
      ],
      campaign: {
        status: { in: PUBLIC_DISCOVERY_STATUSES },
        OR: [
          { registrationCloseAt: null },
          { registrationCloseAt: { gt: now } },
        ],
      },
    },
    include: { campaign: { include: campaignInclude }, location: true },
  });

  const bestByCampaign = new Map<string, { coverage: (typeof coverages)[number]; rank: number }>();
  for (const c of coverages) {
    const rank = c.isNationwide ? NATIONWIDE_RANK : rankByLocationId.get(c.locationId as string) ?? NATIONWIDE_RANK;
    const existing = bestByCampaign.get(c.campaignId);
    if (!existing || rank < existing.rank) {
      bestByCampaign.set(c.campaignId, { coverage: c, rank });
    }
  }

  return Array.from(bestByCampaign.values())
    .sort((a, b) => a.rank - b.rank || a.coverage.campaign.startDate.getTime() - b.coverage.campaign.startDate.getTime())
    .map(({ coverage }) => ({
      campaign: coverage.campaign,
      matchedLevel: coverage.isNationwide ? 'NATIONWIDE' : (coverage.location?.type as string) ?? 'NATIONWIDE',
      matchedLocationName: coverage.isNationwide ? null : coverage.location?.nameEn ?? null,
    }));
}

// ─── Coverage Areas CRUD ───────────────────────────────────────────

export async function listCoverages(campaignId: string) {
  return prisma.campaignCoverage.findMany({
    where: { campaignId },
    include: { location: { select: { id: true, type: true, nameEn: true, nameBn: true, parentId: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getCoverageById(id: string) {
  return prisma.campaignCoverage.findUnique({ where: { id } });
}

export async function findNationwideCoverage(campaignId: string) {
  return prisma.campaignCoverage.findFirst({ where: { campaignId, isNationwide: true } });
}

export async function findCoverageByLocation(campaignId: string, locationId: string) {
  return prisma.campaignCoverage.findFirst({ where: { campaignId, locationId } });
}

export async function createCoverage(campaignId: string, dto: { locationId?: string; isNationwide?: boolean }) {
  return prisma.campaignCoverage.create({
    data: {
      campaignId,
      locationId: dto.locationId ?? null,
      isNationwide: Boolean(dto.isNationwide),
    },
    include: { location: { select: { id: true, type: true, nameEn: true, nameBn: true, parentId: true } } },
  });
}

export async function deleteCoverage(id: string) {
  return prisma.campaignCoverage.delete({ where: { id } });
}

// ─── Public coverage summary ────────────────────────────────────────
// "Campaign Coverage" widget on the public campaign page: compact
// divisions/districts/venues/sessions/capacity metrics plus a bounded
// Division -> District -> Venue tree for the "Explore Coverage" drawer.
// Deliberately does NOT touch the (potentially hundreds-long) sessions
// list beyond per-venue counts — one bounded venues query only.

const FALLBACK_AREA_LABEL = 'Additional Locations';

interface CoverageVenueRow {
  id: string;
  name: string;
  address: string;
  divisionId: string | null;
  districtId: string | null;
  zone: {
    name: string;
    cityCorporation: {
      name: string;
      district: { name: string; division: { name: string } | null } | null;
    } | null;
  } | null;
  campaignSessions: Array<{ capacity: number; bookedCount: number; isActive: boolean; sessionDate: Date }>;
}

export interface CoverageVenueSummary {
  id: string;
  name: string;
  address: string;
  sessionCount: number;
  capacity: number;
  bookedCount: number;
}

export interface CoverageDistrictSummary {
  id: string | null;
  name: string;
  venues: CoverageVenueSummary[];
}

export interface CoverageDivisionSummary {
  id: string | null;
  name: string;
  districts: CoverageDistrictSummary[];
}

export interface CampaignCoverageSummary {
  divisionsCovered: number;
  districtsCovered: number;
  venues: number;
  sessions: number;
  totalCapacity: number;
  bookedCount: number;
  availableSlots: number;
  breakdown: CoverageDivisionSummary[];
}

// Resolves the best available human-readable division/district name for a
// venue: unified Location tree first (authoritative, indexed), falling back
// to the legacy Zone -> CityCorporation -> District -> Division chain for
// older venues that predate the unified tree. Never returns "Unknown" —
// venues with no resolvable area at all fall into a clearly-labeled bucket
// that is excluded from the districtsCovered/divisionsCovered counts.
function resolveVenueArea(
  venue: CoverageVenueRow,
  locationNameById: Map<string, string>,
): { divisionId: string | null; divisionName: string; districtId: string | null; districtName: string; isResolved: boolean } {
  const unifiedDivisionName = venue.divisionId ? locationNameById.get(venue.divisionId) : undefined;
  const unifiedDistrictName = venue.districtId ? locationNameById.get(venue.districtId) : undefined;

  if (unifiedDistrictName) {
    return {
      divisionId: venue.divisionId,
      divisionName: unifiedDivisionName ?? FALLBACK_AREA_LABEL,
      districtId: venue.districtId,
      districtName: unifiedDistrictName,
      isResolved: true,
    };
  }

  const legacyDistrict = venue.zone?.cityCorporation?.district;
  if (legacyDistrict) {
    return {
      divisionId: null,
      divisionName: legacyDistrict.division?.name ?? FALLBACK_AREA_LABEL,
      districtId: null,
      districtName: legacyDistrict.name,
      isResolved: true,
    };
  }

  // City corporation / zone name is still meaningfully human-readable even
  // without a resolvable district — prefer it over the generic bucket.
  const bestEffortName = venue.zone?.cityCorporation?.name ?? venue.zone?.name ?? null;
  return {
    divisionId: null,
    divisionName: FALLBACK_AREA_LABEL,
    districtId: null,
    districtName: bestEffortName ?? FALLBACK_AREA_LABEL,
    isResolved: false,
  };
}

export async function getCampaignCoverageSummary(campaignId: string): Promise<CampaignCoverageSummary> {
  const venues = await prisma.venue.findMany({
    where: { campaignSessions: { some: { campaignId } } },
    select: {
      id: true, name: true, address: true, divisionId: true, districtId: true,
      zone: {
        select: {
          name: true,
          cityCorporation: {
            select: { name: true, district: { select: { name: true, division: { select: { name: true } } } } },
          },
        },
      },
      campaignSessions: {
        where: { campaignId, isActive: true },
        select: { capacity: true, bookedCount: true, isActive: true, sessionDate: true },
      },
    },
  }) as unknown as CoverageVenueRow[];

  const locationIds = Array.from(new Set(
    venues.flatMap((v) => [v.divisionId, v.districtId]).filter((id): id is string => Boolean(id)),
  ));
  const locations = locationIds.length
    ? await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, nameEn: true } })
    : [];
  const locationNameById = new Map(locations.map((l) => [l.id, l.nameEn]));

  const divisionMap = new Map<string, CoverageDivisionSummary>();
  const districtKeyToDivisionKey = new Map<string, string>();
  const resolvedDivisionIds = new Set<string>();
  const resolvedDistrictIds = new Set<string>();

  let sessions = 0;
  let totalCapacity = 0;
  let bookedCount = 0;

  for (const venue of venues) {
    const area = resolveVenueArea(venue, locationNameById);
    const divisionKey = area.divisionId ?? area.divisionName;
    const districtKey = area.districtId ?? `${divisionKey}::${area.districtName}`;
    districtKeyToDivisionKey.set(districtKey, divisionKey);

    if (area.isResolved) {
      if (area.divisionId) resolvedDivisionIds.add(area.divisionId);
      if (area.districtId) resolvedDistrictIds.add(area.districtId);
    }

    if (!divisionMap.has(divisionKey)) {
      divisionMap.set(divisionKey, { id: area.divisionId, name: area.divisionName, districts: [] });
    }
    const division = divisionMap.get(divisionKey)!;
    let district = division.districts.find((d) => (d.id ?? `${divisionKey}::${d.name}`) === districtKey);
    if (!district) {
      district = { id: area.districtId, name: area.districtName, venues: [] };
      division.districts.push(district);
    }

    const venueCapacity = venue.campaignSessions.reduce((a, s) => a + s.capacity, 0);
    const venueBooked = venue.campaignSessions.reduce((a, s) => a + s.bookedCount, 0);
    district.venues.push({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      sessionCount: venue.campaignSessions.length,
      capacity: venueCapacity,
      bookedCount: venueBooked,
    });

    sessions += venue.campaignSessions.length;
    totalCapacity += venueCapacity;
    bookedCount += venueBooked;
  }

  return {
    divisionsCovered: resolvedDivisionIds.size,
    districtsCovered: resolvedDistrictIds.size,
    venues: venues.length,
    sessions,
    totalCapacity,
    bookedCount,
    availableSlots: Math.max(0, totalCapacity - bookedCount),
    breakdown: Array.from(divisionMap.values()),
  };
}

// ─── Public paginated session list ──────────────────────────────────
// Backs the "Sessions & Venues" search/filter/pagination UI — server-side
// filtering + pagination via the project's standard page/limit convention
// (see utils/response.ts), never a full-campaign session dump.

export interface PublicSessionListItem {
  id: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  isActive: boolean;
  notes: string | null;
  status: SessionAvailability;
  venue: {
    id: string;
    name: string;
    address: string;
    googleMapsUrl: string | null;
    locationLabel: string;
  } | null;
}

// Best available single human-readable location line for a session card —
// unified Location tree first, then the legacy Zone/CityCorporation chain,
// then the venue's free-text address. Never "Unknown".
export function venueLocationLabel(venue: {
  location?: { nameEn: string } | null;
  zone?: { name: string; cityCorporation?: { name: string } | null } | null;
  address: string;
} | null): string {
  if (!venue) return 'Venue to be announced';
  if (venue.location?.nameEn) return venue.location.nameEn;
  if (venue.zone?.name) {
    return venue.zone.cityCorporation?.name ? `${venue.zone.name}, ${venue.zone.cityCorporation.name}` : venue.zone.name;
  }
  return venue.address || 'Location details pending';
}

export async function listCampaignSessions(campaignId: string, campaignStatus: CampaignStatus, query: PublicCampaignSessionsQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 8);
  const tab = query.tab ?? 'upcoming';
  const cutoff = todayInDhaka();

  const where: Prisma.CampaignSessionWhereInput = {
    campaignId,
    sessionDate: tab === 'past' ? { lt: cutoff } : { gte: cutoff },
  };
  if (query.divisionId || query.districtId || query.search) {
    where.venue = {
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { location: { nameEn: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
  }
  if (query.date) {
    const d = new Date(`${query.date}T00:00:00.000Z`);
    where.sessionDate = d;
  }

  const orderBy: Prisma.CampaignSessionOrderByWithRelationInput[] = tab === 'past'
    ? [{ sessionDate: 'desc' }, { startTime: 'desc' }]
    : [{ sessionDate: 'asc' }, { startTime: 'asc' }];

  const venueSelect = {
    id: true, name: true, address: true, googleMapsUrl: true,
    location: { select: { nameEn: true } },
    zone: { select: { name: true, cityCorporation: { select: { name: true } } } },
  } as const;

  // `availability` is derived from capacity/bookedCount/date/campaign-status
  // rather than a single indexed column, so it can't be pushed into the SQL
  // `where` as cheaply as the other filters. It's applied as a post-filter
  // over the date/search/division/district-narrowed candidate set instead —
  // acceptable at the campaign scale this queries (hundreds, not millions,
  // of sessions per campaign/date/area combination). If profiling ever
  // shows this matters, `capacity`/`bookedCount` are plain integer columns
  // and the comparison can move into a raw SQL WHERE clause.
  if (query.availability) {
    const candidates = await prisma.campaignSession.findMany({
      where, orderBy,
      select: {
        id: true, sessionDate: true, startTime: true, endTime: true, capacity: true, bookedCount: true,
        isActive: true, notes: true, venue: { select: venueSelect },
      },
    });
    const withStatus = candidates
      .map((s) => ({ ...s, status: computeSessionStatus(s, { status: campaignStatus }) }))
      .filter((s) => s.status === query.availability);
    const total = withStatus.length;
    const items = withStatus.slice(skip, skip + limit).map(toSessionListItem);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  const [rows, total] = await Promise.all([
    prisma.campaignSession.findMany({
      where, orderBy, skip, take: limit,
      select: {
        id: true, sessionDate: true, startTime: true, endTime: true, capacity: true, bookedCount: true,
        isActive: true, notes: true, venue: { select: venueSelect },
      },
    }),
    prisma.campaignSession.count({ where }),
  ]);

  const items = rows.map((s) => toSessionListItem({ ...s, status: computeSessionStatus(s, { status: campaignStatus }) }));
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

function toSessionListItem(s: {
  id: string; sessionDate: Date; startTime: string; endTime: string; capacity: number; bookedCount: number;
  isActive: boolean; notes: string | null; status: SessionAvailability;
  venue: { id: string; name: string; address: string; googleMapsUrl: string | null; location: { nameEn: string } | null; zone: { name: string; cityCorporation: { name: string } | null } | null } | null;
}): PublicSessionListItem {
  return {
    id: s.id,
    sessionDate: s.sessionDate,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    bookedCount: s.bookedCount,
    isActive: s.isActive,
    notes: s.notes,
    status: s.status,
    venue: s.venue ? {
      id: s.venue.id,
      name: s.venue.name,
      address: s.venue.address,
      googleMapsUrl: s.venue.googleMapsUrl,
      locationLabel: venueLocationLabel(s.venue),
    } : null,
  };
}

type VenueTierField = 'wardId' | 'cityZoneId' | 'cityCorporationId' | 'districtId' | 'unionId' | 'upazilaId' | 'divisionId';

interface TierCandidate {
  name: string;
  venueField: VenueTierField;
  selectedId: string | null;
}

function messageFor(tierName: string, isExact: boolean): string {
  if (tierName === 'cityCorporation') return 'Showing venues in your selected city corporation';
  if (isExact) return 'Available in your selected area';
  switch (tierName) {
    case 'zone': return 'No venue in your ward — showing venues in your zone';
    case 'dhakaDistrict': return 'No venue in your city corporation — showing venues in your Dhaka district area';
    case 'upazila': return 'No venue in your union — showing venues in your upazila';
    case 'district': return 'No venue in your upazila — showing venues in your district';
    case 'sameDivision': return 'No venue in your district — showing available venues in your division';
    default: return 'Available in your selected area';
  }
}

function tierKeyFor(tierName: string, isExact: boolean): string {
  if (isExact) return 'exact';
  if (tierName === 'cityCorporation') return 'dhaka_city_corp';
  if (tierName === 'sameDivision') return 'division';
  return tierName;
}

// Restrict a single campaign's sessions to ONE best-matching geographic tier
// relative to a selected location — never mix tiers, and never fall back to
// unrelated venues elsewhere in the campaign. Two mutually exclusive tier
// ladders exist:
//   - Dhaka path (selected location sits inside a City Corporation's tree):
//     ward -> zone -> cityCorporation -> dhakaDistrict
//   - Outside-Dhaka path: union -> upazila -> district -> sameDivision
// Only tiers that are actually reachable from the selected location are
// considered (e.g. selecting a District skips the union/upazila rungs). The
// nearest non-empty tier wins; if nothing matches anywhere in the ladder,
// the result is an explicit empty state — the campaign's other, unrelated
// venues are never shown.
export async function filterSessionsByBestTier<
  T extends {
    sessions: Array<{
      sessionDate: Date;
      venue: {
        wardId?: string | null; cityZoneId?: string | null; cityCorporationId?: string | null;
        districtId?: string | null; unionId?: string | null; upazilaId?: string | null; divisionId?: string | null;
      } | null;
    }>;
  },
>(campaign: T, locationId: string): Promise<T & { venueMatch: { tier: string; message: string } }> {
  const ancestors = await getAncestorChain(locationId); // [self, parent, ..., root]
  const selectedTierIds = buildLocationTierIds(ancestors);
  const isDhakaPath = Boolean(selectedTierIds.cityCorporationId);

  const allCandidates: TierCandidate[] = isDhakaPath
    ? [
        { name: 'ward', venueField: 'wardId', selectedId: selectedTierIds.wardId },
        { name: 'zone', venueField: 'cityZoneId', selectedId: selectedTierIds.cityZoneId },
        { name: 'cityCorporation', venueField: 'cityCorporationId', selectedId: selectedTierIds.cityCorporationId },
        { name: 'dhakaDistrict', venueField: 'districtId', selectedId: selectedTierIds.districtId },
      ]
    : [
        { name: 'union', venueField: 'unionId', selectedId: selectedTierIds.unionId },
        { name: 'upazila', venueField: 'upazilaId', selectedId: selectedTierIds.upazilaId },
        { name: 'district', venueField: 'districtId', selectedId: selectedTierIds.districtId },
        { name: 'sameDivision', venueField: 'divisionId', selectedId: selectedTierIds.divisionId },
      ];

  // Only consider tiers reachable from the selected location (its own id,
  // or one of its ancestors) — e.g. picking a District has no unionId/
  // upazilaId, so those rungs are skipped entirely rather than treated as
  // a mismatch that falls through to "everything".
  const candidates = allCandidates.filter((c) => c.selectedId);

  let bestTier: TierCandidate | null = null;
  let filtered: T['sessions'] = [];
  for (const candidate of candidates) {
    const matches = campaign.sessions.filter((s) => s.venue?.[candidate.venueField] === candidate.selectedId);
    if (matches.length > 0) {
      bestTier = candidate;
      filtered = matches;
      break;
    }
  }

  campaign.sessions = filtered.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime()) as T['sessions'];

  let tier: string;
  let message: string;
  if (!bestTier) {
    tier = 'empty';
    message = 'No venue is currently available near your selected location';
  } else {
    const isExact = bestTier === candidates[0];
    tier = tierKeyFor(bestTier.name, isExact);
    message = messageFor(bestTier.name, isExact);
  }

  return Object.assign(campaign, { venueMatch: { tier, message } });
}

export async function getCampaignById(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignDetailInclude });
  return withCampaignMediaMeta(campaign);
}

export async function getCampaignBySlug(slug: string) {
  const campaign = await prisma.campaign.findUnique({ where: { slug }, include: campaignDetailInclude });
  return withCampaignMediaMeta(campaign);
}

export async function getCampaignByIdLite(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignDetailIncludeLite });
  return withCampaignMediaMeta(campaign);
}

export async function getCampaignBySlugLite(slug: string) {
  const campaign = await prisma.campaign.findUnique({ where: { slug }, include: campaignDetailIncludeLite });
  return withCampaignMediaMeta(campaign);
}

// ─── Session aggregate stats (for the lite campaign detail response) ────
// Everything the public page needs to render hero/capacity stats WITHOUT
// downloading the raw sessions collection — all bounded queries (counts/
// aggregates/a capped lookahead/a capped day-group), never proportional to
// the campaign's total session count.

export interface CampaignSessionStats {
  sessionCount: number;
  totalCapacity: number;
  totalBooked: number;
  totalAvailable: number;
  venueCount: number;
  nextSession: { sessionDate: Date; startTime: string; endTime: string; venueName: string | null } | null;
  dayBreakdown: Array<{ date: string; capacity: number; bookedCount: number }>;
  hasMoreDays: boolean;
}

const MAX_DAY_BREAKDOWN_ROWS = 30;
// How many of the soonest active/future sessions to scan for the first one
// that still has an open slot — small and fixed, not proportional to the
// campaign's total session count.
const NEXT_SESSION_LOOKAHEAD = 20;

export async function getCampaignSessionStats(campaignId: string): Promise<CampaignSessionStats> {
  const cutoff = todayInDhaka();

  const [sessionCount, aggregate, venueCount, upcomingCandidates, dayGroups] = await Promise.all([
    prisma.campaignSession.count({ where: { campaignId } }),
    prisma.campaignSession.aggregate({ where: { campaignId }, _sum: { capacity: true, bookedCount: true } }),
    prisma.venue.count({ where: { campaignSessions: { some: { campaignId } } } }),
    prisma.campaignSession.findMany({
      where: { campaignId, isActive: true, sessionDate: { gte: cutoff } },
      orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
      take: NEXT_SESSION_LOOKAHEAD,
      select: { sessionDate: true, startTime: true, endTime: true, capacity: true, bookedCount: true, venue: { select: { name: true } } },
    }),
    prisma.campaignSession.groupBy({
      by: ['sessionDate'],
      where: { campaignId },
      _sum: { capacity: true, bookedCount: true },
      orderBy: { sessionDate: 'asc' },
      take: MAX_DAY_BREAKDOWN_ROWS + 1,
    }),
  ]);

  const nextSessionRow = upcomingCandidates.find((s) => s.bookedCount < s.capacity) ?? null;
  const totalCapacity = aggregate._sum.capacity ?? 0;
  const totalBooked = aggregate._sum.bookedCount ?? 0;

  return {
    sessionCount,
    totalCapacity,
    totalBooked,
    totalAvailable: Math.max(0, totalCapacity - totalBooked),
    venueCount,
    nextSession: nextSessionRow ? {
      sessionDate: nextSessionRow.sessionDate,
      startTime: nextSessionRow.startTime,
      endTime: nextSessionRow.endTime,
      venueName: nextSessionRow.venue?.name ?? null,
    } : null,
    dayBreakdown: dayGroups.slice(0, MAX_DAY_BREAKDOWN_ROWS).map((g) => ({
      date: g.sessionDate.toISOString().slice(0, 10),
      capacity: g._sum.capacity ?? 0,
      bookedCount: g._sum.bookedCount ?? 0,
    })),
    hasMoreDays: dayGroups.length > MAX_DAY_BREAKDOWN_ROWS,
  };
}

// ─── Single-session lookup ───────────────────────────────────────────
// Resolves exactly one session by its canonical UUID, scoped to the given
// campaign — used to resume a `?session=<id>` deep link (Register/Waitlist)
// without downloading every session in the campaign just to find one row.

export async function getCampaignSessionById(campaignId: string, sessionId: string) {
  return prisma.campaignSession.findFirst({
    where: { id: sessionId, campaignId },
    select: {
      id: true, sessionDate: true, startTime: true, endTime: true, capacity: true, bookedCount: true,
      isActive: true, notes: true,
      venue: {
        select: {
          id: true, name: true, address: true, googleMapsUrl: true, locationId: true,
          location: { select: { nameEn: true } },
          zone: { select: { name: true, cityCorporation: { select: { name: true } } } },
        },
      },
    },
  });
}

export async function updateCampaign(id: string, dto: UpdateCampaignDto) {
  const data: Prisma.CampaignUpdateInput = {
    title: dto.title,
    slug: dto.slug,
    description: dto.description,
    campaignType: dto.campaignType,
    basePriceBdt: dto.basePriceBdt,
    maxPetsPerBooking: dto.maxPetsPerBooking,
    ...(dto.certificateTemplateId !== undefined && {
      certificateTemplate: dto.certificateTemplateId
        ? { connect: { id: dto.certificateTemplateId } }
        : { disconnect: true },
    }),
    ...(dto.coverImageId !== undefined && {
      coverImage: dto.coverImageId
        ? { connect: { id: dto.coverImageId } }
        : { disconnect: true },
    }),
    ...(dto.homepageThumbnailMediaId !== undefined && {
      homepageThumbnailMedia: dto.homepageThumbnailMediaId
        ? { connect: { id: dto.homepageThumbnailMediaId } }
        : { disconnect: true },
    }),
  };
  if (dto.startDate) data.startDate = new Date(dto.startDate);
  if (dto.endDate) data.endDate = new Date(dto.endDate);
  if (dto.registrationOpenAt !== undefined) data.registrationOpenAt = dto.registrationOpenAt ? new Date(dto.registrationOpenAt) : null;
  if (dto.registrationCloseAt !== undefined) data.registrationCloseAt = dto.registrationCloseAt ? new Date(dto.registrationCloseAt) : null;
  if (dto.metadata !== undefined) data.metadata = (dto.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
  if (dto.allowedPetTypes !== undefined) data.allowedPetTypes = dto.allowedPetTypes;
  if (dto.termsAndConditions !== undefined) data.termsAndConditions = dto.termsAndConditions;
  if (dto.faq !== undefined) data.faq = (dto.faq ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  return prisma.campaign.update({ where: { id }, data, include: campaignInclude });
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  return client.campaign.update({ where: { id }, data: { status }, include: campaignInclude });
}

export async function deleteCampaign(id: string) {
  return prisma.campaign.delete({ where: { id } });
}

// ─── Sessions ────────────────────────────────────────────────────

export async function createSession(campaignId: string, dto: CreateSessionDto) {
  return prisma.campaignSession.create({
    data: {
      campaignId,
      venueId: dto.venueId,
      sessionDate: new Date(dto.sessionDate),
      startTime: dto.startTime,
      endTime: dto.endTime,
      capacity: dto.capacity,
      notes: dto.notes,
    },
    include: { venue: { include: { zone: { include: { cityCorporation: true } } } } },
  });
}

export async function listSessions(campaignId: string) {
  return prisma.campaignSession.findMany({
    where: { campaignId },
    orderBy: { sessionDate: 'asc' },
    include: { venue: { include: { zone: { include: { cityCorporation: true } } } } },
  });
}

export async function getSessionById(id: string) {
  return prisma.campaignSession.findUnique({
    where: { id },
    include: { venue: { include: { zone: true } } },
  });
}

export async function updateSession(id: string, dto: UpdateSessionDto) {
  const data: Prisma.CampaignSessionUpdateInput = { ...dto };
  if (dto.sessionDate) data.sessionDate = new Date(dto.sessionDate);
  return prisma.campaignSession.update({ where: { id }, data });
}

export async function deleteSession(id: string) {
  return prisma.campaignSession.delete({ where: { id } });
}

// ─── Services ────────────────────────────────────────────────────

export async function createService(campaignId: string, dto: CreateServiceDto) {
  return prisma.campaignService.create({
    data: {
      campaignId,
      name: dto.name,
      description: dto.description,
      vaccineCatalogId: dto.vaccineCatalogId,
      isRequired: dto.isRequired,
      sortOrder: dto.sortOrder,
      priceBdt: dto.priceBdt,
    },
    include: { vaccineCatalog: { select: { id: true, name: true } } },
  });
}

export async function listServices(campaignId: string, includeInactive = false) {
  return prisma.campaignService.findMany({
    where: { campaignId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { sortOrder: 'asc' },
    include: { vaccineCatalog: { select: { id: true, name: true } } },
  });
}

export async function getServiceById(id: string) {
  return prisma.campaignService.findUnique({ where: { id } });
}

export async function updateService(id: string, dto: UpdateServiceDto) {
  return prisma.campaignService.update({
    where: { id },
    data: {
      name: dto.name,
      description: dto.description,
      vaccineCatalogId: dto.vaccineCatalogId,
      isRequired: dto.isRequired,
      sortOrder: dto.sortOrder,
      priceBdt: dto.priceBdt,
    },
    include: { vaccineCatalog: { select: { id: true, name: true } } },
  });
}

export async function deleteService(id: string) {
  return prisma.campaignService.delete({ where: { id } });
}

// ─── Doctor Assignment ────────────────────────────────────────────

const doctorAssignmentInclude = {
  doctor: { select: { id: true, name: true, licenseNumber: true, specialization: true, mobile: true, email: true, photoUrl: true } },
  session: { select: { id: true, sessionDate: true, startTime: true, endTime: true, venue: { select: { name: true } } } },
} as const;

export async function assignDoctor(campaignId: string, dto: AssignDoctorDto, assignedBy?: string) {
  return prisma.campaignDoctor.create({
    data: {
      campaignId,
      doctorId: dto.doctorId,
      sessionId: dto.sessionId ?? null,
      role: dto.role,
      doctorDuty: dto.doctorDuty,
      isSigningDoctor: dto.isSigningDoctor ?? false,
      isPrimarySupervisor: dto.isPrimarySupervisor ?? false,
      assignedDate: dto.assignedDate,
      notes: dto.notes ?? null,
      assignedBy: assignedBy ?? null,
    },
    include: doctorAssignmentInclude,
  });
}

export async function listCampaignDoctors(campaignId: string, sessionId?: string) {
  return prisma.campaignDoctor.findMany({
    where: { campaignId, ...(sessionId ? { sessionId } : {}) },
    include: doctorAssignmentInclude,
    orderBy: [{ isSigningDoctor: 'desc' }, { doctorDuty: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function updateDoctorAssignment(id: string, dto: UpdateDoctorAssignmentDto) {
  return prisma.campaignDoctor.update({
    where: { id },
    data: {
      ...(dto.role && { role: dto.role }),
      ...(dto.doctorDuty && { doctorDuty: dto.doctorDuty }),
      ...(dto.isSigningDoctor !== undefined && { isSigningDoctor: dto.isSigningDoctor }),
      ...(dto.isPrimarySupervisor !== undefined && { isPrimarySupervisor: dto.isPrimarySupervisor }),
      ...(dto.assignedDate && { assignedDate: dto.assignedDate }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    },
    include: doctorAssignmentInclude,
  });
}

export async function deleteDoctorAssignmentById(id: string) {
  return prisma.campaignDoctor.delete({ where: { id } });
}

export async function removeDoctorAssignment(campaignId: string, doctorId: string) {
  const first = await prisma.campaignDoctor.findFirst({ where: { campaignId, doctorId } });
  if (first) await prisma.campaignDoctor.delete({ where: { id: first.id } });
}

export async function bulkAssignDoctors(campaignId: string, dto: BulkAssignDoctorDto, assignedBy?: string) {
  const results = [];
  for (const item of dto.assignments) {
    const record = await prisma.campaignDoctor.create({
      data: {
        campaignId,
        doctorId: item.doctorId,
        sessionId: item.sessionId ?? null,
        role: item.doctorDuty.toLowerCase(),
        doctorDuty: item.doctorDuty,
        isSigningDoctor: item.isSigningDoctor ?? false,
        isPrimarySupervisor: item.isPrimarySupervisor ?? false,
        notes: item.notes ?? null,
        assignedBy: assignedBy ?? null,
      },
    });
    results.push(record);
  }
  return results;
}

// ─── Volunteer Assignment ─────────────────────────────────────────

export async function assignVolunteer(campaignId: string, dto: AssignVolunteerDto) {
  return prisma.campaignVolunteer.create({
    data: { campaignId, userId: dto.userId, sessionId: dto.sessionId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function listCampaignVolunteers(campaignId: string) {
  return prisma.campaignVolunteer.findMany({
    where: { campaignId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function removeVolunteerAssignment(campaignId: string, userId: string) {
  return prisma.campaignVolunteer.delete({ where: { campaignId_userId: { campaignId, userId } } });
}
