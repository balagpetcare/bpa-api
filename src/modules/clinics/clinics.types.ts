import { z } from 'zod';

const nullableUrl = z.string().trim().url().max(2000).optional().nullable();
const triState = z.enum(['UNKNOWN', 'YES', 'NO']).default('UNKNOWN');
const verificationStatus = z
  .enum(['UNKNOWN', 'UNVERIFIED', 'VERIFIED', 'REJECTED'])
  .default('UNKNOWN');

// ─── Organization ──────────────────────────────────────────────────────────

const socialLinkItem = z.object({
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'WEBSITE', 'OTHER']),
  url: z.string().trim().url().max(2000),
  label: z.string().trim().max(120).optional().nullable(),
});

export const createClinicOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(280)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, alphanumeric, hyphen-separated'),
  description: z.string().trim().max(4000).optional().nullable(),
  // Legacy plain-URL fields — still accepted so existing callers/imports
  // keep working, but the Central Media Library picker sends
  // logoMediaId/coverMediaId instead. Both may be present at once; the
  // media relation always wins when resolving what to actually display.
  logoUrl: nullableUrl,
  coverImageUrl: nullableUrl,
  logoMediaId: z.string().uuid().optional().nullable(),
  coverMediaId: z.string().uuid().optional().nullable(),
  website: nullableUrl,
  email: z.string().trim().email().max(255).optional().nullable(),
  verificationStatus,
  claimedStatus: z.enum(['UNCLAIMED', 'PENDING', 'CLAIMED']).default('UNCLAIMED'),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  socialLinks: z.array(socialLinkItem).max(20).optional(),
});

export const updateClinicOrganizationSchema = createClinicOrganizationSchema.partial();

export const publishClinicOrganizationSchema = z.object({
  published: z.boolean(),
});

export const archiveEntitySchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const permanentDeleteSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required for permanent deletion'),
  confirmationText: z.string().trim().min(1, 'Typed confirmation is required'),
});

export const bulkClinicOrganizationActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['publish', 'unpublish', 'archive', 'restore']),
});

export const bulkClinicBranchActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['publish', 'unpublish', 'archive', 'restore']),
});

export const clinicOrganizationListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().trim().max(255).optional(),
  published: z.enum(['true', 'false', 'all']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  verificationStatus: z.enum(['UNKNOWN', 'UNVERIFIED', 'VERIFIED', 'REJECTED']).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

// ─── Branch ────────────────────────────────────────────────────────────────

export const createClinicBranchSchema = z.object({
  organizationId: z.string().uuid(),
  branchName: z.string().trim().min(1, 'Branch name is required').max(255),
  address: z.string().trim().max(2000).optional().nullable(),
  area: z.string().trim().max(160).optional().nullable(),
  cityCorporation: z.string().trim().max(120).optional().nullable(),
  district: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  googleMapUrl: nullableUrl,
  email: z.string().trim().email().max(255).optional().nullable(),
  emergencyAvailability: triState,
  open24Hours: triState,
  appointmentRequired: triState,
  accessibilityNotes: z.string().trim().max(2000).optional().nullable(),
  verificationStatus,
  lastVerifiedAt: z.coerce.date().optional().nullable(),
  published: z.boolean().default(false),
  importNotes: z.string().trim().max(4000).optional().nullable(),
});

export const updateClinicBranchSchema = createClinicBranchSchema.partial().omit({
  organizationId: true,
});

export const publishClinicBranchSchema = z.object({
  published: z.boolean(),
});

export const clinicBranchListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().trim().max(255).optional(),
  organizationId: z.string().uuid().optional(),
  published: z.enum(['true', 'false', 'all']).optional(),
  verificationStatus: z.enum(['UNKNOWN', 'UNVERIFIED', 'VERIFIED', 'REJECTED']).optional(),
  area: z.string().trim().max(160).optional(),
  district: z.string().trim().max(120).optional(),
  missingCoordinates: z.enum(['true']).optional(),
  missingPhone: z.enum(['true']).optional(),
  missingHours: z.enum(['true']).optional(),
  unverifiedOnly: z.enum(['true']).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  cityCorporation: z.string().trim().max(120).optional(),
  emergencyAvailability: z.enum(['UNKNOWN', 'YES', 'NO']).optional(),
  open24Hours: z.enum(['UNKNOWN', 'YES', 'NO']).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'lastVerifiedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

// ─── Related collections (full-replace-on-save) ────────────────────────────

const phoneItem = z.object({
  phoneNumber: z.string().trim().min(3).max(20),
  label: z.string().trim().max(80).optional().nullable(),
  isPrimary: z.boolean().default(false),
  whatsappAvailable: triState,
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const openingHoursItem = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  opensAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'opensAt must be HH:MM')
    .optional()
    .nullable(),
  closesAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'closesAt must be HH:MM')
    .optional()
    .nullable(),
  isClosed: z.boolean().default(false),
  note: z.string().trim().max(500).optional().nullable(),
});

