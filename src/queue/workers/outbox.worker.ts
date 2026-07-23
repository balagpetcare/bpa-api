import { Worker, Job } from 'bullmq';
import { prisma } from '../../database/prisma';
import { getRedisConnection } from '../redis';
import { OUTBOX_QUEUE_NAME, enqueueDelivery } from '../queues';
import { isOutboxEventPayload, OutboxEventPayload } from '../../modules/push-notifications/outbox-payload';
import { isCategoryAllowed, isWithinQuietHours } from '../../modules/push-notifications/preferences';

const BATCH_SIZE = 500;

async function resolveTargetUserIds(payload: OutboxEventPayload): Promise<string[]> {
  if (payload.targetUserIds?.length) return payload.targetUserIds;
  if (!payload.targetAll) return [];

  const ids: string[] = [];
  let cursor: string | undefined;
  // Batch through the user table rather than loading the whole table at once.
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

async function processOutboxEvent(job: Job<{ outboxEventId: string }>): Promise<void> {
  const { outboxEventId } = job.data;

  // Claim the row so a concurrent worker (or a retried job that overlaps
  // with an in-flight attempt) never double-processes the same event.
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

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      const preferences = await prisma.notificationPreference.findMany({
        where: { userId: { in: batch } },
      });
      const preferenceByUser = new Map(preferences.map((p) => [p.userId, p]));

      const allowedUserIds = batch.filter((userId) => {
        const pref = preferenceByUser.get(userId) ?? null;
        if (!isCategoryAllowed(payload.category, pref, !!payload.bypassPreferences)) return false;
        if (!payload.bypassPreferences && pref?.inAppEnabled === false) return false;
        return true;
      });
      if (allowedUserIds.length === 0) continue;

      const rows = allowedUserIds.map((userId) => ({
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

      // (userId, dedupeKey) is unique — re-draining the same event (e.g. a
      // retried job after a partial failure) never creates duplicate inbox rows.
      await prisma.userNotification.createMany({ data: rows, skipDuplicates: true });

      const created = await prisma.userNotification.findMany({
        where: { userId: { in: allowedUserIds }, dedupeKey: event.dedupeKey },
        select: { id: true, userId: true },
      });
      const notificationByUser = new Map(created.map((n) => [n.userId, n.id]));

      const pushCandidateUserIds = allowedUserIds.filter((userId) => {
        const pref = preferenceByUser.get(userId) ?? null;
        if (!payload.bypassPreferences && pref?.pushEnabled === false) return false;
        if (isWithinQuietHours(pref, new Date()) && !payload.bypassPreferences) return false;
        return true;
      });
      if (pushCandidateUserIds.length === 0) continue;

      const devices = await prisma.deviceInstallation.findMany({
        where: { userId: { in: pushCandidateUserIds }, isActive: true, fcmToken: { not: null } },
        select: { id: true, userId: true },
      });
      if (devices.length === 0) continue;

      const deliveryRows = devices.map((d) => ({
        campaignId: payload.campaignId ?? null,
        userNotificationId: notificationByUser.get(d.userId) ?? null,
        deviceId: d.id,
        userId: d.userId,
        status: 'pending' as const,
      }));

      await prisma.notificationDelivery.createMany({ data: deliveryRows });

      const createdDeliveries = await prisma.notificationDelivery.findMany({
        where: {
          deviceId: { in: devices.map((d) => d.id) },
          status: 'pending',
          userNotificationId: { in: [...notificationByUser.values()] },
        },
        select: { id: true },
      });

      if (payload.campaignId) {
        await prisma.notificationCampaign.update({
          where: { id: payload.campaignId },
          data: { attemptedCount: { increment: createdDeliveries.length } },
        });
      }

      for (const delivery of createdDeliveries) {
        await enqueueDelivery(delivery.id);
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
    throw err; // let BullMQ's own retry/backoff also apply at the job level
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
