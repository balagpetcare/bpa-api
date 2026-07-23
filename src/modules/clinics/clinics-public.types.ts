import { z } from 'zod';

const boolFlag = z.enum(['true']).optional();

export const publicClinicListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    search: z.string().trim().max(255).optional(),
    cityCorporation: z.string().trim().max(120).optional(),
    area: z.string().trim().max(160).optional(),
    district: z.string().trim().max(120).optional(),
    // Scopes results to one organization's other branches (e.g. the "Other
    // Branches" section on a clinic detail page) — an exact match against a
    // real, indexed slug, not a free-text/partial filter like the others.
    organizationSlug: z.string().trim().max(320).optional(),
    service: z.string().trim().max(160).optional(),
    animalType: z.enum(['DOG', 'CAT', 'BIRD', 'RABBIT', 'REPTILE', 'SMALL_MAMMAL', 'EXOTIC', 'OTHER']).optional(),
    facilityType: z.enum(['LABORATORY', 'SURGERY', 'IMAGING', 'PHARMACY', 'HOSPITALIZATION', 'HOME_SERVICE']).optional(),
    openNow: boolFlag,
    open24Hours: boolFlag,
    emergencyAvailability: boolFlag,
    appointmentRequired: boolFlag,
    verifiedOnly: boolFlag,
    featured: boolFlag,
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(200).optional(),
    sortBy: z.enum(['distance', 'name', 'featured', 'recentlyVerified']).optional(),
  })
  .refine((q) => (q.radiusKm === undefined ? true : q.latitude !== undefined && q.longitude !== undefined), {
    message: 'radiusKm requires both latitude and longitude',
    path: ['radiusKm'],
  })
  .refine((q) => (q.sortBy !== 'distance' ? true : q.latitude !== undefined && q.longitude !== undefined), {
    message: '"sortBy=distance" requires both latitude and longitude',
    path: ['sortBy'],
  })
  .refine((q) => (q.latitude === undefined) === (q.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
    path: ['longitude'],
  });

export type PublicClinicListQuery = z.infer<typeof publicClinicListQuerySchema>;

export const publicClinicSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid clinic slug'),
});
