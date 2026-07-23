import { NotificationCategory, NotificationPriority } from '@prisma/client';

/**
 * Content is rendered by the event producer (video/post/campaign publish
 * handlers, pet reminder cron, etc.) at write time and carried on the
 * outbox row itself — this keeps the drain worker a pure fan-out/delivery
 * step with no template-lookup coupling. Admin-composed broadcasts go
 * through NotificationCampaign instead, which does use NotificationTemplate.
 */
export type OutboxEventPayload = {
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  titleBn?: string;
  body: string;
  bodyBn?: string;
  imageUrl?: string;
  deepLink?: string;
  /** Explicit recipient list — used for personal events (booking, payment, pet reminder). */
  targetUserIds?: string[];
  /** Broadcast to all active users respecting their category preference — video/post/campaign publish. */
  targetAll?: boolean;
  /** Emergency/security notifications bypass normal marketing preferences and quiet hours. */
  bypassPreferences?: boolean;
  expiresAt?: string;
  /** Set when this event originates from an admin-composed NotificationCampaign, so
   * the resulting UserNotification/NotificationDelivery rows link back to it for analytics. */
  campaignId?: string;
};

export function isOutboxEventPayload(value: unknown): value is OutboxEventPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.category === 'string' && typeof v.title === 'string' && typeof v.body === 'string';
}
