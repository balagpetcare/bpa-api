import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './care-partner-benefits.service';
import type { CreateCarePartnerBenefitDto, UpdateCarePartnerBenefitDto, CarePartnerBenefitListQuery } from './care-partner-benefits.types';

export async function createBenefitHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCarePartnerBenefitDto;
    const benefit = await svc.createBenefit(dto);
    auditCreate('care_partner_benefits', benefit.id, { titleEn: dto.titleEn }, auditContextFromRequest(req));
    sendCreated(res, benefit);
  } catch (err) { next(err); }
}

export async function listBenefitsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listBenefits(req.query as never as CarePartnerBenefitListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getBenefitHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getBenefit(req.params.id));
  } catch (err) { next(err); }
}

export async function updateBenefitHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateCarePartnerBenefitDto;
    const updated = await svc.updateBenefit(req.params.id, dto);
    auditUpdate('care_partner_benefits', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteBenefitHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteBenefit(req.params.id);
    auditDelete('care_partner_benefits', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function listActiveBenefitsPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActiveBenefitsPublic());
  } catch (err) { next(err); }
}
