import { z } from 'zod';
import { ContributionType } from '@prisma/client';

export const createContributionPlanSchema = z.object({
  title: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).regex(/^[a-z0-9-]+$/),
  contributionType: z.nativeEnum(ContributionType).default('care_partner'),
  amountBdt: z.number().positive(),
  currency: z.string().length(3).default('BDT'),
  description: z.string().max(2000).optional(),
  benefitsSummaryJson: z.array(z.string()).optional(),
  legalDisclaimerText: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateContributionPlanSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  slug: z.string().min(2).max(140).regex(/^[a-z0-9-]+$/).optional(),
  contributionType: z.nativeEnum(ContributionType).optional(),
  amountBdt: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().max(2000).optional().nullable(),
  benefitsSummaryJson: z.array(z.string()).optional().nullable(),
  legalDisclaimerText: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateContributionPlanDto = z.infer<typeof createContributionPlanSchema>;
export type UpdateContributionPlanDto = z.infer<typeof updateContributionPlanSchema>;
