import { z } from 'zod';

export const createCampaignFaqSchema = z.object({
  questionEn: z.string().min(1).max(2000),
  questionBn: z.string().max(2000).optional().nullable(),
  answerEn: z.string().min(1).max(5000),
  answerBn: z.string().max(5000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateCampaignFaqSchema = z.object({
  questionEn: z.string().min(1).max(2000).optional(),
  questionBn: z.string().max(2000).optional().nullable(),
  answerEn: z.string().min(1).max(5000).optional(),
  answerBn: z.string().max(5000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const reorderCampaignFaqsSchema = z.object({
  faqIds: z.array(z.string().uuid()).min(1),
});

export type CreateCampaignFaqDto = z.infer<typeof createCampaignFaqSchema>;
export type UpdateCampaignFaqDto = z.infer<typeof updateCampaignFaqSchema>;
export type ReorderCampaignFaqsDto = z.infer<typeof reorderCampaignFaqsSchema>;
