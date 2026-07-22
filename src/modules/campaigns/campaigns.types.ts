import { z } from 'zod';
import { CampaignType, CampaignStatus, DoctorDutyRole } from '@prisma/client';

// ─── Campaign ────────────────────────────────────────────────────

export const createCampaignSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  campaignType: z.nativeEnum(CampaignType),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  registrationOpenAt: z.string().datetime().optional(),
  registrationCloseAt: z.string().datetime().optional(),
  basePriceBdt: z.number().min(0).default(0),
  maxPetsPerBooking: z.number().int().min(1).max(50).default(10),
  certificateTemplateId: z.string().uuid().optional(),
  coverImageId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  isFeatured: z.boolean().optional(),
  allowedPetTypes: z.array(z.string().min(1).max(30)).optional(),
  termsAndConditions: z.string().max(10000).optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export const updateCampaignSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).optional().nullable(),
  campaignType: z.nativeEnum(CampaignType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  registrationOpenAt: z.string().datetime().optional().nullable(),
  registrationCloseAt: z.string().datetime().optional().nullable(),
  basePriceBdt: z.number().min(0).optional(),
  maxPetsPerBooking: z.number().int().min(1).max(50).optional(),
  certificateTemplateId: z.string().uuid().optional().nullable(),
  coverImageId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  isFeatured: z.boolean().optional(),
  allowedPetTypes: z.array(z.string().min(1).max(30)).optional(),
  termsAndConditions: z.string().max(10000).optional().nullable(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional().nullable(),
});

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  campaignType: z.nativeEnum(CampaignType).optional(),
});

export const publicCampaignVenuesQuerySchema = z.object({
  divisionId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  upazilaId: z.string().uuid().optional(),
  unionId: z.string().uuid().optional(),
  cityCorporationId: z.string().uuid().optional(),
  cityZoneId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
});

export type PublicCampaignVenuesQuery = z.infer<typeof publicCampaignVenuesQuerySchema>;

export const publicCampaignDiscoverQuerySchema = z.object({
  locationId: z.string().uuid(),
});

export type PublicCampaignDiscoverQuery = z.infer<typeof publicCampaignDiscoverQuerySchema>;

export const createCoverageSchema = z.object({
  locationId: z.string().uuid().optional(),
  isNationwide: z.boolean().optional(),
}).refine((d) => (d.isNationwide === true) !== Boolean(d.locationId), {
  message: 'Provide exactly one of locationId or isNationwide',
});

export type CreateCoverageDto = z.infer<typeof createCoverageSchema>;

// ─── Campaign Session ─────────────────────────────────────────────

export const createSessionSchema = z.object({
  venueId: z.string().uuid(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});

export const updateSessionSchema = z.object({
  venueId: z.string().uuid().optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  capacity: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

// ─── Campaign Service ─────────────────────────────────────────────

export const createServiceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  vaccineCatalogId: z.string().uuid().optional(),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  priceBdt: z.number().int().min(0).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  vaccineCatalogId: z.string().uuid().optional().nullable(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  priceBdt: z.number().int().min(0).optional().nullable(),
});

export const campaignServicesQuerySchema = z.object({
  includeInactive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
});

// ─── Doctor / Volunteer Assignment ────────────────────────────────

export const assignDoctorSchema = z.object({
  doctorId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  role: z.string().max(50).default('vaccinator'),
  doctorDuty: z.nativeEnum(DoctorDutyRole).default(DoctorDutyRole.VACCINATOR),
  isSigningDoctor: z.boolean().default(false),
  isPrimarySupervisor: z.boolean().default(false),
  assignedDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const updateDoctorAssignmentSchema = z.object({
  role: z.string().max(50).optional(),
  doctorDuty: z.nativeEnum(DoctorDutyRole).optional(),
  isSigningDoctor: z.boolean().optional(),
  isPrimarySupervisor: z.boolean().optional(),
  assignedDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const bulkAssignDoctorSchema = z.object({
  assignments: z.array(z.object({
    doctorId: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    doctorDuty: z.nativeEnum(DoctorDutyRole).default(DoctorDutyRole.VACCINATOR),
    isSigningDoctor: z.boolean().default(false),
    isPrimarySupervisor: z.boolean().default(false),
    notes: z.string().max(500).optional().nullable(),
  })).min(1).max(50),
});

export const assignVolunteerSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CreateSessionDto = z.infer<typeof createSessionSchema>;
export type UpdateSessionDto = z.infer<typeof updateSessionSchema>;
export type CreateServiceDto = z.infer<typeof createServiceSchema>;
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;
export type CampaignServicesQuery = z.infer<typeof campaignServicesQuerySchema>;
export type AssignDoctorDto = z.infer<typeof assignDoctorSchema>;
export type UpdateDoctorAssignmentDto = z.infer<typeof updateDoctorAssignmentSchema>;
export type BulkAssignDoctorDto = z.infer<typeof bulkAssignDoctorSchema>;
export type AssignVolunteerDto = z.infer<typeof assignVolunteerSchema>;

export const availableDoctorsQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  includeAssigned: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
});
export type AvailableDoctorsQuery = z.infer<typeof availableDoctorsQuerySchema>;
