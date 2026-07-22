import { Request, Response, NextFunction } from 'express';
import * as svc from './campaign-field-ops.service';
import { HTTP_STATUS } from '../../config/constants';

export async function qrVerifyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.verifyQR(req.params.campaignId, req.body, req.user.sub, req.ip, req.headers['user-agent']);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function checkInHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.checkIn(req.params.campaignId, req.body, req.user.sub, req.ip);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function vaccinationCompleteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.vaccinationComplete(req.params.campaignId, req.body, req.user.sub, req.ip);
    res.status(HTTP_STATUS.CREATED).json({ data });
  } catch (err) { next(err); }
}

export async function issueCertificateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.issueCertificate(req.params.campaignId, req.body, req.user.sub, req.ip);
    res.status(HTTP_STATUS.CREATED).json({ data });
  } catch (err) { next(err); }
}

export async function resendCertificateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.resendCertificate(req.params.campaignId, req.body.petBookingId, req.user.sub, req.ip);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function scanLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listScanLogs(req.params.campaignId, req.query as any);
    res.json({ data: result.items, meta: result.meta });
  } catch (err) { next(err); }
}

export async function operationalStatsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getCampaignOperationalStats(req.params.campaignId, req.query.sessionId as string | undefined);
    res.json({ data });
  } catch (err) { next(err); }
}
