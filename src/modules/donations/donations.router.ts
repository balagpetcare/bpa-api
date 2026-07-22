import { Router } from 'express';
import * as ctrl from './donations.controller';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { authenticate } from '../../middlewares/authenticate';
import { requireRole } from '../../middlewares/authorize';
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

adminRouter.use(authenticate, requireRole('ADMIN'));

// Dashboard & Export
adminRouter.get('/dashboard-stats', ctrl.getDashboardStatsHandler);
adminRouter.get('/export/csv', ctrl.exportDonationsCsvHandler);

// List (root)
adminRouter.get('/', ctrl.listDonationsHandler);

// Purposes
adminRouter.get('/purposes', ctrl.listPurposesHandler);
adminRouter.post('/purposes', ctrl.createPurposeHandler);
adminRouter.patch('/purposes/:id', ctrl.updatePurposeHandler);
adminRouter.delete('/purposes/:id', ctrl.deletePurposeHandler);

// Campaigns
adminRouter.get('/campaigns', ctrl.listCampaignsHandler);
adminRouter.post('/campaigns', ctrl.createCampaignHandler);
adminRouter.patch('/campaigns/:id', ctrl.updateCampaignHandler);
adminRouter.delete('/campaigns/:id', ctrl.deleteCampaignHandler);

// QR Codes
adminRouter.get('/qr-codes', ctrl.listQrCodesHandler);
adminRouter.post('/qr-codes', ctrl.createQrCodeHandler);
adminRouter.patch('/qr-codes/:id', ctrl.updateQrCodeHandler);
adminRouter.delete('/qr-codes/:id', ctrl.deleteQrCodeHandler);
adminRouter.get('/qr-codes/:slug/image', ctrl.generateQrImageHandler);

// Impact Stories
adminRouter.get('/impact-stories', ctrl.listImpactStoriesHandler);
adminRouter.post('/impact-stories', ctrl.createImpactStoryHandler);
adminRouter.patch('/impact-stories/:id', ctrl.updateImpactStoryHandler);
adminRouter.delete('/impact-stories/:id', ctrl.deleteImpactStoryHandler);

// Transparency Reports
adminRouter.get('/transparency-reports', ctrl.listTransparencyReportsHandler);
adminRouter.post('/transparency-reports', ctrl.createTransparencyReportHandler);
adminRouter.patch('/transparency-reports/:id', ctrl.updateTransparencyReportHandler);
adminRouter.delete('/transparency-reports/:id', ctrl.deleteTransparencyReportHandler);

// Settings
adminRouter.get('/page-settings', ctrl.getSettingsHandler);
adminRouter.patch('/page-settings', ctrl.updateSettingsHandler);

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

adminRouter.get('/:id', validateDonationId, ctrl.getDonationDetailHandler);
adminRouter.patch('/:id/status', validateDonationId, ctrl.updateDonationStatusHandler);

export { publicRouter as donationsPublicRouter, adminRouter as donationsAdminRouter };
