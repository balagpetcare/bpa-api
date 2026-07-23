import { Worker, Job } from 'bullmq';
import { prisma } from '../../database/prisma';
import { getRedisConnection } from '../redis';
import { DELIVERY_QUEUE_NAME } from '../queues';
import { firebaseProvider } from '../../providers/firebase.provider';

async function processDelivery(job: Job<{ deliveryId: string }>): Promise<void> {
  const { deliveryId } = job.data;

  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
    include: { device: true },
  });
  if (!delivery || delivery.status === 'delivered' || delivery.status === 'sent') return;

  const notification = delivery.userNotificationId
    ? await prisma.userNotification.findUnique({ where: { id: delivery.userNotificationId } })
    : null;

  if (!delivery.device?.fcmToken || !delivery.device.isActive) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'NO_ACTIVE_DEVICE_TOKEN', failedAt: new Date() },
    });
    return;
  }

  if (!notification) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'NOTIFICATION_NOT_FOUND', failedAt: new Date() },
    });
    return;
  }

  const useBengali = delivery.device.locale === 'bn';
  const result = await firebaseProvider.send({
    fcmToken: delivery.device.fcmToken,
    title: (useBengali && notification.titleBn) || notification.title,
    body: (useBengali && notification.bodyBn) || notification.body,
    imageUrl: notification.imageUrl,
    deepLink: notification.deepLink,
    category: notification.category,
    priority: notification.priority,
    data: { notificationId: notification.id },
  });

  if (result.ok) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date() },
    });
    if (delivery.campaignId) {
      await prisma.notificationCampaign.update({
        where: { id: delivery.campaignId },
        data: { acceptedCount: { increment: 1 } },
      });
    }
    return;
  }

  if (result.error === 'FCM_DISABLED') {
    // No Firebase credentials configured — this is expected in dev/CI.
    // Mark as sent-but-skipped so the pipeline doesn't spin retries forever
    // over a configuration gap rather than a real send failure.
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'FCM_DISABLED', failedAt: new Date() },
    });
    return;
  }

  if (result.invalidToken) {
    await prisma.deviceInstallation.update({
      where: { id: delivery.device.id },
      data: { isActive: false, invalidatedAt: new Date(), fcmToken: null },
    });
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'invalid_token', lastError: result.error, failedAt: new Date() },
    });
    return; // do not retry — the token is permanently gone
  }

  const retryCount = delivery.retryCount + 1;
  const isFinal = retryCount >= delivery.maxRetries;
  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: 'failed',
      retryCount,
      lastError: result.error,
      failedAt: isFinal ? new Date() : undefined,
    },
  });
  if (delivery.campaignId && isFinal) {
    await prisma.notificationCampaign.update({
      where: { id: delivery.campaignId },
      data: { failedCount: { increment: 1 } },
    });
  }
  if (!isFinal) {
    throw new Error(result.error); // triggers BullMQ's own exponential backoff retry
  }
}

export function createDeliveryWorker(): Worker {
  const worker = new Worker(DELIVERY_QUEUE_NAME, processDelivery, {
    connection: getRedisConnection(),
    concurrency: 20,
  });

  worker.on('failed', (job, err) => {
    console.error(`[DeliveryWorker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
