import { z } from 'zod';

export const registerCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  sessionId: z.string().uuid(),
  ownerName: z.string().min(1).max(120),
  mobile: z.string().min(7).max(20),
  email: z.string().email().max(255).optional(),
  address: z.string().max(500).optional(),
  petIds: z.array(z.string().uuid()).min(1).max(10),
  notes: z.string().max(1000).optional(),
  // Lets the mobile app opt into a deep-link payment return instead of the
  // web FRONTEND_URL redirect — see payment-callbacks.router.ts getRedirectUrl.
  platform: z.enum(['web', 'mobile']).optional().default('web'),
});

export const joinWaitlistSchema = z.object({
  campaignId: z.string().uuid(),
  sessionId: z.string().uuid(),
  ownerName: z.string().min(1).max(120),
  mobile: z.string().min(7).max(20),
  email: z.string().email().max(255).optional(),
  petCount: z.number().int().min(1).max(10),
});

export const registrationListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  campaignId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

export const waitlistListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  campaignId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export type RegisterCampaignDto = z.infer<typeof registerCampaignSchema>;
export type JoinWaitlistDto = z.infer<typeof joinWaitlistSchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;
export type WaitlistListQuery = z.infer<typeof waitlistListQuerySchema>;
