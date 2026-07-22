import { z } from 'zod';
import { SocialImpactProgramType } from '@prisma/client';

export const createSocialImpactProgramSchema = z.object({
  titleEn: z.string().min(2).max(200),
  titleBn: z.string().min(2).max(200),
  descriptionEn: z.string().max(2000).optional(),
  descriptionBn: z.string().max(2000).optional(),
  impactType: z.nativeEnum(SocialImpactProgramType),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateSocialImpactProgramSchema = z.object({
  titleEn: z.string().min(2).max(200).optional(),
  titleBn: z.string().min(2).max(200).optional(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionBn: z.string().max(2000).optional().nullable(),
  impactType: z.nativeEnum(SocialImpactProgramType).optional(),
  icon: z.string().max(100).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const socialImpactProgramListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  impactType: z.nativeEnum(SocialImpactProgramType).optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateSocialImpactProgramDto = z.infer<typeof createSocialImpactProgramSchema>;
export type UpdateSocialImpactProgramDto = z.infer<typeof updateSocialImpactProgramSchema>;
export type SocialImpactProgramListQuery = z.infer<typeof socialImpactProgramListQuerySchema>;
