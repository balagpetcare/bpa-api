import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import * as repo from './push-notifications.repository';
import type {
  RegisterDeviceDto,
  UpdateDeviceTokenDto,
  LogoutDeviceDto,
  ListInboxQuery,
  TrackOpenDto,
  UpdatePreferencesDto,
} from './push-notifications.types';

// ─── Device installation lifecycle ──────────────────────────────────

// A device's installationId is client-generated and stable per app install,
// not per account — if it's handed to a different user (shared/reset device,
// account switch) we re-bind ownership rather than reject the registration.
export async function registerDevice(userId: string, dto: RegisterDeviceDto) {
  const device = await repo.upsertDeviceInstallation(userId, dto);
  return { id: device.id, installationId: device.installationId, platform: device.platform };
}

export async function updateDeviceToken(userId: string, dto: UpdateDeviceTokenDto) {
  const device = await repo.findDeviceByInstallationId(dto.installationId);
  if (!device || device.userId !== userId) {
    throw AppError.notFound('Device installation');
  }
  await repo.updateDeviceToken(dto.installationId, dto.fcmToken);
  return { id: device.id, updated: true };
}

export async function logoutDevice(userId: string, dto: LogoutDeviceDto) {
  const device = await repo.findDeviceByInstallationId(dto.installationId);
  if (!device || device.userId !== userId) {
    throw AppError.notFound('Device installation');
  }
  await repo.deactivateDevice(dto.installationId);
  return { id: device.id, loggedOut: true };
}

// ─── Inbox ───────────────────────────────────────────────────────────

export async function getInbox(userId: string, q: ListInboxQuery) {
  const { items, total } = await repo.listUserInbox(userId, q);
  return { items, meta: buildPaginationMeta(total, q.page, q.limit) };
}

export async function getUnreadCount(userId: string) {
  const count = await repo.getUnreadInboxCount(userId);
  return { count };
}

async function assertOwnedNotification(userId: string, id: string) {
  const notification = await repo.findUserNotificationById(id);
  if (!notification || notification.userId !== userId) {
    throw AppError.notFound('Notification');
  }
  return notification;
}

export async function markRead(userId: string, id: string) {
  await assertOwnedNotification(userId, id);
  const updated = await repo.markUserNotificationRead(id);
  return { id: updated.id, status: updated.status };
}

export async function archiveNotification(userId: string, id: string) {
  await assertOwnedNotification(userId, id);
  const updated = await repo.archiveUserNotificationRow(id);
  return { id: updated.id, status: updated.status };
}

export async function markAllRead(userId: string) {
  const result = await repo.markAllUserNotificationsRead(userId);
  return { updated: result.count };
}

export async function trackOpen(userId: string, id: string, dto: TrackOpenDto) {
  const notification = await assertOwnedNotification(userId, id);
  const wasAlreadyOpened = notification.openedAt !== null;
  const updated = await repo.trackUserNotificationOpen(id, dto.action, wasAlreadyOpened);
  return { id: updated.id, openedAt: updated.openedAt };
}

// ─── Preferences ───────────────────────────────────────────────────

export async function getPreferences(userId: string) {
  return repo.getOrCreatePreferences(userId);
}

export async function savePreferences(userId: string, dto: UpdatePreferencesDto) {
  return repo.updatePreferences(userId, dto);
}
