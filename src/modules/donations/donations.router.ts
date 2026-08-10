import { Router } from 'express';
import * as ctrl from './donations.controller';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { isValidUuid } from '../../utils/uuid';
import { validate } from '../../middlewares/validate';
import { initiateDonationSchema } from './donations.validation';

const publicRouter = Router();
const adminRouter = Router();

// ─── Public Routes ───────────────────────────────────────────────

publicRouter.get('/settings', ctrl.getDonationPageDataHandler);
publicRouter.get('/page-data', ctrl.getDonationPageDataHandler);
publicRouter.get('/purposes', ctrl.getActivePurposesHandler);
publicRouter.get('/campaigns', ctrl.getActiveCampaignsHandler);
publicRouter.get('/campaigns/:slug', ctrl.getCampaignDetailHandler);
publicRouter.post('/initiate', authenticateOptional, validate(initiateDonationSchema), ctrl.initializeDonationHandler);
publicRouter.get('/status/:referenceNo', ctrl.getDonationStatusHandler);
publicRouter.get('/receipt/:referenceNo', ctrl.getDonationReceiptHandler);
publicRouter.get('/receipt/:referenceNo/pdf', ctrl.getDonationReceiptPdfHandler);
publicRouter.get('/qr/:slug/redirect', ctrl.qrRedirectHandler);

publicRouter.get('/impact-stories', ctrl.getPublishedImpactStoriesHandler);
publicRouter.get('/impact-stories/:slug', ctrl.getImpactStoryDetailHandler);

// ─── Admin Routes ────────────────────────────────────────────────
// IMPORTANT: Static admin routes must be registered BEFORE dynamic /:id routes
// to prevent Express from matching literal path segments like "campaigns" as an id.

// Authentication is required for every admin route; authorization is then
// checked per-route against the actual granular resource:action permission
// model (the same authorize() middleware every other actively-maintained
// admin module uses — spay-neuter, campaigns, clinics, etc.) rather than a
// hard-coded role name. The previous `requireRole('ADMIN')` gate checked
// the literal string "ADMIN", which never matches any real role value —
// bpa_api's local admin role is `ROLES.ADMIN = 'admin'` (lowercase) — so
// this route was unreachable for every actor except one holding the
// literal local `super_admin` role; Central Auth-issued super-admin
// principals (SUPER_ADMIN/GLOBAL_SUPER_ADMIN) and any real 'admin'-role
// user were both incorrectly rejected with "Insufficient role".
adminRouter.use(authenticate);

// Dashboard & Export
adminRouter.get('/dashboard-stats', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.getDashboardStatsHandler);
adminRouter.get('/export/csv', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.exportDonationsCsvHandler);

// List (root)
adminRouter.get('/', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.listDonationsHandler);

// Purposes
adminRouter.get('/purposes', authorize(RESOURCES.DONATION_PURPOSES, ACTIONS.READ), ctrl.listPurposesHandler);
adminRouter.post('/purposes', authorize(RESOURCES.DONATION_PURPOSES, ACTIONS.CREATE), ctrl.createPurposeHandler);
adminRouter.patch('/purposes/:id', authorize(RESOURCES.DONATION_PURPOSES, ACTIONS.UPDATE), ctrl.updatePurposeHandler);
adminRouter.delete('/purposes/:id', authorize(RESOURCES.DONATION_PURPOSES, ACTIONS.DELETE), ctrl.deletePurposeHandler);

// Campaigns
adminRouter.get('/campaigns', authorize(RESOURCES.DONATION_CAMPAIGNS, ACTIONS.READ), ctrl.listCampaignsHandler);
adminRouter.post('/campaigns', authorize(RESOURCES.DONATION_CAMPAIGNS, ACTIONS.CREATE), ctrl.createCampaignHandler);
adminRouter.patch('/campaigns/:id', authorize(RESOURCES.DONATION_CAMPAIGNS, ACTIONS.UPDATE), ctrl.updateCampaignHandler);
adminRouter.delete('/campaigns/:id', authorize(RESOURCES.DONATION_CAMPAIGNS, ACTIONS.DELETE), ctrl.deleteCampaignHandler);

// QR Codes — part of the donations page/module as a whole; no dedicated
// resource is seeded for these, same as Impact Stories and Page Settings
// below, so they share the general 'donations' resource.
adminRouter.get('/qr-codes', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.listQrCodesHandler);
adminRouter.post('/qr-codes', authorize(RESOURCES.DONATIONS, ACTIONS.CREATE), ctrl.createQrCodeHandler);
adminRouter.patch('/qr-codes/:id', authorize(RESOURCES.DONATIONS, ACTIONS.UPDATE), ctrl.updateQrCodeHandler);
adminRouter.delete('/qr-codes/:id', authorize(RESOURCES.DONATIONS, ACTIONS.DELETE), ctrl.deleteQrCodeHandler);
adminRouter.get('/qr-codes/:slug/image', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.generateQrImageHandler);

// Impact Stories
adminRouter.get('/impact-stories', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.listImpactStoriesHandler);
adminRouter.post('/impact-stories', authorize(RESOURCES.DONATIONS, ACTIONS.CREATE), ctrl.createImpactStoryHandler);
adminRouter.patch('/impact-stories/:id', authorize(RESOURCES.DONATIONS, ACTIONS.UPDATE), ctrl.updateImpactStoryHandler);
adminRouter.delete('/impact-stories/:id', authorize(RESOURCES.DONATIONS, ACTIONS.DELETE), ctrl.deleteImpactStoryHandler);

// Transparency Reports — reuses the existing platform-wide
// RESOURCES.TRANSPARENCY_REPORTS resource (already seeded and granted to
// admin/super_admin) rather than introducing a donations-specific
// duplicate of the same concept.
adminRouter.get('/transparency-reports', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.READ), ctrl.listTransparencyReportsHandler);
adminRouter.post('/transparency-reports', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.CREATE), ctrl.createTransparencyReportHandler);
adminRouter.patch('/transparency-reports/:id', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.UPDATE), ctrl.updateTransparencyReportHandler);
adminRouter.delete('/transparency-reports/:id', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.DELETE), ctrl.deleteTransparencyReportHandler);

// Settings (Donation Page CMS) — the endpoint originally reported as
// FORBIDDEN. READ and UPDATE deliberately use the same 'donations'
// resource other read/write pairs above use, so this can never end up
// with GET working but Save returning 403.
adminRouter.get('/page-settings', authorize(RESOURCES.DONATIONS, ACTIONS.READ), ctrl.getSettingsHandler);
adminRouter.patch('/page-settings', authorize(RESOURCES.DONATIONS, ACTIONS.UPDATE), ctrl.updateSettingsHandler);

// ─── Dynamic Routes (must be last — after all static paths) ────

// UUID validation middleware for donation id routes
function validateDonationId(req: any, res: any, next: any) {
  if (!isValidUuid(req.params.id)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_DONATION_ID',
        message: `Invalid donation id format: "${req.params.id}" is not a valid UUID`,
      },
    });
  }
  next();
}

adminRouter.get('/:id', authorize(RESOURCES.DONATIONS, ACTIONS.READ), validateDonationId, ctrl.getDonationDetailHandler);
adminRouter.patch('/:id/status', authorize(RESOURCES.DONATIONS, ACTIONS.UPDATE), validateDonationId, ctrl.updateDonationStatusHandler);

export { publicRouter as donationsPublicRouter, adminRouter as donationsAdminRouter };
