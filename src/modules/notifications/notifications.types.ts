import { z } from 'zod';
import { NotificationPriority, NotificationStatus, NotificationType } from '@prisma/client';

export { NotificationPriority, NotificationStatus, NotificationType };

// ─── Create DTO ───────────────────────────────────────────────────

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  createdForRole?: string;
  createdForUserId?: string;
}

// ─── Query DTO ────────────────────────────────────────────────────

export const listNotificationsSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  status:   z.enum(['unread', 'read', 'dismissed', 'all']).default('all'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  type:     z.nativeEnum(NotificationType).optional(),
  module:   z.string().max(60).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;

// ─── Patch DTO ────────────────────────────────────────────────────

export const markReadSchema    = z.object({});
export const dismissSchema     = z.object({});
export const markAllReadSchema = z.object({
  type:   z.nativeEnum(NotificationType).optional(),
  module: z.string().max(60).optional(),
});

export type MarkAllReadDto = z.infer<typeof markAllReadSchema>;
