import { z } from 'zod';
import { DiagnosticServiceCategory } from '@prisma/client';

export const createDiagnosticCenterServiceSchema = z.object({
  titleEn: z.string().min(2).max(200),
  titleBn: z.string().min(2).max(200),
  descriptionEn: z.string().max(2000).optional(),
  descriptionBn: z.string().max(2000).optional(),
  category: z.nativeEnum(DiagnosticServiceCategory),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateDiagnosticCenterServiceSchema = z.object({
  titleEn: z.string().min(2).max(200).optional(),
  titleBn: z.string().min(2).max(200).optional(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionBn: z.string().max(2000).optional().nullable(),
  category: z.nativeEnum(DiagnosticServiceCategory).optional(),
  icon: z.string().max(100).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const diagnosticCenterServiceListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  category: z.nativeEnum(DiagnosticServiceCategory).optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateDiagnosticCenterServiceDto = z.infer<typeof createDiagnosticCenterServiceSchema>;
export type UpdateDiagnosticCenterServiceDto = z.infer<typeof updateDiagnosticCenterServiceSchema>;
export type DiagnosticCenterServiceListQuery = z.infer<typeof diagnosticCenterServiceListQuerySchema>;