const closureItem = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});

const serviceItem = z.object({
  serviceName: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const animalTypeItem = z.object({
  animalType: z.enum(['DOG', 'CAT', 'BIRD', 'RABBIT', 'REPTILE', 'SMALL_MAMMAL', 'EXOTIC', 'OTHER']),
  note: z.string().trim().max(500).optional().nullable(),
});

const facilityItem = z.object({
  facilityType: z.enum([
    'LABORATORY',
    'SURGERY',
    'IMAGING',
    'PHARMACY',
    'HOSPITALIZATION',
    'HOME_SERVICE',
  ]),
  available: triState,
  notes: z.string().trim().max(500).optional().nullable(),
});

const imageItem = z.object({
  url: z.string().trim().url().max(2000),
  // Set when this image came from the Central Media Library picker (the
  // normal path going forward); left undefined for legacy rows that only
  // ever had a plain URL.
  mediaFileId: z.string().uuid().optional().nullable(),
  isCover: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  altText: z.string().trim().max(255).optional().nullable(),
});

const sourceItem = z.object({
  sourceUrl: z.string().trim().url().max(2000),
  label: z.string().trim().max(160).optional().nullable(),
});

export const updateClinicBranchRelatedSchema = z.object({
  phones: z.array(phoneItem).max(20).optional(),
  socialLinks: z.array(socialLinkItem).max(20).optional(),
  openingHours: z.array(openingHoursItem).max(7).optional(),
  closures: z.array(closureItem).max(50).optional(),
  services: z.array(serviceItem).max(50).optional(),
  animalTypes: z.array(animalTypeItem).max(8).optional(),
  facilities: z.array(facilityItem).max(6).optional(),
  images: z.array(imageItem).max(30).optional(),
  sources: z.array(sourceItem).max(30).optional(),
});

export type CreateClinicOrganizationDto = z.infer<typeof createClinicOrganizationSchema>;
export type UpdateClinicOrganizationDto = z.infer<typeof updateClinicOrganizationSchema>;
export type ClinicOrganizationListQuery = z.infer<typeof clinicOrganizationListQuerySchema>;
export type CreateClinicBranchDto = z.infer<typeof createClinicBranchSchema>;
export type UpdateClinicBranchDto = z.infer<typeof updateClinicBranchSchema>;
export type ClinicBranchListQuery = z.infer<typeof clinicBranchListQuerySchema>;
export type ArchiveEntityDto = z.infer<typeof archiveEntitySchema>;
export type PermanentDeleteDto = z.infer<typeof permanentDeleteSchema>;
export type BulkClinicOrganizationActionDto = z.infer<typeof bulkClinicOrganizationActionSchema>;
export type BulkClinicBranchActionDto = z.infer<typeof bulkClinicBranchActionSchema>;
export type UpdateClinicBranchRelatedDto = z.infer<typeof updateClinicBranchRelatedSchema>;

export const addClinicBranchImageSchema = imageItem;
export type AddClinicBranchImageDto = z.infer<typeof addClinicBranchImageSchema>;

export const reorderClinicBranchImagesSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(30),
});
export type ReorderClinicBranchImagesDto = z.infer<typeof reorderClinicBranchImagesSchema>;
