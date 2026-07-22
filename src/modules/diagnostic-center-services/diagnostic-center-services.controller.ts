import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './diagnostic-center-services.service';
import type { CreateDiagnosticCenterServiceDto, UpdateDiagnosticCenterServiceDto, DiagnosticCenterServiceListQuery } from './diagnostic-center-services.types';

export async function createDiagnosticServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateDiagnosticCenterServiceDto;
    const service = await svc.createDiagnosticService(dto);
    auditCreate('diagnostic_center_services', service.id, { titleEn: dto.titleEn }, auditContextFromRequest(req));
    sendCreated(res, service);
  } catch (err) { next(err); }
}

export async function listDiagnosticServicesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listDiagnosticServices(req.query as never as DiagnosticCenterServiceListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDiagnosticServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getDiagnosticService(req.params.id));
  } catch (err) { next(err); }
}

export async function updateDiagnosticServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateDiagnosticCenterServiceDto;
    const updated = await svc.updateDiagnosticService(req.params.id, dto);
    auditUpdate('diagnostic_center_services', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteDiagnosticServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteDiagnosticService(req.params.id);
    auditDelete('diagnostic_center_services', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function listActiveDiagnosticServicesPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActiveDiagnosticServicesPublic());
  } catch (err) { next(err); }
}
