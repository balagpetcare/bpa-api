import { z } from 'zod';

const nullableText = z.string().trim().max(2000).optional().nullable();

export const createBpaProgramSchema = z.object({
  key: z.string().trim().min(1).max(60),
  titleEn: z.string().trim().min(1).max(160),
  titleBn: z.string().trim().max(160).optional().nullable(),
  descriptionEn: nullableText,
  descriptionBn: nullableText,
  iconKey: z.string().trim().max(60).optional().nullable(),
  iconMediaId: z.string().uuid().optional().nullable(),
  ctaLabel: z.string().trim().max(80).optional().nullable(),
  ctaHref: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateBpaProgramSchema = createBpaProgramSchema.partial();

export const bpaProgramListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateBpaProgramDto = z.infer<typeof createBpaProgramSchema>;
export type UpdateBpaProgramDto = z.infer<typeof updateBpaProgramSchema>;
export type BpaProgramListQuery = z.infer<typeof bpaProgramListQuerySchema>;
