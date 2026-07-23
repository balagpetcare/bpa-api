const authorizeCalls: Array<{ resource: string; action: string }> = [];

jest.mock('../admin-push-notifications.controller', () => ({
  handleListTemplates: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  handleGetTemplate: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleCreateTemplate: jest.fn((_req, res) => res.status(201).json({ success: true, data: {} })),
  handleUpdateTemplate: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleDeleteTemplate: jest.fn((_req, res) => res.status(204).end()),
  handleListCampaigns: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  handleGetCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleCreateCampaign: jest.fn((_req, res) => res.status(201).json({ success: true, data: {} })),
  handleUpdateCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleDeleteCampaign: jest.fn((_req, res) => res.status(204).end()),
  handleEstimateAudience: jest.fn((_req, res) => res.status(200).json({ success: true, data: { estimatedReach: 0 } })),
  handlePreviewCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleTestSendCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: { sent: true } })),
  handleApproveCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleSendCampaignNow: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleScheduleCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleCancelCampaign: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleCampaignAnalytics: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleListAutomationRules: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  handleCreateAutomationRule: jest.fn((_req, res) => res.status(201).json({ success: true, data: {} })),
  handleUpdateAutomationRule: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleDeleteAutomationRule: jest.fn((_req, res) => res.status(204).end()),
  handleListFailedDeliveries: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  handleRetryDelivery: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  handleListAudit: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
}));

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    if (req.headers['x-test-auth'] === 'none') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.user = { sub: 'admin-1', email: 'admin@example.com', roles: ['admin'] };
    next();
  },
}));

jest.mock('../../../middlewares/authorize', () => ({
  authorize: (resource: string, action: string) => (req: any, res: any, next: () => void) => {
    authorizeCalls.push({ resource, action });
    if (req.headers['x-test-authz'] === 'deny') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  },
  getUserPermissions: jest.fn(async () => []),
  hasPermission: jest.fn(() => false),
}));

jest.mock('../../../middlewares/rateLimiter', () => ({
  notificationSendLimiter: (_req: any, _res: any, next: () => void) => next(),
}));

import request from 'supertest';
import express from 'express';
import router from '../admin-push-notifications.router';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/push-notifications', router);
  app.use(errorHandler);
  return app;
}

describe('Admin push-notifications router — RBAC gating', () => {
  beforeEach(() => {
    authorizeCalls.length = 0;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/admin/push-notifications/campaigns')
      .set('x-test-auth', 'none');
    expect(res.status).toBe(401);
  });

  it('rejects requests without the required permission with 403', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/admin/push-notifications/campaigns')
      .set('x-test-authz', 'deny');
    expect(res.status).toBe(403);
  });

  it('gates GET /campaigns behind notifications:read', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/admin/push-notifications/campaigns');
    expect(authorizeCalls).toContainEqual({ resource: 'notifications', action: 'read' });
  });

  it('gates POST /campaigns/:id/send-now behind notifications:send', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/admin/push-notifications/campaigns/abc/send-now');
    expect(authorizeCalls).toContainEqual({ resource: 'notifications', action: 'send' });
  });

  it('gates POST /campaigns/:id/approve behind notifications:approve', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/admin/push-notifications/campaigns/abc/approve');
    expect(authorizeCalls).toContainEqual({ resource: 'notifications', action: 'approve' });
  });

  it('gates template mutations behind notification_templates:*', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/admin/push-notifications/templates').send({});
    await request(app).delete('/api/v1/admin/push-notifications/templates/abc');
    expect(authorizeCalls).toContainEqual({ resource: 'notification_templates', action: 'create' });
    expect(authorizeCalls).toContainEqual({ resource: 'notification_templates', action: 'delete' });
  });

  it('gates automation rule mutations behind notification_automation_rules:*', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/admin/push-notifications/automation-rules').send({});
    expect(authorizeCalls).toContainEqual({ resource: 'notification_automation_rules', action: 'create' });
  });

  it('gates failed-delivery retry behind notifications:send', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/admin/push-notifications/deliveries/abc/retry');
    expect(authorizeCalls).toContainEqual({ resource: 'notifications', action: 'send' });
  });
});
