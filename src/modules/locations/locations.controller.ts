import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './locations.service';
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

export async function createCountryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCountryDto;
    const country = await svc.createCountry(dto);
    await auditCreate('country', country.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, country);
  } catch (err) { next(err); }
}

export async function listCountriesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listCountries(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getCountryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getCountry(req.params.id));
  } catch (err) { next(err); }
}

export async function updateCountryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const old = await svc.getCountry(req.params.id);
    const dto = req.body as UpdateCountryDto;
    const updated = await svc.updateCountry(req.params.id, dto);
    await auditUpdate('country', req.params.id, { name: old.name }, { name: dto.name }, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteCountryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const country = await svc.getCountry(req.params.id);
    await svc.deleteCountry(req.params.id);
    await auditDelete('country', req.params.id, { name: country.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Divisions ───────────────────────────────────────────────────

export async function createDivisionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateDivisionDto;
    const division = await svc.createDivision(dto);
    await auditCreate('division', division.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, division);
  } catch (err) { next(err); }
}

export async function listDivisionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listDivisions(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDivisionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getDivision(req.params.id));
  } catch (err) { next(err); }
}

export async function updateDivisionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateDivisionDto;
    const updated = await svc.updateDivision(req.params.id, dto);
    await auditUpdate('division', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteDivisionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const division = await svc.getDivision(req.params.id);
    await svc.deleteDivision(req.params.id);
    await auditDelete('division', req.params.id, { name: division.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Districts ───────────────────────────────────────────────────

export async function createDistrictHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateDistrictDto;
    const district = await svc.createDistrict(dto);
    await auditCreate('district', district.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, district);
  } catch (err) { next(err); }
}

export async function listDistrictsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listDistricts(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDistrictHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getDistrict(req.params.id));
  } catch (err) { next(err); }
}

export async function updateDistrictHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateDistrictDto;
    const updated = await svc.updateDistrict(req.params.id, dto);
    await auditUpdate('district', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteDistrictHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const district = await svc.getDistrict(req.params.id);
    await svc.deleteDistrict(req.params.id);
    await auditDelete('district', req.params.id, { name: district.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── City Corporations ───────────────────────────────────────────

export async function createCityCorporationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCityCorporationDto;
    const cc = await svc.createCityCorporation(dto);
    await auditCreate('city_corporation', cc.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, cc);
  } catch (err) { next(err); }
}

export async function listCityCorporationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listCityCorporations(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getCityCorporationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getCityCorporation(req.params.id));
  } catch (err) { next(err); }
}

export async function updateCityCorporationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateCityCorporationDto;
    const updated = await svc.updateCityCorporation(req.params.id, dto);
    await auditUpdate('city_corporation', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteCityCorporationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cc = await svc.getCityCorporation(req.params.id);
    await svc.deleteCityCorporation(req.params.id);
    await auditDelete('city_corporation', req.params.id, { name: cc.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Zones ───────────────────────────────────────────────────────

export async function createZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateZoneDto;
    const zone = await svc.createZone(dto);
    await auditCreate('zone', zone.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, zone);
  } catch (err) { next(err); }
}

export async function listZonesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listZones(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getZone(req.params.id));
  } catch (err) { next(err); }
}

export async function updateZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateZoneDto;
    const updated = await svc.updateZone(req.params.id, dto);
    await auditUpdate('zone', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const zone = await svc.getZone(req.params.id);
    await svc.deleteZone(req.params.id);
    await auditDelete('zone', req.params.id, { name: zone.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Venues ──────────────────────────────────────────────────────

export async function createVenueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateVenueDto;
    const venue = await svc.createVenue(dto);
    await auditCreate('venue', venue.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, venue);
  } catch (err) { next(err); }
}

export async function listVenuesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listVenues(req.query as never as LocationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getVenueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getVenue(req.params.id));
  } catch (err) { next(err); }
}

export async function updateVenueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateVenueDto;
    const updated = await svc.updateVenue(req.params.id, dto);
    await auditUpdate('venue', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteVenueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const venue = await svc.getVenue(req.params.id);
    await svc.deleteVenue(req.params.id);
    await auditDelete('venue', req.params.id, { name: venue.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function getPublicHierarchyHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPublicHierarchy());
  } catch (err) { next(err); }
}

export async function listPublicVenuesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listPublicVenues(req.query as never as LocationListQuery));
  } catch (err) { next(err); }
}
