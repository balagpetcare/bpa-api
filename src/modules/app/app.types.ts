import { z } from 'zod';
import { APP_CONTROL_PAGE_KEYS } from '../app-control/app-control.types';

export const appPageParamsSchema = z.object({
  key: z.enum(APP_CONTROL_PAGE_KEYS),
});

export type AppPageParams = z.infer<typeof appPageParamsSchema>;

export const careVideosQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  category: z.string().trim().max(100).optional(),
});

export const tutorialsGuidesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  category: z.string().trim().max(100).optional(),
});

export const partnerClinicsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  divisionId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
});
