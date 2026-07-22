import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './partner-clinics.service';
import type { CreatePartnerClinicDto, UpdatePartnerClinicDto, PartnerClinicListQuery } from './partner-clinics.types';

export async function createPartnerClinicHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreatePartnerClinicDto;
    const clinic = await svc.createPartnerClinic(dto, req.user!.sub);
    await auditCreate('partner_clinic', clinic.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, clinic);
  } catch (err) { next(err); }
}

export async function listPartnerClinicsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPartnerClinics(req.query as never as PartnerClinicListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPartnerClinicHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPartnerClinic(req.params.id));
  } catch (err) { next(err); }
}

export async function updatePartnerClinicHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdatePartnerClinicDto;
    const updated = await svc.updatePartnerClinic(req.params.id, dto, req.user!.sub);
    await auditUpdate('partner_clinic', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deactivatePartnerClinicHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinic = await svc.getPartnerClinic(req.params.id);
    await svc.deactivatePartnerClinic(req.params.id, req.user!.sub);
    await auditDelete('partner_clinic', req.params.id, { name: clinic.name }, auditContextFromRequest(req));
    sendSuccess(res, { message: 'Partner clinic deactivated' });
  } catch (err) { next(err); }
}

export async function reorderPartnerClinicsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items } = req.body as { items: Array<{ id: string; sortOrder: number }> };
    await svc.reorderPartnerClinics(items);
    sendSuccess(res, { message: 'Reordered' });
  } catch (err) { next(err); }
}
