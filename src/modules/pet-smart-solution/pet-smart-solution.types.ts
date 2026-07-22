import { z } from 'zod';

export const syncStatusSchema = z.enum(['pending', 'success', 'failed', 'skipped']);

export const syncTypeOptions = [
  'contributors',
  'care_partner_cards',
  'pet_census_leads',
  'zones',
] as const;

export const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  apiKey: z.union([z.string().max(2000), z.literal(''), z.null()]).optional(),
  syncEnabled: z.object({
    contributors: z.boolean(),
    carePartnerCards: z.boolean(),
    petCensusLeads: z.boolean(),
    zones: z.boolean(),
  }).optional(),
});

export const syncLogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: syncStatusSchema.optional(),
  syncType: z.enum(syncTypeOptions).optional(),
  entityType: z.string().max(60).optional(),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
export type SyncLogListQuery = z.infer<typeof syncLogListQuerySchema>;

export interface PetSmartIntegrationSettingsResponse {
  enabled: boolean;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  apiKeyReference: string | null;
  syncEnabled: {
    contributors: boolean;
    carePartnerCards: boolean;
    petCensusLeads: boolean;
    zones: boolean;
  };
  lastSyncAt: string | null;
  status: string;
}

export interface PetSmartConnectionTestResponse {
  connected: boolean;
  status: string;
  baseUrl: string | null;
  checkedAt: string;
  message: string;
}
