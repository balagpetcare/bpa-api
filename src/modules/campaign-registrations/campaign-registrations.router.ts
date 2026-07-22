import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { publicFormLimiter, publicReadLimiter } from '../../middlewares/rateLimiter';
import * as ctrl from './campaign-registrations.controller';
import {
  registerCampaignSchema,
  joinWaitlistSchema,
  registrationListQuerySchema,
  waitlistListQuerySchema,
} from './campaign-registrations.types';

const publicRouter = Router();
const adminRouter = Router();

// ─── Public routes ────────────────────────────────────────────────
publicRouter.post('/register', publicFormLimiter, validate(registerCampaignSchema, 'body'), ctrl.register);
publicRouter.post('/waitlist', publicFormLimiter, validate(joinWaitlistSchema, 'body'), ctrl.joinWaitlist);
publicRouter.get('/booking/:bookingNumber', publicReadLimiter, ctrl.getByBookingNumber);
publicRouter.get('/booking/:bookingNumber/slip.pdf', publicReadLimiter, ctrl.getBookingSlipPdf);

// ─── Admin routes ─────────────────────────────────────────────────
adminRouter.use(authenticate);
adminRouter.get(
  '/',
  authorize('campaign_registrations', 'read'),
  validate(registrationListQuerySchema, 'query'),
  ctrl.listRegistrations,
);
adminRouter.get(
  '/:id',
  authorize('campaign_registrations', 'read'),
  ctrl.getRegistration,
);
adminRouter.get(
  '/waitlist/list',
  authorize('campaign_registrations', 'read'),
  validate(waitlistListQuerySchema, 'query'),
  ctrl.listWaitlist,
);
adminRouter.delete(
  '/waitlist/:id',
  authorize('campaign_registrations', 'delete'),
  ctrl.cancelWaitlist,
);
adminRouter.post(
  '/:id/confirm-payment',
  authorize('campaign_registrations', 'update'),
  ctrl.confirmManualPayment,
);
adminRouter.delete(
  '/:id',
  authorize('campaign_registrations', 'delete'),
  ctrl.cancelRegistration,
);

export { publicRouter as campaignRegistrationsPublicRouter, adminRouter as campaignRegistrationsAdminRouter };
