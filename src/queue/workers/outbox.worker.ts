import { Job, Worker } from 'bullmq';
import { prisma } from '../../database/prisma';
import { isCategoryAllowed, isWithinQuietHours } from '../../modules/push-notifications/preferences';
import { isOutboxEventPayload, OutboxEventPayload } from '../../modules/push-notifications/outbox-payload';
import { enqueueDelivery, OUTBOX_QUEUE_NAME } from '../queues';
import { getRedisConnection } from '../redis';

const BATCH_SIZE = 500;

async function resolveTargetUserIds(payload: OutboxEventPayload): Promise<string[]> {
  if (payload.targetUserIds?.length) return payload.targetUserIds;
  if (!payload.targetAll) return [];

  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (page.length === 0) break;
    ids.push(...page.map((u) => u.id));
    cursor = page[page.length - 1].id;
    if (page.length < BATCH_SIZE) break;
  }
  return ids;
}

function shouldCreateInbox(payload: OutboxEventPayload, preference: Awaited<ReturnType<typeof prisma.notificationPreference.findMany>>[number] | null) {
  if (payload.alwaysCreateInbox) return true;
  if (!isCategoryAllowed(payload.category, preference, !!payload.bypassPreferences)) return false;
  if (!payload.bypassPreferences && preference?.inAppEnabled === false) return false;
  return true;
}

function shouldCreatePush(payload: OutboxEventPayload, preference: Awaited<ReturnType<typeof prisma.notificationPreference.findMany>>[number] | null) {
  if (!isCategoryAllowed(payload.category, preference, !!payload.bypassPreferences)) return false;
  if (!payload.bypassPreferences && preference?.pushEnabled === false) return false;
  if (!payload.bypassPreferences && isWithinQuietHours(preference, new Date())) return false;
  return true;
}

function shouldCreateEmail(payload: OutboxEventPayload, preference: Awaited<ReturnType<typeof prisma.notificationPreference.findMany>>[number] | null) {
  if (!payload.email) return false;
  return isCategoryAllowed(payload.category, preference, !!payload.bypassPreferences);
}

async function createMissingPushDeliveries(
  notificationByUser: Map<string, string>,
  candidateUserIds: string[],
  campaignId: string | null,
): Promise<number> {
  if (candidateUserIds.length === 0 || notificationByUser.size === 0) return 0;

  const devices = await prisma.deviceInstallation.findMany({
    where: { userId: { in: candidateUserIds }, isActive: true, fcmToken: { not: null } },
    select: { id: true, userId: true },
  });
  if (devices.length === 0) return 0;

  const notificationIds = [...notificationByUser.values()];
  const existing = await prisma.notificationDelivery.findMany({
    where: {
      userNotificationId: { in: notificationIds },
      deviceId: { in: devices.map((device) => device.id) },
    },
    select: { userNotificationId: true, deviceId: true },
  });
  const existingKeys = new Set(existing.map((row) => `${row.userNotificationId}:${row.deviceId}`));

  const rows = devices
    .map((device) => {
      const userNotificationId = notificationByUser.get(device.userId);
      if (!userNotificationId) return null;
      const key = `${userNotificationId}:${device.id}`;
      if (existingKeys.has(key)) return null;
      return {
        campaignId,
        userNotificationId,
        deviceId: device.id,
        userId: device.userId,
        status: 'pending' as const,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    await prisma.notificationDelivery.createMany({ data: rows });
  }

  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      userNotificationId: { in: notificationIds },
      deviceId: { in: devices.map((device) => device.id) },
      status: 'pending',
    },
    select: { id: true },
  });
  for (const delivery of deliveries) {
    await enqueueDelivery(delivery.id);
  }

  return rows.length;
}

async function createMissingEmailDeliveries(
  notificationByUser: Map<string, string>,
  candidateUserIds: string[],
  campaignId: string | null,
): Promise<number> {
  if (candidateUserIds.length === 0 || notificationByUser.size === 0) return 0;

  const notificationIds = candidateUserIds
    .map((userId) => notificationByUser.get(userId))
    .filter((id): id is string => Boolean(id));
  if (notificationIds.length === 0) return 0;

  const existing = await prisma.notificationDelivery.findMany({
    where: {
      userNotificationId: { in: notificationIds },
      deviceId: null,
    },
    select: { userNotificationId: true },
  });
  const existingNotificationIds = new Set(existing.map((row) => row.userNotificationId).filter((id): id is string => Boolean(id)));

  const rows = candidateUserIds
    .map((userId) => {
      const userNotificationId = notificationByUser.get(userId);
      if (!userNotificationId || existingNotificationIds.has(userNotificationId)) return null;
      return {
        campaignId,
        userNotificationId,
        deviceId: null,
        userId,
        status: 'pending' as const,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    await prisma.notificationDelivery.createMany({ data: rows });
  }

  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      userNotificationId: { in: notificationIds },
      deviceId: null,
      status: 'pending',
    },
    select: { id: true },
  });
  for (const delivery of deliveries) {
    await enqueueDelivery(delivery.id);
  }

  return rows.length;
}

