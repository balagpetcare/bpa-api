import { Prisma, LocationType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type {
  CreateCountryDto, UpdateCountryDto,
  CreateDivisionDto, UpdateDivisionDto,
  CreateDistrictDto, UpdateDistrictDto,
  CreateCityCorporationDto, UpdateCityCorporationDto,
  CreateZoneDto, UpdateZoneDto,
  CreateVenueDto, UpdateVenueDto,
  LocationListQuery,
} from './locations.types';

// ─── Countries ───────────────────────────────────────────────────

export async function createCountry(dto: CreateCountryDto) {
  return prisma.country.create({ data: dto });
}

export async function listCountries(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 100);
  const where: Prisma.CountryWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.country.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.country.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getCountryById(id: string) {
  return prisma.country.findUnique({ where: { id } });
}

export async function updateCountry(id: string, dto: UpdateCountryDto) {
  return prisma.country.update({ where: { id }, data: dto });
}

export async function countDivisionsByCountry(countryId: string) {
  return prisma.division.count({ where: { countryId } });
}

export async function findDivisionByNameAndCountry(name: string, countryId: string) {
  return prisma.division.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, countryId } });
}

export async function deleteCountry(id: string) {
  return prisma.country.delete({ where: { id } });
}

// ─── Divisions ───────────────────────────────────────────────────

export async function createDivision(dto: CreateDivisionDto) {
  return prisma.division.create({ data: dto, include: { country: true } });
}

export async function listDivisions(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 100);
  const where: Prisma.DivisionWhereInput = {};
  if (query.countryId) where.countryId = query.countryId;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.division.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: { country: { select: { id: true, name: true } } } }),
    prisma.division.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getDivisionById(id: string) {
  return prisma.division.findUnique({ where: { id }, include: { country: true } });
}

export async function updateDivision(id: string, dto: UpdateDivisionDto) {
  return prisma.division.update({ where: { id }, data: dto });
}

export async function countDistrictsByDivision(divisionId: string) {
  return prisma.district.count({ where: { divisionId } });
}

export async function findDistrictByNameAndDivision(name: string, divisionId: string) {
  return prisma.district.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, divisionId } });
}

export async function deleteDivision(id: string) {
  return prisma.division.delete({ where: { id } });
}

// ─── Districts ───────────────────────────────────────────────────

export async function createDistrict(dto: CreateDistrictDto) {
  return prisma.district.create({ data: dto, include: { division: { include: { country: true } } } });
}

export async function listDistricts(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 100);
  const where: Prisma.DistrictWhereInput = {};
  if (query.divisionId) where.divisionId = query.divisionId;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.district.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: { division: { select: { id: true, name: true } } } }),
    prisma.district.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getDistrictById(id: string) {
  return prisma.district.findUnique({ where: { id }, include: { division: true } });
}

export async function updateDistrict(id: string, dto: UpdateDistrictDto) {
  return prisma.district.update({ where: { id }, data: dto });
}

export async function countCityCorporationsByDistrict(districtId: string) {
  return prisma.cityCorporation.count({ where: { districtId } });
}

export async function findCityCorporationByNameAndDistrict(name: string, districtId: string) {
  return prisma.cityCorporation.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, districtId } });
}

export async function deleteDistrict(id: string) {
  return prisma.district.delete({ where: { id } });
}

// ─── City Corporations ───────────────────────────────────────────

export async function createCityCorporation(dto: CreateCityCorporationDto) {
  return prisma.cityCorporation.create({ data: dto, include: { district: true } });
}

export async function listCityCorporations(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 100);
  const where: Prisma.CityCorporationWhereInput = {};
  if (query.districtId) where.districtId = query.districtId;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.cityCorporation.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: { district: { select: { id: true, name: true } } } }),
    prisma.cityCorporation.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getCityCorporationById(id: string) {
  return prisma.cityCorporation.findUnique({ where: { id }, include: { district: true } });
}

export async function updateCityCorporation(id: string, dto: UpdateCityCorporationDto) {
  return prisma.cityCorporation.update({ where: { id }, data: dto });
}

export async function countZonesByCityCorporation(cityCorporationId: string) {
  return prisma.zone.count({ where: { cityCorporationId } });
}

export async function deleteCityCorporation(id: string) {
  return prisma.cityCorporation.delete({ where: { id } });
}

// ─── Zones ───────────────────────────────────────────────────────

export async function createZone(dto: CreateZoneDto) {
  return prisma.zone.create({ data: dto, include: { cityCorporation: true } });
}

