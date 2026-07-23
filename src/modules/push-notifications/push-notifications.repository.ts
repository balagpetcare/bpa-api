import { prisma } from '../../database/prisma';
import type { RegisterDeviceDto, ListInboxQuery, UpdatePreferencesDto } from './push-notifications.types';

// ─── Device installations ───────────────────────────────────────────

export async function upsertDeviceInstallation(userId: string, dto: RegisterDeviceDto) {
  return prisma.deviceInstallation.upsert({
    where: { installationId: dto.installationId },
    create: {
      userId,
      installationId: dto.installationId,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
      appVersion: dto.appVersion,
      osVersion: dto.osVersion,
      locale: dto.locale,
      timezone: dto.timezone,
      tokenUpdatedAt: dto.fcmToken ? new Date() : null,
      isActive: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
      appVersion: dto.appVersion,
      osVersion: dto.osVersion,
      locale: dto.locale,
      timezone: dto.timezone,
      tokenUpdatedAt: dto.fcmToken ? new Date() : undefined,
      isActive: true,
      invalidatedAt: null,
      loggedOutAt: null,
      lastSeenAt: new Date(),
    },
  });
}

export async function findDeviceByInstallationId(installationId: string) {
  return prisma.deviceInstallation.findUnique({ where: { installationId } });
}

export async function updateDeviceToken(installationId: string, fcmToken: string) {
  return prisma.deviceInstallation.update({
    where: { installationId },
    data: { fcmToken, tokenUpdatedAt: new Date(), isActive: true, invalidatedAt: null, lastSeenAt: new Date() },
  });
}

export async function deactivateDevice(installationId: string) {
  return prisma.deviceInstallation.update({
    where: { installationId },
    data: { isActive: false, fcmToken: null, loggedOutAt: new Date() },
  });
}

export async function markTokenInvalid(deviceId: string) {
  return prisma.deviceInstallation.update({
    where: { id: deviceId },
    data: { isActive: false, invalidatedAt: new Date() },
  });
}

// ─── Inbox ───────────────────────────────────────────────────────────

export async function listUserInbox(userId: string, q: ListInboxQuery) {
  const where: any = { userId };
  if (q.status !== 'all') where.status = q.status;
  if (q.category) where.category = q.category;

  const [items, total] = await Promise.all([
    prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.userNotification.count({ where }),
  ]);

  return { items, total };
}

export async function getUnreadInboxCount(userId: string) {
  return prisma.userNotification.count({ where: { userId, status: 'unread' } });
}

export async function findUserNotificationById(id: string) {
  return prisma.userNotification.findUnique({ where: { id } });
}

export async function markUserNotificationRead(id: string) {
  return prisma.userNotification.update({
    where: { id },
    data: { status: 'read', readAt: new Date() },
  });
}

export async function archiveUserNotificationRow(id: string) {
  return prisma.userNotification.update({
    where: { id },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

export async function markAllUserNotificationsRead(userId: string) {
  return prisma.userNotification.updateMany({
    where: { userId, status: 'unread' },
    data: { status: 'read', readAt: new Date() },
  });
}

export async function trackUserNotificationOpen(
  id: string,
  action: 'opened' | 'clicked',
  wasAlreadyOpened: boolean,
) {
  const notification = await prisma.userNotification.update({
    where: { id },
    data: { openedAt: new Date() },
  });

  if (notification.campaignId) {
    await prisma.notificationCampaign.update({
      where: { id: notification.campaignId },
      data: {
        ...(action === 'opened' && !wasAlreadyOpened ? { openedCount: { increment: 1 } } : {}),
        ...(action === 'clicked' ? { clickedCount: { increment: 1 } } : {}),
      },
    });
  }

  return notification;
}

// ─── Preferences ───────────────────────────────────────────────────

/**
 * In-memory-only default shape, returned (never persisted) when `userId`
 * doesn't correspond to a real local User row. This happens for a
 * brand-new device's very first authenticated GET before any write action
 * has run `requireLocalUser`'s auto-provisioning — GET requests there
 * deliberately substitute a sentinel UUID rather than creating a user row
 * on a mere read (see requireLocalUser.ts), so persisting a
 * NotificationPreference against that sentinel would violate the FK to
 * User and throw Prisma P2003. Returning safe defaults here means the
 * Preferences screen still renders correctly; the real row gets created
 * the moment the device performs any write (e.g. device registration,
 * or the user actually changing a preference, which upserts against
 * their now-provisioned real id).
 */
function inMemoryDefaultPreferences(userId: string) {
  const now = new Date();
  return {
    id: '00000000-0000-0000-0000-000000000000',
    userId,
    petHealthEnabled: true,
    campaignEnabled: true,
    videoEnabled: true,
    membershipEnabled: true,
    bookingEnabled: true,
    promotionalEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    language: 'en',
    timezone: 'Asia/Dhaka',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreatePreferences(userId: string) {
  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) {
    return inMemoryDefaultPreferences(userId);
  }
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function updatePreferences(userId: string, dto: UpdatePreferencesDto) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...dto },
    update: dto,
  });
}
