// Regression coverage for the "Insufficient role" FORBIDDEN bug on
// /admin/donations/page-settings (BPA Admin > Donations > Page CMS).
//
// Root cause: donations.router.ts gated the entire admin router behind
// `requireRole('ADMIN')` — a hard-coded, exact-string-match role check
// against the literal "ADMIN" (uppercase), which never matches any real
// role value (bpa_api's local admin role is `ROLES.ADMIN = 'admin'`,
// lowercase) and whose super-admin bypass only recognized the local
// "super_admin" spelling, not Central Auth's "SUPER_ADMIN"/
// "GLOBAL_SUPER_ADMIN". The fix replaces it with the same granular
// authorize(resource, action) permission model every other admin module
// uses, against the 'donations' resource already granted to the seeded
// 'admin'/'super_admin' roles.
//
// `authenticate` is mocked to inject `req.user` directly (this module's
// existing router-test convention) so these tests exercise the REAL
// `authorize` middleware and REAL controller/repository against the real
// database — not a mocked permission check.

let currentUser: { sub: string; email?: string; roles: string[] } | null = null;

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, _res: any, next: (err?: unknown) => void) => {
    if (!currentUser) {
      const { AppError } = require('../../../utils/AppError');
      return next(AppError.unauthorized('No token provided'));
    }
    req.user = currentUser;
    next();
  },
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import { donationsAdminRouter } from '../donations.router';
import { errorHandler } from '../../../middlewares/errorHandler';

describe('donations admin router — authorization (regression for the page-cms FORBIDDEN bug)', () => {
  const suffix = Date.now();
  let adminUserId: string;
  let noRoleUserId: string;
  let originalHeroTitle: string | null = null;

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/admin/donations', donationsAdminRouter);
    app.use(errorHandler);
    return app;
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
    const adminUser = await prisma.user.create({
      data: { name: 'Donations Authz Test Admin', email: `donations-authz-admin-${suffix}@example.test`, isActive: true },
    });
    adminUserId = adminUser.id;
    await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRole.id } });

    const noRoleUser = await prisma.user.create({
      data: { name: 'Donations Authz Test No Role', email: `donations-authz-norole-${suffix}@example.test`, isActive: true },
    });
    noRoleUserId = noRoleUser.id;

    const existing = await prisma.donationPageSetting.findFirst({ where: { isActive: true } });
    originalHeroTitle = existing?.heroTitleEn ?? null;
  });

  afterAll(async () => {
    // Restore whatever the settings row had before this suite ran.
    const settings = await prisma.donationPageSetting.findFirst({ where: { isActive: true } });
    if (settings && originalHeroTitle !== null) {
      await prisma.donationPageSetting.update({ where: { id: settings.id }, data: { heroTitleEn: originalHeroTitle } });
    }
    await prisma.userRole.deleteMany({ where: { userId: { in: [adminUserId, noRoleUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, noRoleUserId] } } });
    currentUser = null;
    await prisma.$disconnect();
  });

  afterEach(() => {
    currentUser = null;
  });

  it('unauthenticated request to GET page-settings is rejected with 401', async () => {
    currentUser = null;
    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(401);
  });

  it('an authenticated user with no donations permission is rejected with 403, never "Insufficient role"', async () => {
    currentUser = { sub: noRoleUserId, roles: [] };
    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(403);
    expect(res.body.error?.code ?? res.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('Insufficient role');
  });

  it('a real "admin"-role local user can GET Page CMS settings (200)', async () => {
    currentUser = { sub: adminUserId, roles: [] };
    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('heroTitleEn');
  });

  it('a real "admin"-role local user can UPDATE Page CMS settings (200), and the change persists on reload', async () => {
    currentUser = { sub: adminUserId, roles: [] };
    const app = buildApp();
    const testValue = `Authz regression test ${suffix}`;

    const updateRes = await request(app).patch('/api/v1/admin/donations/page-settings').send({ heroTitleEn: testValue });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.heroTitleEn).toBe(testValue);

    const reloadRes = await request(app).get('/api/v1/admin/donations/page-settings');
    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.data.heroTitleEn).toBe(testValue);
  });

  it('a Central Auth-style super-admin principal (no local user row at all) is accepted — the bypass authorize() already had, now also on requireRole()-adjacent paths', async () => {
    // Central Auth issues "SUPER_ADMIN"/"GLOBAL_SUPER_ADMIN" (uppercase) and
    // these principals never have a row in bpa_api's own `user` table.
    currentUser = { sub: 'central-auth-super-admin-does-not-exist-locally', roles: ['SUPER_ADMIN'] };
    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(200);
  });

  it('GLOBAL_SUPER_ADMIN spelling is also accepted', async () => {
    currentUser = { sub: 'central-auth-global-super-admin-does-not-exist-locally', roles: ['GLOBAL_SUPER_ADMIN'] };
    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(200);
  });

  it('a deactivated/deleted local user with the admin role is still rejected (not found -> 401)', async () => {
    const ghostRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
    const ghostUser = await prisma.user.create({
      data: { name: 'Donations Authz Ghost', email: `donations-authz-ghost-${suffix}@example.test`, isActive: false },
    });
    await prisma.userRole.create({ data: { userId: ghostUser.id, roleId: ghostRole.id } });
    currentUser = { sub: ghostUser.id, roles: [] };

    const res = await request(buildApp()).get('/api/v1/admin/donations/page-settings');
    expect(res.status).toBe(401);

    await prisma.userRole.deleteMany({ where: { userId: ghostUser.id } });
    await prisma.user.delete({ where: { id: ghostUser.id } });
  });
});
