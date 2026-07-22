import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './sms-logs.service';

export async function listSmsLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listSmsLogs(req.query as never)); } catch (e) { next(e); }
}

export async function getSmsLogHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getSmsLog(req.params.id)); } catch (e) { next(e); }
}

export async function resendSmsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = (req as any).user?.id ?? 'unknown';
    sendSuccess(res, await svc.resendSms(req.params.id, adminUserId, req.body));
  } catch (e) { next(e); }
}

export async function retryFailedSmsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = (req as any).user?.id ?? 'unknown';  // eslint-disable-line @typescript-eslint/no-explicit-any
    sendSuccess(res, await svc.retryFailed(req.body, adminUserId));
  } catch (e) { next(e); }
}

export async function getSmsStatsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getStats()); } catch (e) { next(e); }
}
