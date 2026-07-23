import { prisma } from '../../../database/prisma';
import { publishOutboxEvent } from '../outbox';
import * as service from '../push-notifications.service';
import { closeRedisConnection } from '../../../queue/redis';

// Integration tests against the real dev database (same pattern as
// campaign-discovery.test.ts) — creates throwaway users/devices/notifications
// and cleans them up afterward. Does not touch the Redis-backed queue
// (covered separately by scripts/smoke-test-notifications.ts); these tests
// exercise the DB-level dedup constraint and the service-layer ownership
// checks directly.

describe('Push notifications — dedup, ownership, pagination, unread counts', () => {
  let userA: { id: string };
  let userB: { id: string };
  const createdUserIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdOutboxEventIds: string[] = [];

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { name: 'Test User A', email: `notif-test-a-${Date.now()}@example.com`, role: 'USER' },
    });
    userB = await prisma.user.create({
      data: { name: 'Test User B', email: `notif-test-b-${Date.now()}@example.com`, role: 'USER' },
    });
    createdUserIds.push(userA.id, userB.id);
  });

  afterAll(async () => {
    await prisma.userNotification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notificationOutboxEvent.deleteMany({ where: { id: { in: createdOutboxEventIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await closeRedisConnection();
  });

  it('dedupeKey is unique per (user, dedupeKey) — a second insert with the same key is rejected', async () => {
    const dedupeKey = `test_dedupe:${Date.now()}`;
    const first = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'First',
        body: 'First body',
        dedupeKey,
      },
    });
    createdNotificationIds.push(first.id);

    await expect(
      prisma.userNotification.create({
        data: {
          userId: userA.id,
          category: 'campaign',
          priority: 'normal',
          title: 'Duplicate attempt',
          body: 'Should not be created',
          dedupeKey,
        },
      }),
    ).rejects.toThrow();

    const count = await prisma.userNotification.count({ where: { userId: userA.id, dedupeKey } });
    expect(count).toBe(1);
  });

  it('the same dedupeKey IS allowed across two different users (per-user uniqueness, not global)', async () => {
    const dedupeKey = `test_dedupe_multiuser:${Date.now()}`;
    const a = await prisma.userNotification.create({
      data: { userId: userA.id, category: 'campaign', priority: 'normal', title: 'A', body: 'A', dedupeKey },
    });
    const b = await prisma.userNotification.create({
      data: { userId: userB.id, category: 'campaign', priority: 'normal', title: 'B', body: 'B', dedupeKey },
    });
    createdNotificationIds.push(a.id, b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('publishOutboxEvent recognizes a re-published identical dedupeKey as a duplicate', async () => {
    const dedupeKey = `test_outbox_dedupe:${Date.now()}`;
    const first = await publishOutboxEvent({
      eventType: 'EMERGENCY_ALERT',
      dedupeKey,
      payload: { category: 'emergency', title: 'T', body: 'B', targetUserIds: [userA.id] },
    });
    createdOutboxEventIds.push(first.id);
    expect(first.deduped).toBe(false);

    const second = await publishOutboxEvent({
      eventType: 'EMERGENCY_ALERT',
      dedupeKey,
      payload: { category: 'emergency', title: 'T2', body: 'B2', targetUserIds: [userA.id] },
    });
    expect(second.deduped).toBe(true);
    expect(second.id).toBe(first.id);

    const count = await prisma.notificationOutboxEvent.count({ where: { dedupeKey } });
    expect(count).toBe(1);
  });

  it('markRead enforces ownership — user B cannot mark user A\'s notification as read', async () => {
    const notification = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'Owned by A',
        body: 'Body',
        dedupeKey: `test_ownership:${Date.now()}`,
      },
    });
    createdNotificationIds.push(notification.id);

    await expect(service.markRead(userB.id, notification.id)).rejects.toThrow();

    // The owner can mark it read.
    const result = await service.markRead(userA.id, notification.id);
    expect(result.status).toBe('read');
  });

  it('archiveNotification enforces ownership the same way', async () => {
    const notification = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'Owned by A 2',
        body: 'Body',
        dedupeKey: `test_ownership_archive:${Date.now()}`,
      },
    });
    createdNotificationIds.push(notification.id);

    await expect(service.archiveNotification(userB.id, notification.id)).rejects.toThrow();
  });

  it('getUnreadCount only counts the requesting user\'s unread notifications', async () => {
    const before = await service.getUnreadCount(userA.id);

    const n1 = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'Unread 1',
        body: 'Body',
        dedupeKey: `test_unread_1:${Date.now()}`,
      },
    });
    const n2 = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'Unread 2',
        body: 'Body',
        dedupeKey: `test_unread_2:${Date.now()}`,
      },
    });
    // Noise for a different user — must not affect userA's count.
    const nOther = await prisma.userNotification.create({
      data: {
        userId: userB.id,
        category: 'campaign',
        priority: 'normal',
        title: 'Unread B',
        body: 'Body',
        dedupeKey: `test_unread_b:${Date.now()}`,
      },
    });
    createdNotificationIds.push(n1.id, n2.id, nOther.id);

    const after = await service.getUnreadCount(userA.id);
    expect(after.count).toBe(before.count + 2);
  });

  it('markAllRead only affects the requesting user\'s rows', async () => {
    const n1 = await prisma.userNotification.create({
      data: {
        userId: userA.id,
        category: 'campaign',
        priority: 'normal',
        title: 'MarkAll 1',
        body: 'Body',
        dedupeKey: `test_markall_1:${Date.now()}`,
      },
    });
    const nOther = await prisma.userNotification.create({
      data: {
        userId: userB.id,
        category: 'campaign',
        priority: 'normal',
        title: 'MarkAll B',
        body: 'Body',
        dedupeKey: `test_markall_b:${Date.now()}`,
      },
    });
    createdNotificationIds.push(n1.id, nOther.id);

    await service.markAllRead(userA.id);

    const refreshedA = await prisma.userNotification.findUnique({ where: { id: n1.id } });
    const refreshedB = await prisma.userNotification.findUnique({ where: { id: nOther.id } });
    expect(refreshedA?.status).toBe('read');
    expect(refreshedB?.status).toBe('unread'); // untouched — cross-user isolation
  });

  it('getInbox paginates and returns accurate meta', async () => {
    const dedupePrefix = `test_pagination:${Date.now()}`;
    const created = await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        prisma.userNotification.create({
          data: {
            userId: userA.id,
            category: 'campaign',
            priority: 'normal',
            title: `Page item ${i}`,
            body: 'Body',
            dedupeKey: `${dedupePrefix}:${i}`,
          },
        }),
      ),
    );
    createdNotificationIds.push(...created.map((c) => c.id));

    const page1 = await service.getInbox(userA.id, { page: 1, limit: 2, status: 'all' } as any);
    expect(page1.items.length).toBe(2);
    expect(page1.meta.hasNext).toBe(true);
    expect(page1.meta.page).toBe(1);
  });
});
