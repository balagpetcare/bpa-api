const authorizeCalls: Array<{ resource: string; action: string }> = [];

jest.mock('../clinics.controller', () => ({
  createOrganizationHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  listOrganizationsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  getOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  updateOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  publishOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  archiveOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  restoreOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  deleteOrganizationHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  bulkOrganizationActionHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  createBranchHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  listBranchesHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  getBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  updateBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  publishBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  archiveBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  restoreBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  duplicateBranchHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  deleteBranchHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  bulkBranchActionHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  updateBranchRelatedHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  addBranchImageHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  removeBranchImageHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  reorderBranchImagesHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
}));

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { sub: 'user-1', email: 'admin@example.com', roles: [] };
    next();
  },
}));

jest.mock('../../../middlewares/requireLocalUser', () => ({
  requireLocalUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const requireRoleCalls: string[][] = [];

jest.mock('../../../middlewares/authorize', () => ({
  authorize: (resource: string, action: string) => (_req: unknown, _res: unknown, next: () => void) => {
    authorizeCalls.push({ resource, action });
    next();
  },
  requireRole:
    (...roles: string[]) =>
    (_req: unknown, _res: unknown, next: () => void) => {
      requireRoleCalls.push(roles);
      next();
    },
}));

import request from 'supertest';
import express from 'express';
import clinicsRouter from '../clinics.router';
import * as controller from '../clinics.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/clinics', clinicsRouter);
  app.use(errorHandler);
  return app;
}

const VALID_ORG = {
  name: 'MewMew Pet Care',
  slug: 'mewmew-pet-care',
};

const VALID_BRANCH = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  branchName: 'Banasree Branch',
};

beforeEach(() => {
  authorizeCalls.length = 0;
  jest.clearAllMocks();
});

describe('clinics admin router — organizations', () => {
  it('rejects creating an organization without a name (never reaches the handler)', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/clinics/organizations').send({ slug: 'x' });

    expect(res.status).toBe(400);
    expect(controller.createOrganizationHandler).not.toHaveBeenCalled();
  });

  it('rejects a slug with uppercase/invalid characters', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/organizations')
      .send({ name: 'X', slug: 'Not A Slug!' });

    expect(res.status).toBe(400);
    expect(controller.createOrganizationHandler).not.toHaveBeenCalled();
  });

  it('accepts a valid organization payload and authorizes with create', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/clinics/organizations').send(VALID_ORG);

    expect(res.status).toBe(201);
    expect(controller.createOrganizationHandler).toHaveBeenCalledTimes(1);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_organizations', action: 'create' });
  });

  it('authorizes list with read', async () => {
    await request(buildApp()).get('/api/v1/admin/clinics/organizations');

    expect(authorizeCalls).toContainEqual({ resource: 'clinic_organizations', action: 'read' });
  });

  it('rejects publish without a boolean `published` field', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/admin/clinics/organizations/11111111-1111-4111-8111-111111111111/publish')
      .send({});

    expect(res.status).toBe(400);
    expect(controller.publishOrganizationHandler).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID organization id before reaching the handler', async () => {
    const res = await request(buildApp()).get('/api/v1/admin/clinics/organizations/not-a-uuid');

    expect(res.status).toBe(400);
    expect(controller.getOrganizationHandler).not.toHaveBeenCalled();
  });
});

describe('clinics admin router — branches', () => {
  it('rejects creating a branch without organizationId', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/branches')
      .send({ branchName: 'X' });

    expect(res.status).toBe(400);
    expect(controller.createBranchHandler).not.toHaveBeenCalled();
  });

  it('accepts a valid branch payload and authorizes with create', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/clinics/branches').send(VALID_BRANCH);

    expect(res.status).toBe(201);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_branches', action: 'create' });
  });

  it('rejects an invalid tri-state value on a related-collection update', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111/related')
      .send({ facilities: [{ facilityType: 'LABORATORY', available: 'MAYBE' }] });

    expect(res.status).toBe(400);
    expect(controller.updateBranchRelatedHandler).not.toHaveBeenCalled();
  });

  it('accepts a valid related-collection replace payload', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111/related')
      .send({
        phones: [{ phoneNumber: '01711791249', isPrimary: true }],
        facilities: [{ facilityType: 'LABORATORY', available: 'YES' }],
      });

    expect(res.status).toBe(200);
    expect(controller.updateBranchRelatedHandler).toHaveBeenCalledTimes(1);
  });

  it('permanent delete requires GLOBAL_SUPER_ADMIN role instead of a granular permission', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111')
      .send({ reason: 'duplicate test record, confirmed with data team', confirmationText: 'Banasree Branch' });

    expect(res.status).toBe(200);
    expect(requireRoleCalls).toContainEqual(['GLOBAL_SUPER_ADMIN', 'SUPER_ADMIN', 'super_admin']);
    expect(controller.deleteBranchHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects permanent delete without a reason of at least 10 characters', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111')
      .send({ reason: 'short', confirmationText: 'Banasree Branch' });

    expect(res.status).toBe(400);
    expect(controller.deleteBranchHandler).not.toHaveBeenCalled();
  });

  it('archives a branch via the archive action, gated by the archive permission', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111/archive')
      .send({ reason: 'temporarily closed' });

    expect(res.status).toBe(200);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_branches', action: 'archive' });
    expect(controller.archiveBranchHandler).toHaveBeenCalledTimes(1);
  });

  it('restores an archived branch', async () => {
    const res = await request(buildApp()).patch(
      '/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111/restore',
    );

    expect(res.status).toBe(200);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_branches', action: 'restore' });
  });

  it('accepts a bulk publish action for branches', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/branches/bulk')
      .send({ ids: ['11111111-1111-4111-8111-111111111111'], action: 'publish' });

    expect(res.status).toBe(200);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_branches', action: 'manage' });
  });

  it('rejects a bulk action with an invalid action string', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/branches/bulk')
      .send({ ids: ['11111111-1111-4111-8111-111111111111'], action: 'not-a-real-action' });

    expect(res.status).toBe(400);
    expect(controller.bulkBranchActionHandler).not.toHaveBeenCalled();
  });

  it('duplicates a branch', async () => {
    const res = await request(buildApp()).post(
      '/api/v1/admin/clinics/branches/11111111-1111-4111-8111-111111111111/duplicate',
    );

    expect(res.status).toBe(201);
    expect(controller.duplicateBranchHandler).toHaveBeenCalledTimes(1);
  });
});
