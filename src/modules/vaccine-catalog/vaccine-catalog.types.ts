import { z } from 'zod';

export const createVaccineCatalogSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  species: z.enum(['dog', 'cat', 'all']).default('all'),
  standardIntervalDays: z.number().int().positive().optional(),
  manufacturer: z.string().max(120).optional(),
});

export const updateVaccineCatalogSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  species: z.enum(['dog', 'cat', 'all']).optional(),
  standardIntervalDays: z.number().int().positive().optional().nullable(),
  manufacturer: z.string().max(120).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const vaccineCatalogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  species: z.enum(['dog', 'cat', 'all']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const createCertificateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  htmlTemplate: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export const updateCertificateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  htmlTemplate: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateVaccineCatalogDto = z.infer<typeof createVaccineCatalogSchema>;
export type UpdateVaccineCatalogDto = z.infer<typeof updateVaccineCatalogSchema>;
export type VaccineCatalogListQuery = z.infer<typeof vaccineCatalogListQuerySchema>;
export type CreateCertificateTemplateDto = z.infer<typeof createCertificateTemplateSchema>;
export type UpdateCertificateTemplateDto = z.infer<typeof updateCertificateTemplateSchema>;
