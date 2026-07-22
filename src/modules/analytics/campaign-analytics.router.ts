import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './campaign-analytics.service';

const router = Router();
router.use(authenticate);

// ─── Global dashboard ─────────────────────────────────────────────

router.get('/global', authorize('campaign_analytics', 'read'), async (_req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getGlobalCampaignAnalytics()); } catch (err) { next(err); }
});

// ─── Per-campaign endpoints ───────────────────────────────────────

router.get('/:campaignId/summary', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignAnalyticsSummary(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/by-session', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignAnalyticsBySession(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/by-location', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignAnalyticsByLocation(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/by-doctor', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignAnalyticsByDoctor(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/by-volunteer', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignAnalyticsByVolunteer(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/vaccination-kpis', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignVaccinationKpis(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/sms-kpis', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignSmsKpis(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/revenue', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignRevenueKpis(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/registrations-over-time', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await svc.getCampaignRegistrationsOverTime(req.params.campaignId)); } catch (err) { next(err); }
});

router.get('/:campaignId/qr-scan-logs', authorize('campaign_analytics', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 30;
    sendSuccess(res, await svc.getQrScanLogs({ campaignId: req.params.campaignId, page, limit }));
  } catch (err) { next(err); }
});

export default router;
