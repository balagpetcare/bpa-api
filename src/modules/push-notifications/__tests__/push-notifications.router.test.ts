import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import { errorHandler } from '../../../middlewares/errorHandler';

// Regression coverage for the real device-reported defect: BPA User App's
// only real sign-in path is WPA Central Auth SSO, whose JWT `sub` is
// Central Auth's own id format (not a UUID). push-notifications.router.ts
// never applied `requireLocalUser` (unlike clinics.router.ts /
// membership-campaign.router.ts, which already establish this pattern), so
// every handler filtered/wrote a `@db.Uuid` column
// (UserNotification.userId, NotificationPreference.userId,
// DeviceInstallation.userId) using the raw Central Auth sub directly,
// throwing Prisma P2023 ("Inconsistent column data: Error creating UUID")
// -> errorHandler.ts's generic VALIDATION_ERROR / "Invalid data format in
// request" -- on EVERY real device, for BOTH the inbox and preferences
// screens. `authenticate` is mocked here (JWT verification isn't what's
// under test) but `requireLocalUser` runs for REAL against the real DB, so
// this proves the exact fix, not just that the schema layer is fine.

// Unique per test process run (not a fixed literal) so a prior interrupted
// run's leftover User row — same centralAuthUserId AND same unique email —
// can never collide with this run's provisioning and mask a real result
// behind an unrelated P2002/409.
const RUN_ID = Date.now();
const INITIAL_SUB = `cm3x8f2k10000abc123def456-${RUN_ID}`; // Central Auth id shape: not a UUID
const SECOND_SUB = `cm_other_device_user_222222-${RUN_ID}`;
let CURRENT_SUB = INITIAL_SUB;
const CURRENT_EMAIL = () => `device-user-${RUN_ID}-${CURRENT_SUB}@example.com`;

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = { sub: CURRENT_SUB, email: CURRENT_EMAIL(), roles: ['USER'] };
    next();
  },
}));

import router from '../push-notifications.router';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/notifications', router);
  app.use(errorHandler);
  return app;
}

describe('push-notifications router — real Central Auth sub resolution (requireLocalUser, not mocked)', () => {
  const provisionedUserIds: string[] = [];

  afterAll(async () => {
    // Clean up any local user rows requireLocalUser auto-provisioned for
    // the synthetic Central Auth subs used in this suite.
    if (provisionedUserIds.length) {
      await prisma.userNotification.deleteMany({ where: { userId: { in: provisionedUserIds } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: provisionedUserIds } } });
      await prisma.deviceInstallation.deleteMany({ where: { userId: { in: provisionedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: provisionedUserIds } } });
    }
  });

  async function captureProvisionedUser(sub: string) {
    const user = await prisma.user.findFirst({ where: { centralAuthUserId: sub } });
    if (user && !provisionedUserIds.includes(user.id)) provisionedUserIds.push(user.id);
    return user;
  }

  it('GET /inbox with no query succeeds (200) for a real device Central Auth user, not VALIDATION_ERROR', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false }),
    );
    await captureProvisionedUser(CURRENT_SUB);
  });

  it('GET /preferences for a brand-new device (no local user yet) returns safe default preferences (200), without provisioning a user or a row on a mere read', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/preferences');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pushEnabled).toBe(true);
    expect(res.body.data.inAppEnabled).toBe(true);

    // requireLocalUser deliberately never provisions a user for a plain GET
    // (see its own doc comment) — confirm that correct behavior explicitly,
    // rather than a Preferences read silently side-effecting user creation.
    const user = await prisma.user.findFirst({ where: { centralAuthUserId: CURRENT_SUB } });
    expect(user).toBeNull();
  });

  it('once the device has been provisioned via a real write (device registration), GET /preferences finds/creates that user\'s real row, and repeated GETs never duplicate it', async () => {
    const app = buildApp();
    const registerRes = await request(app)
      .post('/api/v1/notifications/devices')
      .send({ installationId: `test-install-${Date.now()}`, platform: 'android', locale: 'en', timezone: 'Asia/Dhaka' });
    expect(registerRes.status).toBe(201);

    const user = await captureProvisionedUser(CURRENT_SUB);
    expect(user).not.toBeNull();

    await request(app).get('/api/v1/notifications/preferences');
    await request(app).get('/api/v1/notifications/preferences');

    const users = await prisma.user.findMany({ where: { centralAuthUserId: CURRENT_SUB } });
    expect(users.length).toBe(1);
    const prefs = await prisma.notificationPreference.findMany({ where: { userId: users[0].id } });
    expect(prefs.length).toBe(1);
  });

  it('GET /inbox/unread-count succeeds for a real device user', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it('PATCH /inbox/mark-all-read succeeds for a real device user (static route, not swallowed by /inbox/:id/read)', async () => {
    const app = buildApp();
    const res = await request(app).patch('/api/v1/notifications/inbox/mark-all-read');
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);
  });

  it('two different Central Auth subs are resolved to two distinct local users (cross-user isolation)', async () => {
    const app = buildApp();
    CURRENT_SUB = SECOND_SUB;
    const registerRes = await request(app)
      .post('/api/v1/notifications/devices')
      .send({ installationId: `test-install-2-${Date.now()}`, platform: 'android', locale: 'en', timezone: 'Asia/Dhaka' });
    expect(registerRes.status).toBe(201);

    const otherUser = await captureProvisionedUser(CURRENT_SUB);
    expect(otherUser).not.toBeNull();

    const firstUser = await prisma.user.findFirst({ where: { centralAuthUserId: INITIAL_SUB } });
    expect(firstUser).not.toBeNull();
    expect(firstUser!.id).not.toBe(otherUser!.id);
  });
});
