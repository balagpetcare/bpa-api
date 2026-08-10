import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './app-showcases.service';
import type { CreateAppShowcaseDto, UpdateAppShowcaseDto, AppShowcaseListQuery } from './app-showcases.types';

export async function createAppShowcaseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateAppShowcaseDto;
    const item = await svc.createAppShowcase(dto);
    auditCreate('app_showcases', item.id, { appKey: dto.appKey }, auditContextFromRequest(req));
    sendCreated(res, item);
  } catch (err) { next(err); }
}

export async function listAppShowcasesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listAppShowcases(req.query as never as AppShowcaseListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getAppShowcaseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getAppShowcase(req.params.id));
  } catch (err) { next(err); }
}

export async function updateAppShowcaseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateAppShowcaseDto;
    const updated = await svc.updateAppShowcase(req.params.id, dto);
    auditUpdate('app_showcases', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteAppShowcaseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteAppShowcase(req.params.id);
    auditDelete('app_showcases', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}
