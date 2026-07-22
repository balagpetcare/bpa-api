import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import * as ctrl from './campaign-certificates.controller';
import {
  IssueCertificateSchema,
  CertificateListQuerySchema,
} from './campaign-certificates.types';

const adminRouter = Router();
const publicRouter = Router();

// ─── Admin routes ─────────────────────────────────────────────────

adminRouter.use(authenticate);

adminRouter.post(
  '/certificates/issue',
  authorize('campaign_certificates', 'issue'),
  validate(IssueCertificateSchema, 'body'),
  ctrl.issueCertificate,
);

adminRouter.patch(
  '/pet-bookings/:petBookingId/certificates/reissue',
  authorize('campaign_certificates', 'issue'),
  ctrl.reissueCertificate,
);

adminRouter.get(
  '/pet-bookings/:petBookingId/certificate',
  authorize('campaign_certificates', 'read'),
  ctrl.getCertificateByPetBooking,
);

adminRouter.get(
  '/certificates',
  authorize('campaign_certificates', 'read'),
  validate(CertificateListQuerySchema, 'query'),
  ctrl.listCertificates,
);

adminRouter.get(
  '/certificates/:certNumber/verify',
  authorize('campaign_certificates', 'read'),
  ctrl.verifyByCertNumber,
);

// ─── Public routes (no auth) ──────────────────────────────────────

publicRouter.get('/verify-certificate/:verifyToken', publicReadLimiter, ctrl.verifyByToken);
publicRouter.get('/certificate-html/:verifyToken', publicReadLimiter, ctrl.getCertificateHtml);
publicRouter.get('/certificate-pdf/:verifyToken', publicReadLimiter, ctrl.getCertificatePdf);

export { adminRouter as campaignCertificatesAdminRouter, publicRouter as campaignCertificatesPublicRouter };
