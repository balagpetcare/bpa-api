import { z } from 'zod';

// ─── Country ─────────────────────────────────────────────────────

export const createCountrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(2).max(10).toUpperCase(),
});

export const updateCountrySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(2).max(10).toUpperCase().optional(),
  isActive: z.boolean().optional(),
});

// ─── Division ────────────────────────────────────────────────────

export const createDivisionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countryId: z.string().uuid(),
});

export const updateDivisionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// ─── District ────────────────────────────────────────────────────

export const createDistrictSchema = z.object({
  name: z.string().trim().min(1).max(120),
  divisionId: z.string().uuid(),
});

export const updateDistrictSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// ─── City Corporation ─────────────────────────────────────────────

export const createCityCorporationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  districtId: z.string().uuid(),
});

export const updateCityCorporationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// ─── Zone ────────────────────────────────────────────────────────

export const createZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cityCorporationId: z.string().uuid(),
});

export const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// ─── Venue ───────────────────────────────────────────────────────
//
// Venues are created under an existing node of the seeded Bangladesh
// location tree (location_nodes) — locationId is the leaf-most node the
// admin picked (Upazila/Union/CityCorporation/CityZone/Ward). The server
// resolves and denormalizes the full ancestor chain for fast filtering.

export const createVenueSchema = z.object({
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().min(1),
  locationId: z.string().uuid(),
  googleMapsUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  contactPerson: z.string().trim().min(1).max(160).optional(),
  contactPhone: z.string().trim().min(1).max(20).optional(),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const updateVenueSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  address: z.string().trim().min(1).optional(),
  locationId: z.string().uuid().optional(),
  googleMapsUrl: z.string().url().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  contactPerson: z.string().trim().min(1).max(160).optional().nullable(),
  contactPhone: z.string().trim().min(1).max(20).optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const locationListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  countryId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  cityCorporationId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  // Venue-only location-tree filters (Location.id values, not legacy tables)
  locationId: z.string().uuid().optional(),
  upazilaId: z.string().uuid().optional(),
  unionId: z.string().uuid().optional(),
  cityZoneId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
});

export type CreateCountryDto = z.infer<typeof createCountrySchema>;
export type UpdateCountryDto = z.infer<typeof updateCountrySchema>;
export type CreateDivisionDto = z.infer<typeof createDivisionSchema>;
export type UpdateDivisionDto = z.infer<typeof updateDivisionSchema>;
export type CreateDistrictDto = z.infer<typeof createDistrictSchema>;
export type UpdateDistrictDto = z.infer<typeof updateDistrictSchema>;
export type CreateCityCorporationDto = z.infer<typeof createCityCorporationSchema>;
export type UpdateCityCorporationDto = z.infer<typeof updateCityCorporationSchema>;
export type CreateZoneDto = z.infer<typeof createZoneSchema>;
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;
export type CreateVenueDto = z.infer<typeof createVenueSchema>;
export type UpdateVenueDto = z.infer<typeof updateVenueSchema>;
export type LocationListQuery = z.infer<typeof locationListQuerySchema>;
