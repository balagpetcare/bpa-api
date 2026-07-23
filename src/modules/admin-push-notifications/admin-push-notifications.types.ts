import { z } from 'zod';
import { NotificationCategory, NotificationPriority, NotificationChannel } from '@prisma/client';

export { NotificationCategory, NotificationPriority, NotificationChannel };

const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// ─── Templates ───────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  key: z.string().min(3).max(120),
  category: z.nativeEnum(NotificationCategory),
  title: z.string().min(1).max(255),
  titleBn: z.string().max(255).optional(),
  body: z.string().min(1),
  bodyBn: z.string().optional(),
  imageUrl: z.string().url().optional(),
  deepLink: z.string().max(500).optional(),
  defaultPriority: z.nativeEnum(NotificationPriority).default('normal'),
  isActive: z.boolean().default(true),
});
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;

export const listTemplatesSchema = z.object({
  ...paginationSchema,
  category: z.nativeEnum(NotificationCategory).optional(),
});

// ─── Campaigns (composer / broadcasts) ────────────────────────────

const audienceFilterSchema = z
  .object({
    locationIds: z.array(z.string().uuid()).optional(),
    petTypes: z.array(z.string()).optional(),
    campaignId: z.string().uuid().optional(),
    membershipTierIds: z.array(z.string().uuid()).optional(),
    language: z.enum(['en', 'bn']).optional(),
    platform: z.enum(['android', 'ios', 'web']).optional(),
    minAppVersion: z.string().optional(),
  })
  .optional();

export const createCampaignSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  titleBn: z.string().max(255).optional(),
  body: z.string().min(1),
  bodyBn: z.string().optional(),
  imageUrl: z.string().url().optional(),
  deepLink: z.string().max(500).optional(),
  category: z.nativeEnum(NotificationCategory),
  priority: z.nativeEnum(NotificationPriority).default('normal'),
  channel: z.nativeEnum(NotificationChannel).default('push_and_in_app'),
  audienceType: z.enum(['all_users', 'segment']).default('all_users'),
  audienceFilter: audienceFilterSchema,
  expiresAt: z.string().datetime().optional(),
});
export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial();
export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;

export const listCampaignsSchema = z.object({
  ...paginationSchema,
  status: z
    .enum(['draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'])
    .optional(),
});

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime(),
});
export type ScheduleCampaignDto = z.infer<typeof scheduleCampaignSchema>;

export const testSendSchema = z.object({
  installationId: z.string().min(1),
});
export type TestSendDto = z.infer<typeof testSendSchema>;

// ─── Automation rules ──────────────────────────────────────────────

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(160),
  triggerType: z.enum(['domain_event', 'pet_reminder_schedule']),
  eventType: z.string().max(80).optional(),
  offsetDays: z.number().int().optional(),
  templateId: z.string().uuid(),
  category: z.nativeEnum(NotificationCategory),
  priority: z.nativeEnum(NotificationPriority).default('normal'),
  isActive: z.boolean().default(true),
});
export type CreateAutomationRuleDto = z.infer<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();
export type UpdateAutomationRuleDto = z.infer<typeof updateAutomationRuleSchema>;

// ─── Deliveries ──────────────────────────────────────────────────

export const listFailedDeliveriesSchema = z.object(paginationSchema);

// ─── Audit ─────────────────────────────────────────────────────────

export const listAuditSchema = z.object(paginationSchema);
