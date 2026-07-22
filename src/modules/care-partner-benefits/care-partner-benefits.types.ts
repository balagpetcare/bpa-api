import { z } from 'zod';
import { CarePartnerBenefitCategory } from '@prisma/client';

export const createCarePartnerBenefitSchema = z.object({
  titleEn: z.string().min(2).max(200),
  titleBn: z.string().min(2).max(200),
  descriptionEn: z.string().max(2000).optional(),
  descriptionBn: z.string().max(2000).optional(),
  icon: z.string().max(100).optional(),
  category: z.nativeEnum(CarePartnerBenefitCategory),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateCarePartnerBenefitSchema = z.object({
  titleEn: z.string().min(2).max(200).optional(),
  titleBn: z.string().min(2).max(200).optional(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionBn: z.string().max(2000).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  category: z.nativeEnum(CarePartnerBenefitCategory).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const carePartnerBenefitListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  category: z.nativeEnum(CarePartnerBenefitCategory).optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateCarePartnerBenefitDto = z.infer<typeof createCarePartnerBenefitSchema>;
export type UpdateCarePartnerBenefitDto = z.infer<typeof updateCarePartnerBenefitSchema>;
export type CarePartnerBenefitListQuery = z.infer<typeof carePartnerBenefitListQuerySchema>;
