import { AppError } from '../../utils/AppError';
import * as repo from './locations.repository';
import * as locationTree from './location-tree.service';
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
  return repo.createCountry(dto);
}

export async function listCountries(query: LocationListQuery) {
  return repo.listCountries(query);
}

export async function getCountry(id: string) {
  const c = await repo.getCountryById(id);
  if (!c) throw AppError.notFound('Country not found');
  return c;
}

export async function updateCountry(id: string, dto: UpdateCountryDto) {
  await getCountry(id);
  return repo.updateCountry(id, dto);
}

export async function deleteCountry(id: string) {
  await getCountry(id);
  const childCount = await repo.countDivisionsByCountry(id);
  if (childCount > 0) throw AppError.conflict(`Cannot delete country: ${childCount} division(s) exist under it`);
  return repo.deleteCountry(id);
}

// ─── Divisions ───────────────────────────────────────────────────

export async function createDivision(dto: CreateDivisionDto) {
  await getCountry(dto.countryId);
  const existing = await repo.findDivisionByNameAndCountry(dto.name, dto.countryId);
  if (existing) throw AppError.conflict(`A division named "${dto.name}" already exists in this country`);
  return repo.createDivision(dto);
}

export async function listDivisions(query: LocationListQuery) {
  return repo.listDivisions(query);
}

export async function getDivision(id: string) {
  const d = await repo.getDivisionById(id);
  if (!d) throw AppError.notFound('Division not found');
  return d;
}

export async function updateDivision(id: string, dto: UpdateDivisionDto) {
  await getDivision(id);
  return repo.updateDivision(id, dto);
}

export async function deleteDivision(id: string) {
  await getDivision(id);
  const childCount = await repo.countDistrictsByDivision(id);
  if (childCount > 0) throw AppError.conflict(`Cannot delete division: ${childCount} district(s) exist under it`);
  return repo.deleteDivision(id);
}

// ─── Districts ───────────────────────────────────────────────────

export async function createDistrict(dto: CreateDistrictDto) {
  const div = await repo.getDivisionById(dto.divisionId);
  if (!div) throw AppError.notFound('Division not found');
  const existing = await repo.findDistrictByNameAndDivision(dto.name, dto.divisionId);
  if (existing) throw AppError.conflict(`A district named "${dto.name}" already exists in this division`);
  return repo.createDistrict(dto);
}

export async function listDistricts(query: LocationListQuery) {
  return repo.listDistricts(query);
}

export async function getDistrict(id: string) {
  const d = await repo.getDistrictById(id);
  if (!d) throw AppError.notFound('District not found');
  return d;
}

export async function updateDistrict(id: string, dto: UpdateDistrictDto) {
  await getDistrict(id);
  return repo.updateDistrict(id, dto);
}

export async function deleteDistrict(id: string) {
  await getDistrict(id);
  const childCount = await repo.countCityCorporationsByDistrict(id);
  if (childCount > 0) throw AppError.conflict(`Cannot delete district: ${childCount} city corporation(s) exist under it`);
  return repo.deleteDistrict(id);
}

// ─── City Corporations ───────────────────────────────────────────

export async function createCityCorporation(dto: CreateCityCorporationDto) {
  const dis = await repo.getDistrictById(dto.districtId);
  if (!dis) throw AppError.notFound('District not found');
  const existing = await repo.findCityCorporationByNameAndDistrict(dto.name, dto.districtId);
  if (existing) throw AppError.conflict(`A city corporation named "${dto.name}" already exists in this district`);
  return repo.createCityCorporation(dto);
}

export async function listCityCorporations(query: LocationListQuery) {
  return repo.listCityCorporations(query);
}

export async function getCityCorporation(id: string) {
  const c = await repo.getCityCorporationById(id);
  if (!c) throw AppError.notFound('City Corporation not found');
  return c;
}

export async function updateCityCorporation(id: string, dto: UpdateCityCorporationDto) {
  await getCityCorporation(id);
  return repo.updateCityCorporation(id, dto);
}

export async function deleteCityCorporation(id: string) {
  await getCityCorporation(id);
  const childCount = await repo.countZonesByCityCorporation(id);
  if (childCount > 0) throw AppError.conflict(`Cannot delete city corporation: ${childCount} zone(s) exist under it`);
  return repo.deleteCityCorporation(id);
}

// ─── Zones ───────────────────────────────────────────────────────

export async function createZone(dto: CreateZoneDto) {
  const cc = await repo.getCityCorporationById(dto.cityCorporationId);
  if (!cc) throw AppError.notFound('City Corporation not found');
  const existing = await repo.findZoneByNameAndCityCorporation(dto.name, dto.cityCorporationId);
  if (existing) throw AppError.conflict(`A zone named "${dto.name}" already exists in this city corporation`);
  return repo.createZone(dto);
}

export async function listZones(query: LocationListQuery) {
  return repo.listZones(query);
}

export async function getZone(id: string) {
  const z = await repo.getZoneById(id);
  if (!z) throw AppError.notFound('Zone not found');
  return z;
}

export async function updateZone(id: string, dto: UpdateZoneDto) {
  await getZone(id);
  return repo.updateZone(id, dto);
}

export async function deleteZone(id: string) {
  await getZone(id);
  const childCount = await repo.countVenuesByZone(id);
  if (childCount > 0) throw AppError.conflict(`Cannot delete zone: ${childCount} venue(s) exist under it`);
  return repo.deleteZone(id);
}

// ─── Venues ──────────────────────────────────────────────────────
//
// Venues are only ever created under an existing seeded location node —
// admins never manually create divisions/districts/upazilas/unions here.
// Any level (including Division/District) may host a venue directly.

async function assertVenueLocation(locationId: string) {
  const node = await locationTree.getLocationById(locationId);
  if (!node) throw AppError.notFound('Selected location does not exist');
  if (!node.isActive) throw AppError.badRequest('Cannot create a venue under an inactive location');
  return node;
}

export async function createVenue(dto: CreateVenueDto) {
  await assertVenueLocation(dto.locationId);
  const existing = await repo.findVenueByNameAndLocation(dto.name, dto.locationId);
  if (existing) throw AppError.conflict(`A venue named "${dto.name}" already exists in this area`);
  return repo.createVenue(dto);
}

export async function listVenues(query: LocationListQuery) {
  return repo.listVenues(query);
}

export async function getVenue(id: string) {
  const v = await repo.getVenueById(id);
  if (!v) throw AppError.notFound('Venue not found');
  return v;
}

export async function updateVenue(id: string, dto: UpdateVenueDto) {
  await getVenue(id);
  if (dto.locationId) await assertVenueLocation(dto.locationId);
  return repo.updateVenue(id, dto);
}

export async function deleteVenue(id: string) {
  await getVenue(id);
  const sessionCount = await repo.countSessionsByVenue(id);
  if (sessionCount > 0) throw AppError.conflict(`Cannot delete venue: ${sessionCount} campaign session(s) are scheduled here`);
  return repo.deleteVenue(id);
}

// ─── Public ──────────────────────────────────────────────────────

export async function getPublicHierarchy() {
  return repo.getPublicHierarchy();
}

export async function listPublicVenues(query: LocationListQuery) {
  return repo.listPublicVenues(query);
}