export async function processOutboxEvent(job: Job<{ outboxEventId: string }>): Promise<void> {
  const { outboxEventId } = job.data;

  const claimed = await prisma.notificationOutboxEvent.updateMany({
    where: { id: outboxEventId, status: { in: ['pending', 'failed'] } },
    data: { status: 'processing', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const event = await prisma.notificationOutboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!event) return;

  try {
    if (!isOutboxEventPayload(event.payload)) {
      throw new Error(`Outbox event ${event.id} has malformed payload`);
    }

    const payload = event.payload;
    const userIds = await resolveTargetUserIds(payload);

    for (let index = 0; index < userIds.length; index += BATCH_SIZE) {
      const batch = userIds.slice(index, index + BATCH_SIZE);
      const preferences = await prisma.notificationPreference.findMany({
        where: { userId: { in: batch } },
      });
      const preferenceByUser = new Map(preferences.map((preference) => [preference.userId, preference]));

      const inboxUserIds = batch.filter((userId) => shouldCreateInbox(payload, preferenceByUser.get(userId) ?? null));
      if (inboxUserIds.length === 0) continue;

      const notificationRows = inboxUserIds.map((userId) => ({
        userId,
        campaignId: payload.campaignId ?? null,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        category: payload.category,
        priority: payload.priority ?? 'normal',
        title: payload.title,
        titleBn: payload.titleBn,
        body: payload.body,
        bodyBn: payload.bodyBn,
        imageUrl: payload.imageUrl,
        deepLink: payload.deepLink,
        dedupeKey: event.dedupeKey,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      }));

      await prisma.userNotification.createMany({ data: notificationRows, skipDuplicates: true });

      const createdNotifications = await prisma.userNotification.findMany({
        where: { userId: { in: inboxUserIds }, dedupeKey: event.dedupeKey },
        select: { id: true, userId: true },
      });
      const notificationByUser = new Map(createdNotifications.map((notification) => [notification.userId, notification.id]));

      const pushUserIds = inboxUserIds.filter((userId) => shouldCreatePush(payload, preferenceByUser.get(userId) ?? null));
      const emailUserIds = inboxUserIds.filter((userId) => shouldCreateEmail(payload, preferenceByUser.get(userId) ?? null));

      const [pushCount, emailCount] = await Promise.all([
        createMissingPushDeliveries(notificationByUser, pushUserIds, payload.campaignId ?? null),
        createMissingEmailDeliveries(notificationByUser, emailUserIds, payload.campaignId ?? null),
      ]);

      if (payload.campaignId && (pushCount > 0 || emailCount > 0)) {
        await prisma.notificationCampaign.update({
          where: { id: payload.campaignId },
          data: { attemptedCount: { increment: pushCount + emailCount } },
        });
      }
    }

    if (payload.campaignId) {
      await prisma.notificationCampaign.update({
        where: { id: payload.campaignId },
        data: { targetedCount: userIds.length },
      });
    }

    await prisma.notificationOutboxEvent.update({
      where: { id: event.id },
      data: { status: 'sent', processedAt: new Date(), lastError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown outbox processing error';
    const isFinalAttempt = event.attempts >= event.maxAttempts;
    await prisma.notificationOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: isFinalAttempt ? 'dead_letter' : 'failed',
        lastError: message,
        nextAttemptAt: new Date(Date.now() + Math.min(2 ** event.attempts, 60) * 1000),
      },
    });
    throw err;
  }
}

export function createOutboxWorker(): Worker {
  const worker = new Worker(OUTBOX_QUEUE_NAME, processOutboxEvent, {
    connection: getRedisConnection(),
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.error(`[OutboxWorker] job ${job?.id} failed:`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[OutboxWorker] job ${job.id} completed`);
  });

  return worker;
}
