import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { notificationSendLimiter } from '../../middlewares/rateLimiter';
import {
  createTemplateSchema, updateTemplateSchema, listTemplatesSchema,
  createCampaignSchema, updateCampaignSchema, listCampaignsSchema,
  scheduleCampaignSchema, testSendSchema,
  createAutomationRuleSchema, updateAutomationRuleSchema,
  listFailedDeliveriesSchema, listAuditSchema,
} from './admin-push-notifications.types';
import * as ctrl from './admin-push-notifications.controller';

const router = Router();

router.use(authenticate);

// Templates
router.get('/templates', authorize('notification_templates', 'read'), validate(listTemplatesSchema, 'query'), ctrl.handleListTemplates);
router.post('/templates', authorize('notification_templates', 'create'), validate(createTemplateSchema), ctrl.handleCreateTemplate);
router.get('/templates/:id', authorize('notification_templates', 'read'), ctrl.handleGetTemplate);
router.patch('/templates/:id', authorize('notification_templates', 'update'), validate(updateTemplateSchema), ctrl.handleUpdateTemplate);
router.delete('/templates/:id', authorize('notification_templates', 'delete'), ctrl.handleDeleteTemplate);

// Campaigns
router.get('/campaigns', authorize('notifications', 'read'), validate(listCampaignsSchema, 'query'), ctrl.handleListCampaigns);
router.post('/campaigns', authorize('notifications', 'create'), validate(createCampaignSchema), ctrl.handleCreateCampaign);
router.get('/campaigns/:id', authorize('notifications', 'read'), ctrl.handleGetCampaign);
router.patch('/campaigns/:id', authorize('notifications', 'update'), validate(updateCampaignSchema), ctrl.handleUpdateCampaign);
router.delete('/campaigns/:id', authorize('notifications', 'delete'), ctrl.handleDeleteCampaign);

router.post('/campaigns/:id/estimate-audience', authorize('notifications', 'read'), ctrl.handleEstimateAudience);
router.post('/campaigns/:id/preview', authorize('notifications', 'read'), ctrl.handlePreviewCampaign);
router.post('/campaigns/:id/test-send', authorize('notifications', 'send'), notificationSendLimiter, validate(testSendSchema), ctrl.handleTestSendCampaign);
router.post('/campaigns/:id/approve', authorize('notifications', 'approve'), ctrl.handleApproveCampaign);
router.post('/campaigns/:id/send-now', authorize('notifications', 'send'), notificationSendLimiter, ctrl.handleSendCampaignNow);
router.post('/campaigns/:id/schedule', authorize('notifications', 'send'), notificationSendLimiter, validate(scheduleCampaignSchema), ctrl.handleScheduleCampaign);
router.post('/campaigns/:id/cancel', authorize('notifications', 'send'), ctrl.handleCancelCampaign);
router.get('/campaigns/:id/analytics', authorize('notifications', 'read'), ctrl.handleCampaignAnalytics);

// Automation rules
router.get('/automation-rules', authorize('notification_automation_rules', 'read'), ctrl.handleListAutomationRules);
router.post('/automation-rules', authorize('notification_automation_rules', 'create'), validate(createAutomationRuleSchema), ctrl.handleCreateAutomationRule);
router.patch('/automation-rules/:id', authorize('notification_automation_rules', 'update'), validate(updateAutomationRuleSchema), ctrl.handleUpdateAutomationRule);
router.delete('/automation-rules/:id', authorize('notification_automation_rules', 'delete'), ctrl.handleDeleteAutomationRule);

// Failed deliveries
router.get('/deliveries/failed', authorize('notifications', 'read'), validate(listFailedDeliveriesSchema, 'query'), ctrl.handleListFailedDeliveries);
router.post('/deliveries/:id/retry', authorize('notifications', 'send'), ctrl.handleRetryDelivery);

// Audit
router.get('/audit', authorize('notifications', 'read'), validate(listAuditSchema, 'query'), ctrl.handleListAudit);

export default router;
