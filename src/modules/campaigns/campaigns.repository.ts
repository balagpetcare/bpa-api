import { CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import { getAncestorChain, buildLocationTierIds } from '../locations/locations.repository';
import { withFileMeta } from '../../utils/fileType';
import type {
  CreateCampaignDto, UpdateCampaignDto, CampaignListQuery,
  CreateSessionDto, UpdateSessionDto,
  CreateServiceDto, UpdateServiceDto,
  AssignDoctorDto, UpdateDoctorAssignmentDto, BulkAssignDoctorDto, AssignVolunteerDto,
} from './campaigns.types';

const campaignInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  coverImage: { select: { id: true, url: true, altText: true } },
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

export async function updateCampaignStatus(id: string, status: CampaignStatus) {
  return prisma.campaign.update({ where: { id }, data: { status }, include: campaignInclude });
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
