import { AppError } from '../../utils/AppError';
import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  dismissNotification,
  markAllRead,
  findNotificationById,
} from './notifications.repository';
import type { CreateNotificationDto, ListNotificationsQuery, MarkAllReadDto } from './notifications.types';

// ─── Internal helper (fire-and-forget) ───────────────────────────

/**
 * Create a notification without throwing — safe to call from any service.
 * Failures are logged but never propagate to the caller.
 */
export async function notifyAdmins(dto: CreateNotificationDto): Promise<void> {
  try {
    await createNotification(dto);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Notifications] Failed to create notification:', err instanceof Error ? err.message : err);
    }
  }
}

// ─── API service functions ────────────────────────────────────────

export async function getNotificationsList(q: ListNotificationsQuery) {
  return listNotifications(q);
}

export async function getUnreadNotificationCount() {
  return getUnreadCount();
}

export async function readNotification(id: string) {
  const existing = await findNotificationById(id);
  if (!existing) throw AppError.notFound('Notification not found');
  await markNotificationRead(id);
  return { id, status: 'read' };
}

export async function dismissOneNotification(id: string) {
  const existing = await findNotificationById(id);
  if (!existing) throw AppError.notFound('Notification not found');
  await dismissNotification(id);
  return { id, status: 'dismissed' };
}

export async function readAllNotifications(dto: MarkAllReadDto) {
  const result = await markAllRead({ type: dto.type, module: dto.module });
  return { updated: result.count };
}
