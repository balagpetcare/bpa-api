import { z } from 'zod';
import { DevicePlatform, NotificationCategory } from '@prisma/client';

export { DevicePlatform, NotificationCategory };

// ─── Device installation ──────────────────────────────────────────

export const registerDeviceSchema = z.object({
  installationId: z.string().min(8).max(255),
  fcmToken: z.string().min(20).max(4096).optional(),
  platform: z.nativeEnum(DevicePlatform),
  appVersion: z.string().max(40).optional(),
  osVersion: z.string().max(40).optional(),
  locale: z.enum(['en', 'bn']).default('en'),
  timezone: z.string().max(60).default('Asia/Dhaka'),
});
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;

export const updateDeviceTokenSchema = z.object({
  installationId: z.string().min(8).max(255),
  fcmToken: z.string().min(20).max(4096),
});
export type UpdateDeviceTokenDto = z.infer<typeof updateDeviceTokenSchema>;

export const logoutDeviceSchema = z.object({
  installationId: z.string().min(8).max(255),
});
export type LogoutDeviceDto = z.infer<typeof logoutDeviceSchema>;

// ─── Inbox ─────────────────────────────────────────────────────────

export const listInboxSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['unread', 'read', 'archived', 'all']).default('all'),
  category: z.nativeEnum(NotificationCategory).optional(),
});
export type ListInboxQuery = z.infer<typeof listInboxSchema>;

export const trackOpenSchema = z.object({
  action: z.enum(['opened', 'clicked']).default('opened'),
});
export type TrackOpenDto = z.infer<typeof trackOpenSchema>;

// ─── Preferences ───────────────────────────────────────────────────

export const updatePreferencesSchema = z.object({
  petHealthEnabled: z.boolean().optional(),
  campaignEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  membershipEnabled: z.boolean().optional(),
  bookingEnabled: z.boolean().optional(),
  promotionalEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  language: z.enum(['en', 'bn']).optional(),
  timezone: z.string().max(60).optional(),
});
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>;
