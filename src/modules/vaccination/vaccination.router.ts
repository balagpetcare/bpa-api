import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import * as ctrl from './vaccination.controller';
import {
  checkInSchema,
  markVaccinatedSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
} from './vaccination.types';

const adminRouter = Router();
const publicRouter = Router();

// ─── Admin Vaccination Operations (Requires Auth) ───────────────────
adminRouter.use(authenticate);

adminRouter.get(
  '/scan/:token',
  authorize('campaign_checkin', 'read'),
  ctrl.scanTokenHandler
);

adminRouter.post(
  '/check-in',
  authorize('campaign_checkin', 'checkin'),
  validate(checkInSchema),
  ctrl.checkInHandler
);

adminRouter.post(
  '/mark-vaccinated',
  authorize('campaign_checkin', 'checkin'),
  validate(markVaccinatedSchema),
  ctrl.markVaccinatedHandler
);

adminRouter.post(
  '/issue-certificate',
  authorize('campaign_certificates', 'issue'),
  validate(issueCertificateSchema),
  ctrl.issueCertificateHandler
);

adminRouter.post(
  '/revoke-certificate',
  authorize('campaign_certificates', 'issue'),
  validate(revokeCertificateSchema),
  ctrl.revokeCertificateHandler
);

// ─── Public Verification Route (No Auth) ─────────────────────────────
publicRouter.get(
  '/:token',
  publicReadLimiter,
  ctrl.verifyCertificatePubliclyHandler
);

export { adminRouter as vaccinationAdminRouter, publicRouter as certificateVerifyPublicRouter };