export async function listZones(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 100);
  const where: Prisma.ZoneWhereInput = {};
  if (query.cityCorporationId) where.cityCorporationId = query.cityCorporationId;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.zone.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, include: { cityCorporation: { select: { id: true, name: true } } } }),
    prisma.zone.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getZoneById(id: string) {
  return prisma.zone.findUnique({ where: { id }, include: { cityCorporation: true } });
}

export async function updateZone(id: string, dto: UpdateZoneDto) {
  return prisma.zone.update({ where: { id }, data: dto });
}

export async function countVenuesByZone(zoneId: string) {
  return prisma.venue.count({ where: { zoneId } });
}

export async function findZoneByNameAndCityCorporation(name: string, cityCorporationId: string) {
  return prisma.zone.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, cityCorporationId } });
}

export async function findVenueByNameAndZone(name: string, zoneId: string) {
  return prisma.venue.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, zoneId } });
}

export async function deleteZone(id: string) {
  return prisma.zone.delete({ where: { id } });
}

// ─── Venues ──────────────────────────────────────────────────────
//
// Venues key off the seeded location tree (location_nodes). Given the
// leaf-most node an admin picks (Upazila/Union/CityCorporation/CityZone/
// Ward), we walk its ancestor chain once and denormalize division/
// district/upazila/union/cityCorporation/cityZone/ward ids onto the venue
// row for fast, indexed filtering at every level.

interface LocationAncestor {
  id: string;
  type: LocationType;
}

export async function resolveLocationAncestors(locationId: string): Promise<LocationAncestor[]> {
  return prisma.$queryRaw<LocationAncestor[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, type FROM location_nodes WHERE id = ${locationId}::uuid
      UNION ALL
      SELECT l.id, l.parent_id, l.type
      FROM location_nodes l
      INNER JOIN ancestors a ON l.id = a.parent_id
    )
    SELECT id, type FROM ancestors
  `;
}

function buildVenueLocationFields(ancestors: LocationAncestor[], leafId: string) {
  return { locationId: leafId, ...buildLocationTierIds(ancestors) };
}

// Same ancestor-chain -> tier-id mapping used to denormalize venues, exposed
// so callers (e.g. campaign session filtering) can compute the equivalent
// division/district/upazila/union/cityCorporation/cityZone/ward ids for an
// arbitrary *selected* location (not just at venue-create time).
export function buildLocationTierIds(ancestors: LocationAncestor[]) {
  const byType = new Map(ancestors.map((a) => [a.type, a.id]));
  return {
    divisionId: byType.get(LocationType.DIVISION) ?? null,
    districtId: byType.get(LocationType.DISTRICT) ?? null,
    upazilaId: byType.get(LocationType.UPAZILA) ?? byType.get(LocationType.THANA) ?? null,
    unionId: byType.get(LocationType.UNION) ?? byType.get(LocationType.POURASHAVA) ?? null,
    cityCorporationId: byType.get(LocationType.CITY_CORPORATION) ?? null,
    cityZoneId: byType.get(LocationType.CITY_ZONE) ?? null,
    wardId: byType.get(LocationType.WARD) ?? null,
  };
}

// Ordered root -> leaf ancestor chain with display names, e.g. for showing
// "Dhaka Division > Dhaka District > Savar Upazila > Union X" on a venue.
export async function resolveLocationNamePath(
  locationId: string,
): Promise<Array<{ id: string; type: LocationType; nameEn: string; nameBn: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; type: LocationType; nameEn: string; nameBn: string | null; depth: number }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, type, name_en, name_bn, 0 AS depth FROM location_nodes WHERE id = ${locationId}::uuid
      UNION ALL
      SELECT l.id, l.parent_id, l.type, l.name_en, l.name_bn, a.depth + 1
      FROM location_nodes l
      INNER JOIN ancestors a ON l.id = a.parent_id
    )
    SELECT id, type, name_en AS "nameEn", name_bn AS "nameBn" FROM ancestors ORDER BY depth DESC
  `;
  return rows;
}

