import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './contribution-plans.service';
import type { CreateContributionPlanDto, UpdateContributionPlanDto } from './contribution-plans.types';

export async function createPlanHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateContributionPlanDto;
    const plan = await svc.createPlan(dto);
    auditCreate('contribution_plans', plan.id, { title: dto.title }, auditContextFromRequest(req));
    sendCreated(res, plan);
  } catch (err) { next(err); }
}

export async function listPlansHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listPlans());
  } catch (err) { next(err); }
}

export async function getPlanHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPlan(req.params.id));
  } catch (err) { next(err); }
}

export async function updatePlanHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateContributionPlanDto;
    const updated = await svc.updatePlan(req.params.id, dto);
    auditUpdate('contribution_plans', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deletePlanHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deletePlan(req.params.id);
    auditDelete('contribution_plans', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function listActivePlansPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActivePlansPublic());
  } catch (err) { next(err); }
}
