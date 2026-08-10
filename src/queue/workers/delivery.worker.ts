import { Job, Worker } from 'bullmq';
import { prisma } from '../../database/prisma';
import { firebaseProvider } from '../../providers/firebase.provider';
import { sendEmail } from '../../services/email.service';
import { DELIVERY_QUEUE_NAME } from '../queues';
import { getRedisConnection } from '../redis';

async function recordEmailLog(params: {
  deliveryId: string;
  to: string;
  subject: string;
  body: string;
  providerRef?: string | null;
  status: 'queued' | 'sent' | 'failed';
  failureReason?: string | null;
  dedupeKey?: string | null;
}): Promise<void> {
  await prisma.emailLog.create({
    data: {
      to: params.to,
      subject: params.subject,
      body: params.body,
      status: params.status,
      provider: 'smtp',
      providerRef: params.providerRef ?? null,
      failureReason: params.failureReason ?? null,
      sentAt: params.status === 'sent' ? new Date() : null,
      payload: {
        notificationDeliveryId: params.deliveryId,
        dedupeKey: params.dedupeKey ?? null,
      },
    },
  });
}

async function processPushDelivery(deliveryId: string): Promise<void> {
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
      data: { status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date(), lastError: null },
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
    return;
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
    throw new Error(result.error);
  }
}

async function processEmailDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!delivery || delivery.status === 'delivered' || delivery.status === 'sent') return;

  const [notification, user] = await Promise.all([
    delivery.userNotificationId ? prisma.userNotification.findUnique({ where: { id: delivery.userNotificationId } }) : null,
    prisma.user.findUnique({ where: { id: delivery.userId }, select: { email: true } }),
  ]);

  if (!notification) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'NOTIFICATION_NOT_FOUND', failedAt: new Date() },
    });
    return;
  }

  if (!user?.email) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'NO_EMAIL_ADDRESS', failedAt: new Date() },
    });
    return;
  }

  const locale = notification.titleBn || notification.bodyBn ? 'bn' : 'en';
  const subject = (locale === 'bn' && notification.titleBn) || notification.title;
  const text = (locale === 'bn' && notification.bodyBn) || notification.body;
  const html = `
    <p>${text}</p>
    ${notification.deepLink ? `<p><a href="${notification.deepLink}">Open booking details</a></p>` : ''}
  `;

  const result = await sendEmail({
    to: user.email,
    subject,
    text,
    html,
    locale,
  });

  if (result.ok) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date(), lastError: null },
    });
    await recordEmailLog({
      deliveryId: delivery.id,
      to: user.email,
      subject,
      body: text,
      providerRef: result.providerMessageId,
      status: 'sent',
      dedupeKey: notification.dedupeKey,
    });
    return;
  }

  if (result.disabled) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'EMAIL_DISABLED', failedAt: new Date() },
    });
    await recordEmailLog({
      deliveryId: delivery.id,
      to: user.email,
      subject,
      body: text,
      status: 'failed',
      failureReason: 'EMAIL_DISABLED',
      dedupeKey: notification.dedupeKey,
    });
    return;
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
  await recordEmailLog({
    deliveryId: delivery.id,
    to: user.email,
    subject,
    body: text,
    status: 'failed',
    failureReason: result.error,
    dedupeKey: notification.dedupeKey,
  });
  if (!isFinal) {
    throw new Error(result.error);
  }
}

export async function processDelivery(job: Job<{ deliveryId: string }>): Promise<void> {
  const { deliveryId } = job.data;
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, deviceId: true },
  });
  if (!delivery) return;

  if (delivery.deviceId) {
    await processPushDelivery(deliveryId);
    return;
  }

  await processEmailDelivery(deliveryId);
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
