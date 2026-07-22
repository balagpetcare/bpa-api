import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './donations.service';
import * as repo from './donations.repository';
import { AppError } from '../../utils/AppError';
import { createImpactStorySchema, updateImpactStorySchema } from './donations.validation';

// ─── Public Handlers ─────────────────────────────────────────────

export async function getDonationPageDataHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getDonationPageData();
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getActivePurposesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.listPurposes({ isActive: true });
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getActiveCampaignsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.listCampaigns({ status: 'ACTIVE' });
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getCampaignDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.findCampaignBySlug(req.params.slug);
    if (!data) { res.status(404).json({ success: false, message: 'Campaign not found' }); return; }
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getPublishedImpactStoriesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.listImpactStories({ status: 'PUBLISHED' });
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getImpactStoryDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const stories = await repo.listImpactStories({ status: 'PUBLISHED' });
    const data = stories.find(s => s.slug === req.params.slug);
    if (!data) { res.status(404).json({ success: false, message: 'Story not found' }); return; }
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

const EPS_ERROR_CODES = new Set(['EPS_UNAVAILABLE', 'EPS_CONFIG_MISSING', 'EPS_NOT_ENABLED']);

export async function initializeDonationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.initializeDonation({
      ...req.body,
      userId: req.user?.sub,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendCreated(res, result);
  } catch (err) {
    if (err instanceof AppError && EPS_ERROR_CODES.has(err.code)) {
      const donationReferenceNo =
        Array.isArray(err.details) &&
        typeof err.details[0] === 'object' &&
        err.details[0] !== null &&
        'donationReferenceNo' in err.details[0]
          ? String((err.details[0] as { donationReferenceNo: string }).donationReferenceNo)
          : undefined;

      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
        ...(donationReferenceNo ? { donationReferenceNo } : {}),
      });
      return;
    }
    next(err);
  }
}

export async function getDonationStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await svc.getDonationStatus(req.params.referenceNo);
    sendSuccess(res, status);
  } catch (err) { next(err); }
}

export async function getDonationReceiptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getReceiptData(req.params.referenceNo);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getDonationReceiptPdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // ?lang=bn or ?lang=en overrides stored donor country for testing/admin use
    const langParam = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    const buffer = await svc.generateReceiptPdf(req.params.referenceNo, langParam);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=donation-receipt-${req.params.referenceNo}.pdf`);
    res.send(buffer);
  } catch (err) { next(err); }
}

export async function qrRedirectHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const url = await svc.handleQrRedirect(req.params.slug);
    res.redirect(302, url);
  } catch (err) { next(err); }
}

// ─── Admin Handlers ──────────────────────────────────────────────

export async function getDashboardStatsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await repo.getDashboardStats());
  } catch (err) { next(err); }
}

export async function listDonationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await repo.listDonationsAdmin({
      page, limit,
      status: req.query.status as string,
      search: req.query.search as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDonationDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.findDonationById(req.params.id);
    if (!data) { res.status(404).json({ success: false, message: 'Donation not found' }); return; }
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function updateDonationStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.updateDonationStatus(req.params.id, req.body.status);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function exportDonationsCsvHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await svc.exportDonationsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=donations_export.csv');
    res.send(csv);
  } catch (err) { next(err); }
}

// Admin: Purposes
export async function listPurposesHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listPurposes()); } catch (err) { next(err); }
}
export async function createPurposeHandler(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await repo.createPurpose(req.body)); } catch (err) { next(err); }
}
export async function updatePurposeHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.updatePurpose(req.params.id, req.body)); } catch (err) { next(err); }
}
export async function deletePurposeHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deletePurpose(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// Admin: Campaigns
export async function listCampaignsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listCampaigns()); } catch (err) { next(err); }
}
export async function createCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await repo.createCampaign(req.body)); } catch (err) { next(err); }
}
export async function updateCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.updateCampaign(req.params.id, req.body)); } catch (err) { next(err); }
}
export async function deleteCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteCampaign(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// Admin: QR Codes
export async function listQrCodesHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listQrCodes()); } catch (err) { next(err); }
}
export async function createQrCodeHandler(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await repo.createQrCode(req.body)); } catch (err) { next(err); }
}
export async function updateQrCodeHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.updateQrCode(req.params.id, req.body)); } catch (err) { next(err); }
}
export async function deleteQrCodeHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteQrCode(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}
export async function generateQrImageHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const qr = await repo.findQrCodeBySlug(req.params.slug);
    if (!qr) { res.status(404).json({ success: false, message: 'QR not found' }); return; }
    const b64 = await svc.generateQrImage(qr.targetUrl);
    res.json({ success: true, data: { image: b64 } });
  } catch (err) { next(err); }
}

// Admin: Impact Stories
export async function listImpactStoriesHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listImpactStories()); } catch (err) { next(err); }
}
export async function createImpactStoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createImpactStorySchema.parse(req.body);
    sendCreated(res, await repo.createImpactStory(parsed as any));
  } catch (err) { next(err); }
}
export async function updateImpactStoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateImpactStorySchema.parse(req.body);
    sendSuccess(res, await repo.updateImpactStory(req.params.id, parsed as any));
  } catch (err) { next(err); }
}
export async function deleteImpactStoryHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteImpactStory(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// Admin: Transparency Reports
export async function listTransparencyReportsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listTransparencyReports()); } catch (err) { next(err); }
}
export async function createTransparencyReportHandler(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await repo.createTransparencyReport(req.body)); } catch (err) { next(err); }
}
export async function updateTransparencyReportHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.updateTransparencyReport(req.params.id, req.body)); } catch (err) { next(err); }
}
export async function deleteTransparencyReportHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteTransparencyReport(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// Admin: Settings
export async function getSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.getDonationPageSettings()); } catch (err) { next(err); }
}
export async function updateSettingsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await repo.getDonationPageSettings();
    sendSuccess(res, await repo.updateDonationPageSettings(settings.id, req.body));
  } catch (err) { next(err); }
}
