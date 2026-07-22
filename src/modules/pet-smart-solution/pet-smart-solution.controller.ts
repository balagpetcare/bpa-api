import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { auditContextFromRequest, auditUpdate } from '../../utils/audit';
import * as svc from './pet-smart-solution.service';
import type { SyncLogListQuery, UpdateSettingsDto } from './pet-smart-solution.types';

export async function getSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listSettings());
  } catch (err) {
    next(err);
  }
}

export async function updateSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateSettingsDto;
    const updated = await svc.updateSettings(dto);
    await auditUpdate(
      'pet_smart_solution',
      'integration_settings',
      {},
      {
        ...dto,
        ...(dto.apiKey !== undefined ? { apiKey: dto.apiKey ? '[REDACTED]' : null } : {}),
      },
      auditContextFromRequest(req),
    );
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function testConnectionHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.testConnection());
  } catch (err) {
    next(err);
  }
}

export async function listSyncLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listSyncLogs(req.query as never as SyncLogListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getSyncLogHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getSyncLog(req.params.id));
  } catch (err) {
    next(err);
  }
}
