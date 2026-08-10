import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './bpa-programs.service';
import type { CreateBpaProgramDto, UpdateBpaProgramDto, BpaProgramListQuery } from './bpa-programs.types';

export async function createBpaProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateBpaProgramDto;
    const item = await svc.createBpaProgram(dto);
    auditCreate('bpa_programs', item.id, { key: dto.key }, auditContextFromRequest(req));
    sendCreated(res, item);
  } catch (err) { next(err); }
}

export async function listBpaProgramsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listBpaPrograms(req.query as never as BpaProgramListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getBpaProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getBpaProgram(req.params.id));
  } catch (err) { next(err); }
}

export async function updateBpaProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateBpaProgramDto;
    const updated = await svc.updateBpaProgram(req.params.id, dto);
    auditUpdate('bpa_programs', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteBpaProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteBpaProgram(req.params.id);
    auditDelete('bpa_programs', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}
