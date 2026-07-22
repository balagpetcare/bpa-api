import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './vaccine-catalog.service';
import type {
  CreateVaccineCatalogDto, UpdateVaccineCatalogDto, VaccineCatalogListQuery,
  CreateCertificateTemplateDto, UpdateCertificateTemplateDto,
} from './vaccine-catalog.types';

// ─── Vaccines ────────────────────────────────────────────────────

export async function createVaccineHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateVaccineCatalogDto;
    const vaccine = await svc.createVaccine(dto);
    await auditCreate('vaccine_catalog', vaccine.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, vaccine);
  } catch (err) { next(err); }
}

export async function listVaccinesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listVaccines(req.query as never as VaccineCatalogListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getVaccineHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getVaccine(req.params.id));
  } catch (err) { next(err); }
}

export async function updateVaccineHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateVaccineCatalogDto;
    const updated = await svc.updateVaccine(req.params.id, dto);
    await auditUpdate('vaccine_catalog', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteVaccineHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const vaccine = await svc.getVaccine(req.params.id);
    await svc.deleteVaccine(req.params.id);
    await auditDelete('vaccine_catalog', req.params.id, { name: vaccine.name }, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Certificate Templates ────────────────────────────────────────

export async function createTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCertificateTemplateDto;
    const template = await svc.createTemplate(dto);
    await auditCreate('certificate_template', template.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, template);
  } catch (err) { next(err); }
}

export async function listTemplatesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listTemplates());
  } catch (err) { next(err); }
}

export async function getTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getTemplate(req.params.id));
  } catch (err) { next(err); }
}

export async function updateTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateCertificateTemplateDto;
    const updated = await svc.updateTemplate(req.params.id, dto);
    await auditUpdate('certificate_template', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}
