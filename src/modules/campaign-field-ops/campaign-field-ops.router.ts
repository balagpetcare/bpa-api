import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { requireCampaignAccess, requireCampaignDuty } from '../../middlewares/campaignAccess';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  qrVerifySchema, checkInSchema, vaccinationCompleteSchema,
  issueCertificateSchema, resendCertificateSchema, scanLogsQuerySchema,
} from './campaign-field-ops.types';
import {
  qrVerifyHandler, checkInHandler, vaccinationCompleteHandler,
  issueCertificateHandler, resendCertificateHandler,
  scanLogsHandler, operationalStatsHandler,
} from './campaign-field-ops.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);

/**
 * POST /api/v1/admin/campaigns/:campaignId/qr/verify
 * Allowed: admin, super_admin, campaign_manager (QR_SCAN duty), campaign_volunteer (QR_SCAN duty)
 */
router.post(
  '/qr/verify',
  validateUuid('campaignId'),
  requireCampaignAccess(),
  validate(qrVerifySchema),
  qrVerifyHandler,
);

/**
 * POST /api/v1/admin/campaigns/:campaignId/check-in
 * Allowed: admin, super_admin, campaign_manager, campaign_volunteer (CHECK_IN or QR_SCAN duty)
 */
router.post(
  '/check-in',
  validateUuid('campaignId'),
  requireCampaignDuty('CHECK_IN', 'QR_SCAN', 'SESSION_MANAGER', 'GENERAL_VOLUNTEER'),
  validate(checkInSchema),
  checkInHandler,
);

/**
 * POST /api/v1/admin/campaigns/:campaignId/vaccinations/complete
 * Allowed: admin, super_admin, campaign_manager, campaign_volunteer (VACCINATION_DESK duty)
 */
router.post(
  '/vaccinations/complete',
  validateUuid('campaignId'),
  requireCampaignDuty('VACCINATION_DESK', 'SESSION_MANAGER'),
  validate(vaccinationCompleteSchema),
  vaccinationCompleteHandler,
);

/**
 * POST /api/v1/admin/campaigns/:campaignId/certificates/issue
 * Allowed: admin, super_admin, campaign_manager, campaign_volunteer (CERTIFICATE_DESK duty)
 */
router.post(
  '/certificates/issue',
  validateUuid('campaignId'),
  requireCampaignDuty('CERTIFICATE_DESK', 'SESSION_MANAGER'),
  validate(issueCertificateSchema),
  issueCertificateHandler,
);

/**
 * POST /api/v1/admin/campaigns/:campaignId/certificates/resend
 * Allowed: admin, super_admin, campaign_manager, campaign_volunteer (CERTIFICATE_DESK duty)
 */
router.post(
  '/certificates/resend',
  validateUuid('campaignId'),
  requireCampaignDuty('CERTIFICATE_DESK', 'SESSION_MANAGER'),
  validate(resendCertificateSchema),
  resendCertificateHandler,
);

/**
 * GET /api/v1/admin/campaigns/:campaignId/scan-logs
 * Allowed: admin, super_admin, campaign_manager
 */
router.get(
  '/scan-logs',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_SCAN_LOGS, ACTIONS.READ),
  validate(scanLogsQuerySchema, 'query'),
  scanLogsHandler,
);

/**
 * GET /api/v1/admin/campaigns/:campaignId/operational-stats
 * Allowed: admin, super_admin, campaign_manager
 */
router.get(
  '/operational-stats',
  validateUuid('campaignId'),
  requireCampaignAccess(),
  operationalStatsHandler,
);

export default router;
