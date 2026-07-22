import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './analytics.service';
import { logActivityEvent } from '../../utils/activity-logger';

const WHITELISTED_EVENTS = new Set([
  'PAGE_VIEW',
  'FORM_STARTED',
  'FORM_SUBMITTED',
  'MEMBERSHIP_PAGE_VIEWED',
  'MEMBERSHIP_PURCHASE_STARTED',
  'DONATION_STARTED',
  'CAMPAIGN_REGISTER_STARTED',
  'PET_CENSUS_STARTED',
  'CONTACT_FORM_SUBMITTED'
]);

export async function summaryHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getAnalyticsSummary();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function formsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getAnalyticsForms(req.query.period as string | undefined);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function overviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsOverview(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function trafficHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: (req.query.range || req.query.period) as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsTraffic(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function revenueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsRevenue(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function membershipHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsMembership(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function campaignsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsCampaigns(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function donationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsDonations(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function petCensusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsPetCensus(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function supportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsSupport(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function conversionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      range: req.query.range as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const data = await svc.getAnalyticsConversions(filters);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function liveHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getAnalyticsLive();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function publicEventTrackerHandler(req: Request, res: Response, _next: NextFunction): Promise<void> {
  try {
    const { type, module: modName, action, title, path, referrer, device, sessionId, visitorId, metadata } = req.body;
    
    if (!type || !modName || !action || !title) {
      res.status(400).json({ success: false, message: 'Missing required tracking fields.' });
      return;
    }

    if (!WHITELISTED_EVENTS.has(type)) {
      res.status(400).json({ success: false, message: 'Invalid or non-whitelisted event type.' });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;
    const userAgent = req.headers['user-agent']?.slice(0, 500);

    logActivityEvent({
      type,
      module: modName,
      action,
      title,
      userId: req.user?.sub,
      sessionId: sessionId?.slice(0, 100),
      visitorId: visitorId?.slice(0, 100),
      ipAddress,
      userAgent,
      path: path?.slice(0, 2000),
      referrer: referrer?.slice(0, 2000),
      device: device?.slice(0, 50),
      metadata
    }).catch(err => console.error('[PublicTracker] Logging failed:', err));

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[PublicTracker] Exception swallowed:', err);
    res.status(201).json({ success: true });
  }
}
