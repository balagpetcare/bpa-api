import { z } from 'zod';
import { ContributionStatus } from '@prisma/client';

const bdMobile = z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number');

export const initiateContributionSchema = z.object({
  planId: z.string().uuid(),
  zoneId: z.string().uuid(),
  contributorName: z.string().min(2).max(120),
  contributorMobile: bdMobile,
  contributorEmail: z.string().email().optional(),
  contributorAddress: z.string().max(500).optional(),
  // Location tree FK fields (optional; contributorAddress kept for fallback)
  divisionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  districtId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  upazilaId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  unionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityCorporationId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityZoneId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  wardId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  isAnonymous: z.boolean().default(false),
});

export const updateContributionSchema = z.object({
  status: z.nativeEnum(ContributionStatus).optional(),
  isAnonymous: z.boolean().optional(),
});

export const contributionListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(ContributionStatus).optional(),
  zoneId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type InitiateContributionDto = z.infer<typeof initiateContributionSchema>;
export type UpdateContributionDto = z.infer<typeof updateContributionSchema>;
export type ContributionListQuery = z.infer<typeof contributionListQuerySchema>;
