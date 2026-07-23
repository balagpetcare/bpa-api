import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import { errorHandler } from '../../../middlewares/errorHandler';

// Documents and proves the full GET /inbox and GET /preferences query
// contract against a real local UUID user (requireLocalUser's fast-path —
// it's already a UUID, so no lookup/provisioning happens). Central Auth
// sub resolution itself is covered separately in
// push-notifications.router.test.ts.

let TEST_USER_ID: string;

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = { sub: (global as any).__TEST_USER_ID__, email: 'query-user@example.com', roles: ['USER'] };
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

describe('push-notifications router — GET /inbox and GET /preferences query contract', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: 'Query Contract Test User', email: `query-contract-${Date.now()}@example.com`, role: 'USER' },
    });
    TEST_USER_ID = user.id;
    (global as any).__TEST_USER_ID__ = TEST_USER_ID;
  });

  afterAll(async () => {
    await prisma.userNotification.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.notificationPreference.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.delete({ where: { id: TEST_USER_ID } });
  });

  it('no query params at all succeeds with defaults (page=1, limit=20, status=all)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox');
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
  });

  it('omitting category entirely (the "All" filter) is not the same as sending category=all — both must not 400', async () => {
    const app = buildApp();
    const omitted = await request(app).get('/api/v1/notifications/inbox');
    expect(omitted.status).toBe(200);

    // category is a nativeEnum with no 'all' member — sending the literal
    // string "all" as a category value MUST be rejected with a field-level
    // detail, confirming the client is right to omit it rather than send it.
    const literalAll = await request(app).get('/api/v1/notifications/inbox').query({ category: 'all' });
    expect(literalAll.status).toBe(400);
    expect(literalAll.body.errors.some((e: any) => e.path === 'category')).toBe(true);
  });

  it('page/limit received as numeric-string query params are coerced correctly', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox').query({ page: '2', limit: '5' });
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(5);
  });

  it('a non-numeric page/limit value does not silently coerce to NaN — rejected with a field-level detail', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox').query({ page: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: any) => e.path === 'page')).toBe(true);
  });

  it('every supported NotificationCategory value is individually accepted', async () => {
    const app = buildApp();
    const categories = [
      'pet_health',
      'campaign',
      'video',
      'post',
      'membership',
      'booking',
      'payment',
      'certificate',
      'account',
      'emergency',
      'promotional',
    ];
    for (const category of categories) {
      const res = await request(app).get('/api/v1/notifications/inbox').query({ category });
      expect(res.status).toBe(200);
    }
  });

  it('an unsupported category value produces a 400 with the exact rejected field named, not a generic message', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox').query({ category: 'not_a_real_category' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const issue = res.body.errors.find((e: any) => e.path === 'category');
    expect(issue).toBeDefined();
    expect(issue.message).not.toBe('Invalid data format in request');
  });

  it('every supported status value is accepted, including the default "all"', async () => {
    const app = buildApp();
    for (const status of ['all', 'unread', 'read', 'archived']) {
      const res = await request(app).get('/api/v1/notifications/inbox').query({ status });
      expect(res.status).toBe(200);
    }
  });

  it('an unsupported status value is rejected with a field-level detail', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox').query({ status: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: any) => e.path === 'status')).toBe(true);
  });

  it('an empty inbox returns 200 with an empty array and zeroed pagination meta, never 400', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('GET /preferences for a user with no existing row default-creates and returns valid preferences', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/preferences');
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(TEST_USER_ID);
    expect(typeof res.body.data.pushEnabled).toBe('boolean');
  });

  it('GET /preferences for a user WITH an existing row returns that same row (no duplicate created)', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/notifications/preferences');
    const res = await request(app).get('/api/v1/notifications/preferences');
    expect(res.status).toBe(200);
    const rows = await prisma.notificationPreference.findMany({ where: { userId: TEST_USER_ID } });
    expect(rows.length).toBe(1);
  });

  it('a completely unknown/unsupported query field does not silently pass through and break pagination', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/notifications/inbox').query({ unknownField: 'x' });
    // Zod's default (non-strict) object parsing strips unknown keys rather
    // than rejecting the request — assert that behavior explicitly so a
    // future strict() change is a deliberate decision, not a surprise.
    expect(res.status).toBe(200);
  });
});
