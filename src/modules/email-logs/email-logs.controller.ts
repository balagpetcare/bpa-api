import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './email-logs.service';

export async function listEmailLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listEmailLogs(req.query as never)); } catch (e) { next(e); }
}

export async function getEmailLogHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getEmailLog(req.params.id)); } catch (e) { next(e); }
}