// Self-to-root ordered ancestor chain (index 0 = the node itself, last = root).
// Used for campaign-coverage fallback ranking and venue proximity ranking —
// "how many hops up from the selected location is the nearest match".
export async function getAncestorChain(
  locationId: string,
): Promise<Array<{ id: string; type: LocationType; nameEn: string; nameBn: string | null }>> {
  return prisma.$queryRaw<Array<{ id: string; type: LocationType; nameEn: string; nameBn: string | null }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, type, name_en, name_bn, 0 AS depth FROM location_nodes WHERE id = ${locationId}::uuid
      UNION ALL
      SELECT l.id, l.parent_id, l.type, l.name_en, l.name_bn, a.depth + 1
      FROM location_nodes l
      INNER JOIN ancestors a ON l.id = a.parent_id
    )
    SELECT id, type, name_en AS "nameEn", name_bn AS "nameBn" FROM ancestors ORDER BY depth ASC
  `;
}

// All descendant node ids under locationId (any depth) — used to rank
// "nearby/child" venues below the selected location (e.g. Unions under a
// selected Upazila).
export async function getDescendantIds(locationId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM location_nodes WHERE parent_id = ${locationId}::uuid
      UNION ALL
      SELECT l.id
      FROM location_nodes l
      INNER JOIN descendants d ON l.parent_id = d.id
    )
    SELECT id FROM descendants
  `;
  return rows.map((r) => r.id);
}

export async function getLocationById(id: string) {
  return prisma.location.findUnique({ where: { id } });
}

export async function findVenueByNameAndLocation(name: string, locationId: string) {
  return prisma.venue.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, locationId } });
}

const VENUE_LOCATION_INCLUDE = {
  location: { select: { id: true, type: true, nameEn: true, nameBn: true, parentId: true } },
} satisfies Prisma.VenueInclude;

export async function createVenue(dto: CreateVenueDto) {
  const ancestors = await resolveLocationAncestors(dto.locationId);
  const locationFields = buildVenueLocationFields(ancestors, dto.locationId);
  return prisma.venue.create({
    data: {
      name: dto.name,
      address: dto.address,
      googleMapsUrl: dto.googleMapsUrl,
      latitude: dto.latitude,
      longitude: dto.longitude,
      contactPerson: dto.contactPerson,
      contactPhone: dto.contactPhone,
      capacity: dto.capacity,
      isActive: dto.isActive ?? true,
      ...locationFields,
    },
    include: VENUE_LOCATION_INCLUDE,
  });
}

function applyVenueLocationFilters(where: Prisma.VenueWhereInput, query: LocationListQuery) {
  if (query.locationId) where.locationId = query.locationId;
  if (query.divisionId) where.divisionId = query.divisionId;
  if (query.districtId) where.districtId = query.districtId;
  if (query.upazilaId) where.upazilaId = query.upazilaId;
  if (query.unionId) where.unionId = query.unionId;
  if (query.cityCorporationId) where.cityCorporationId = query.cityCorporationId;
  if (query.cityZoneId) where.cityZoneId = query.cityZoneId;
  if (query.wardId) where.wardId = query.wardId;
}

export async function listVenues(query: LocationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 50);
  const where: Prisma.VenueWhereInput = {};
  applyVenueLocationFilters(where, query);
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.venue.findMany({
      where, skip, take: limit, orderBy: { name: 'asc' },
      include: VENUE_LOCATION_INCLUDE,
    }),
    prisma.venue.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getVenueById(id: string) {
  return prisma.venue.findUnique({
    where: { id },
    include: VENUE_LOCATION_INCLUDE,
  });
}

export async function updateVenue(id: string, dto: UpdateVenueDto) {
  let locationFields: Partial<ReturnType<typeof buildVenueLocationFields>> = {};
  if (dto.locationId) {
    const ancestors = await resolveLocationAncestors(dto.locationId);
    locationFields = buildVenueLocationFields(ancestors, dto.locationId);
  }
  const { locationId: _locationId, ...rest } = dto;
  return prisma.venue.update({
    where: { id },
    data: { ...rest, ...locationFields },
    include: VENUE_LOCATION_INCLUDE,
  });
}

export async function countSessionsByVenue(venueId: string) {
  return prisma.campaignSession.count({ where: { venueId } });
}

export async function deleteVenue(id: string) {
  return prisma.venue.delete({ where: { id } });
}

// ─── Public hierarchy ─────────────────────────────────────────────

export async function getPublicHierarchy() {
  return prisma.country.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      divisions: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          districts: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
            include: {
              cityCorporations: {
                where: { isActive: true },
                orderBy: { name: 'asc' },
                include: {
                  zones: {
                    where: { isActive: true },
                    orderBy: { name: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function listPublicVenues(query: LocationListQuery) {
  const where: Prisma.VenueWhereInput = { isActive: true };
  applyVenueLocationFilters(where, query);
  return prisma.venue.findMany({
    where,
    orderBy: { name: 'asc' },
    include: VENUE_LOCATION_INCLUDE,
  });
}
