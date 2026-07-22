import { z } from 'zod';
import { RoadmapItemStatus } from '@prisma/client';

export const createRoadmapItemSchema = z.object({
  phase: z.string().min(1).max(80),
  year: z.number().int().min(2020).max(2100),
  titleEn: z.string().min(2).max(200),
  titleBn: z.string().min(2).max(200),
  descriptionEn: z.string().max(2000).optional(),
  descriptionBn: z.string().max(2000).optional(),
  status: z.nativeEnum(RoadmapItemStatus).default('PLANNED'),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateRoadmapItemSchema = z.object({
  phase: z.string().min(1).max(80).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  titleEn: z.string().min(2).max(200).optional(),
  titleBn: z.string().min(2).max(200).optional(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionBn: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(RoadmapItemStatus).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const roadmapItemListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(RoadmapItemStatus).optional(),
  year: z.coerce.number().int().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateRoadmapItemDto = z.infer<typeof createRoadmapItemSchema>;
export type UpdateRoadmapItemDto = z.infer<typeof updateRoadmapItemSchema>;
export type RoadmapItemListQuery = z.infer<typeof roadmapItemListQuerySchema>;
