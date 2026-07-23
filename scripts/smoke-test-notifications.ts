/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { createOutboxWorker } from '../src/queue/workers/outbox.worker';
import { createDeliveryWorker } from '../src/queue/workers/delivery.worker';
import { publishOutboxEvent, enqueueIfNew } from '../src/modules/push-notifications/outbox';
import { closeRedisConnection } from '../src/queue/redis';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs: number, label: string) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await sleep(300);
  }
  console.error(`TIMEOUT waiting for: ${label}`);
  return false;
}

async function main() {
  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
    if (ok) pass++;
    else fail++;
  };

  const user = await prisma.user.findFirst({ where: { deletedAt: null, isActive: true } });
  if (!user) throw new Error('No active user in DB to run smoke test against');
  console.log(`Using test user ${user.id}`);

  const installationId = `smoke-test-device-${Date.now()}`;
  const device = await prisma.deviceInstallation.create({
    data: {
      userId: user.id,
      installationId,
      fcmToken: 'smoke-test-fake-token-not-a-real-fcm-token-000000000000',
      platform: 'android',
      locale: 'en',
    },
  });
  console.log(`Created device installation ${device.id}`);

  const outboxWorker = createOutboxWorker();
  const deliveryWorker = createDeliveryWorker();
  await sleep(500);

  // ── 1. Basic pipeline: outbox -> fan-out -> delivery ─────────────
  const dedupeKey = `smoke_test:${Date.now()}`;
  const result = await publishOutboxEvent({
    eventType: 'EMERGENCY_ALERT',
    entityType: 'smoke_test',
    entityId: 'smoke-1',
    dedupeKey,
    payload: {
      category: 'emergency',
      priority: 'critical',
      title: 'Smoke test alert',
      titleBn: 'স্মোক টেস্ট সতর্কতা',
      body: 'This is an automated smoke test notification.',
      bodyBn: 'এটি একটি স্বয়ংক্রিয় স্মোক টেস্ট বিজ্ঞপ্তি।',
      targetUserIds: [user.id],
      bypassPreferences: true,
    },
  });
  await enqueueIfNew(result);
  console.log(`Published outbox event ${result.id}`);

  const outboxSent = await waitUntil(
    async () => {
      const ev = await prisma.notificationOutboxEvent.findUnique({ where: { id: result.id } });
      return ev?.status === 'sent';
    },
    15000,
    'outbox event reaches status=sent',
  );
  check('1a. outbox worker claims and processes event exactly once (status=sent)', outboxSent);

  const outboxRow = await prisma.notificationOutboxEvent.findUnique({ where: { id: result.id } });
  check('1b. outbox event attempts == 1 (claimed once, not reprocessed)', outboxRow?.attempts === 1);

  const userNotification = await prisma.userNotification.findFirst({
    where: { userId: user.id, dedupeKey },
  });
  check('1c. audience fan-out created a UserNotification row', !!userNotification);

  const delivery = await waitUntil(
    async () => {
      const d = await prisma.notificationDelivery.findFirst({
        where: { userNotificationId: userNotification?.id, deviceId: device.id },
      });
      return !!d && d.status !== 'pending';
    },
    15000,
    'delivery job processes',
  );
  check('1d. delivery job was created and processed', delivery);

  const deliveryRow = await prisma.notificationDelivery.findFirst({
    where: { userNotificationId: userNotification?.id, deviceId: device.id },
  });
  console.log(`   delivery status=${deliveryRow?.status} lastError=${deliveryRow?.lastError}`);
  check(
    '1e. disabled Firebase provider fails safely (no throw, no crash) with FCM_DISABLED',
    deliveryRow?.status === 'failed' && deliveryRow?.lastError === 'FCM_DISABLED',
  );

  // ── 2. Deduplication: re-publish same dedupeKey ───────────────────
  const dupeResult = await publishOutboxEvent({
    eventType: 'EMERGENCY_ALERT',
    entityType: 'smoke_test',
    entityId: 'smoke-1',
    dedupeKey, // same key as before
    payload: {
      category: 'emergency',
      priority: 'critical',
      title: 'Smoke test alert (duplicate attempt)',
      body: 'This should be deduplicated.',
      targetUserIds: [user.id],
      bypassPreferences: true,
    },
  });
  check('2a. re-publishing same dedupeKey is recognized as a duplicate (not a new row)', dupeResult.deduped === true);

  const notificationCountForKey = await prisma.userNotification.count({ where: { userId: user.id, dedupeKey } });
  check('2b. no duplicate UserNotification created for the same (user, dedupeKey)', notificationCountForKey === 1);

  // ── 3. Retry/failure recording on malformed event ─────────────────
  const badEvent = await prisma.notificationOutboxEvent.create({
    data: {
      eventType: 'EMERGENCY_ALERT',
      dedupeKey: `smoke_test_bad:${Date.now()}`,
      payload: { malformed: true } as any, // missing category/title/body -> isOutboxEventPayload() fails
    },
  });
  const { enqueueOutboxEvent } = await import('../src/queue/queues');
  await enqueueOutboxEvent(badEvent.id);

  const badEventFailed = await waitUntil(
    async () => {
      const ev = await prisma.notificationOutboxEvent.findUnique({ where: { id: badEvent.id } });
      return ev?.status === 'failed' && (ev.attempts ?? 0) >= 1;
    },
    15000,
    'malformed event recorded as failed with attempts >= 1',
  );
  check('3a. malformed event fails safely and records status=failed + lastError', badEventFailed);
  const badEventRow = await prisma.notificationOutboxEvent.findUnique({ where: { id: badEvent.id } });
  check('3b. lastError captured for diagnosis', !!badEventRow?.lastError);
  console.log(`   badEvent status=${badEventRow?.status} attempts=${badEventRow?.attempts} lastError=${badEventRow?.lastError}`);

  // ── cleanup ────────────────────────────────────────────────────────
  await prisma.notificationDelivery.deleteMany({ where: { deviceId: device.id } });
  await prisma.userNotification.deleteMany({ where: { userId: user.id, dedupeKey } });
  await prisma.notificationOutboxEvent.deleteMany({ where: { id: { in: [result.id, badEvent.id] } } });
  await prisma.deviceInstallation.delete({ where: { id: device.id } });

  await outboxWorker.close();
  await deliveryWorker.close();
  await closeRedisConnection();
  await prisma.$disconnect();

  console.log(`\n=== SMOKE TEST RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
