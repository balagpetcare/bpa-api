import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  listParticipantsHandler,
  getPaymentSummaryHandler,
  exportCsvHandler,
  exportExcelHandler,
  bulkSmsPreviewHandler,
  bulkSmsSendHandler,
  bulkSmsHistoryHandler,
} from './participants.controller';
import { participantsListQuerySchema, bulkSmsSchema, bulkSmsPreviewSchema } from './participants.types';

const router = Router();

// All routes require authentication + campaign read permission
router.use(authenticate);
router.use(authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ));

// List participants with filters
router.get('/:campaignId/participants', validate(participantsListQuerySchema, 'query'), listParticipantsHandler);

// Payment summary
router.get('/:campaignId/participants/payment-summary', getPaymentSummaryHandler);

// Export CSV
router.get('/:campaignId/participants/export.csv', validate(participantsListQuerySchema, 'query'), exportCsvHandler);

// Export Excel
router.get('/:campaignId/participants/export.xlsx', validate(participantsListQuerySchema, 'query'), exportExcelHandler);

// Bulk SMS — preview
router.post('/:campaignId/participants/bulk-sms/preview', validate(bulkSmsPreviewSchema), bulkSmsPreviewHandler);

// Bulk SMS — send (requires update permission)
router.post('/:campaignId/participants/bulk-sms/send', authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), validate(bulkSmsSchema), bulkSmsSendHandler);

// Bulk SMS history
router.get('/:campaignId/participants/bulk-sms/history', bulkSmsHistoryHandler);

export { router as campaignParticipantsRouter };
