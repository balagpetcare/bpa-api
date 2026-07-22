import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { getCampaignBySlug } from '../../modules/campaigns/campaigns.repository';
import * as svc from '../../modules/campaign-faqs/campaign-faqs.service';
import {
  createCampaignFaqSchema, updateCampaignFaqSchema, reorderCampaignFaqsSchema,
} from './campaign-faqs.types';
import {
  listFaqsHandler, getFaqHandler, createFaqHandler,
  updateFaqHandler, deleteFaqHandler, reorderFaqsHandler,
} from './campaign-faqs.controller';

const adminRouter = Router();

// All admin routes require authentication
adminRouter.use(authenticate);

// GET /api/v1/admin/campaigns/:campaignId/faqs
adminRouter.get(
  '/:campaignId/faqs',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.READ),
  listFaqsHandler,
);

// POST /api/v1/admin/campaigns/:campaignId/faqs
adminRouter.post(
  '/:campaignId/faqs',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.CREATE),
  validate(createCampaignFaqSchema),
  createFaqHandler,
);

// PATCH /api/v1/admin/campaigns/:campaignId/faqs/reorder
adminRouter.patch(
  '/:campaignId/faqs/reorder',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.UPDATE),
  validate(reorderCampaignFaqsSchema),
  reorderFaqsHandler,
);

// GET /api/v1/admin/campaigns/:campaignId/faqs/:faqId
adminRouter.get(
  '/:campaignId/faqs/:faqId',
  validateUuid('campaignId', 'faqId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.READ),
  getFaqHandler,
);

// PATCH /api/v1/admin/campaigns/:campaignId/faqs/:faqId
adminRouter.patch(
  '/:campaignId/faqs/:faqId',
  validateUuid('campaignId', 'faqId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.UPDATE),
  validate(updateCampaignFaqSchema),
  updateFaqHandler,
);

// DELETE /api/v1/admin/campaigns/:campaignId/faqs/:faqId
adminRouter.delete(
  '/:campaignId/faqs/:faqId',
  validateUuid('campaignId', 'faqId'),
  authorize(RESOURCES.CAMPAIGN_FAQS, ACTIONS.DELETE),
  deleteFaqHandler,
);

// ─── Public Router ──────────────────────────────────────────────

const publicRouter = Router();

// GET /api/v1/public/campaigns/:slug/faqs
publicRouter.get(
  '/:slug/faqs',
  publicReadLimiter,
  async (req, res, next) => {
    try {
      const campaign = await getCampaignBySlug(req.params.slug);
      if (!campaign) throw AppError.notFound('Campaign not found');
      const faqs = await svc.listActiveFaqs(campaign.id);
      sendSuccess(res, faqs);
    } catch (err) { next(err); }
  },
);

export { adminRouter, publicRouter };
