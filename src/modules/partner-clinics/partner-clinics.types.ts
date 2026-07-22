import { z } from 'zod';

const nullableUrl = z.string().trim().url().max(2000).optional().nullable();

export const createPartnerClinicSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  logoUrl: nullableUrl,
  shortDescription: z.string().trim().max(2000).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  showPhonePublicly: z.boolean().default(false),
  address: z.string().trim().max(2000).optional().nullable(),
  divisionId: z.string().uuid().optional().nullable(),
  districtId: z.string().uuid().optional().nullable(),
  area: z.string().trim().max(160).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional().nullable(),
  reviewCount: z.coerce.number().int().min(0).optional().nullable(),
  isVerified: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

export const updatePartnerClinicSchema = createPartnerClinicSchema.partial();

export const partnerClinicListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().trim().max(255).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isActive: z.enum(['true', 'false', 'all']).optional(),
  divisionId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
});

export const reorderPartnerClinicsSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).min(1),
});

export type CreatePartnerClinicDto = z.infer<typeof createPartnerClinicSchema>;
export type UpdatePartnerClinicDto = z.infer<typeof updatePartnerClinicSchema>;
export type PartnerClinicListQuery = z.infer<typeof partnerClinicListQuerySchema>;
