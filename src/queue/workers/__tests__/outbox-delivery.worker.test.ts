import { prisma } from '../../../database/prisma';
import { publishOutboxEvent } from '../../../modules/push-notifications/outbox';
import { processDelivery } from '../delivery.worker';
import { processOutboxEvent } from '../outbox.worker';

jest.mock('../../queues', () => ({
  OUTBOX_QUEUE_NAME: 'notification-outbox',
  DELIVERY_QUEUE_NAME: 'notification-delivery',
  enqueueOutboxEvent: jest.fn().mockResolvedValue(undefined),
  enqueueDelivery: jest.fn().mockResolvedValue(undefined),
}));

describe('notification outbox/delivery workers', () => {
  const suffix = Date.now();
  let userId: string;
  let deviceId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: `Notification Worker ${suffix}`,
        email: `notification-worker-${suffix}@example.com`,
        centralAuthUserId: `notification-worker-central-${suffix}`,
        role: 'USER',
      },
    });
    userId = user.id;

    await prisma.notificationPreference.create({
      data: {
        userId,
      },
    });

    const device = await prisma.deviceInstallation.create({
      data: {
        userId,
        installationId: `install-${suffix}`,
        platform: 'android',
        fcmToken: `fcm-${suffix}`,
        locale: 'en',
        timezone: 'Asia/Dhaka',
        isActive: true,
      },
    });
    deviceId = device.id;
  });

  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { to: `notification-worker-${suffix}@example.com` } });
    await prisma.notificationDelivery.deleteMany({ where: { userId } });
    await prisma.userNotification.deleteMany({ where: { userId } });
    await prisma.notificationOutboxEvent.deleteMany({ where: { dedupeKey: { startsWith: `worker-test-${suffix}` } } });
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.deviceInstallation.deleteMany({ where: { id: deviceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('deduplicates push and email deliveries across outbox retries', async () => {
    const result = await publishOutboxEvent({
      eventType: 'SPAY_BOOKING_CONFIRMED',
      entityType: 'spay_booking',
      entityId: `booking-${suffix}`,
      dedupeKey: `worker-test-${suffix}-dedupe`,
      payload: {
        category: 'booking',
        title: 'Worker test',
        body: 'Retry-safe delivery fan-out',
        deepLink: `bpa://spay-neuter/bookings/booking-${suffix}`,
        targetUserIds: [userId],
        alwaysCreateInbox: true,
        email: {
          subject: 'Worker test email',
          text: 'Retry-safe delivery fan-out',
        },
      },
    });

    await processOutboxEvent({ data: { outboxEventId: result.id } } as any);
    await prisma.notificationOutboxEvent.update({
      where: { id: result.id },
      data: { status: 'failed', processedAt: null },
    });
    await processOutboxEvent({ data: { outboxEventId: result.id } } as any);

    const notifications = await prisma.userNotification.findMany({
      where: { userId, dedupeKey: `worker-test-${suffix}-dedupe` },
    });
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { userId, userNotificationId: notifications[0]?.id ?? undefined },
    });

    expect(notifications).toHaveLength(1);
    expect(deliveries.filter((delivery) => delivery.deviceId === null)).toHaveLength(1);
    expect(deliveries.filter((delivery) => delivery.deviceId === deviceId)).toHaveLength(1);
  });

  it('fails email delivery safely when SMTP credentials are absent and records an email log', async () => {
    const result = await publishOutboxEvent({
      eventType: 'SPAY_POST_OPERATIVE_CARE',
      entityType: 'spay_booking',
      entityId: `booking-email-${suffix}`,
      dedupeKey: `worker-test-${suffix}-email`,
      payload: {
        category: 'booking',
        title: 'Email safe fail',
        body: 'SMTP is intentionally absent in test.',
        deepLink: `bpa://spay-neuter/bookings/booking-email-${suffix}`,
        targetUserIds: [userId],
        alwaysCreateInbox: true,
        email: {
          subject: 'Email safe fail',
          text: 'SMTP is intentionally absent in test.',
        },
      },
    });

    await processOutboxEvent({ data: { outboxEventId: result.id } } as any);
    const notification = await prisma.userNotification.findFirstOrThrow({
      where: { userId, dedupeKey: `worker-test-${suffix}-email` },
      orderBy: { createdAt: 'desc' },
    });
    const emailDelivery = await prisma.notificationDelivery.findFirstOrThrow({
      where: {
        userId,
        deviceId: null,
        userNotificationId: notification.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.notificationDelivery.update({
      where: { id: emailDelivery.id },
      data: { maxRetries: 1 },
    });

    await processDelivery({ data: { deliveryId: emailDelivery.id } } as any);

    const updated = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: emailDelivery.id } });
    const emailLog = await prisma.emailLog.findFirst({
      where: {
        to: `notification-worker-${suffix}@example.com`,
        payload: { path: ['notificationDeliveryId'], equals: emailDelivery.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(updated.status).toBe('failed');
    expect(['EMAIL_DISABLED', 'EMAIL_SEND_FAILED']).toContain(updated.lastError);
    expect(emailLog?.status).toBe('failed');
    expect(['EMAIL_DISABLED', 'EMAIL_SEND_FAILED']).toContain(emailLog?.failureReason);
  });
});
