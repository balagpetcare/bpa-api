import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditUpdate } from '../../utils/audit';
import * as svc from './care-contributions.service';
import type { InitiateContributionDto, UpdateContributionDto, ContributionListQuery } from './care-contributions.types';

// ─── Admin ───────────────────────────────────────────────────────

export async function listContributionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listContributions(req.query as never as ContributionListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getContributionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getContribution(req.params.id));
  } catch (err) { next(err); }
}

export async function updateContributionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateContributionDto;
    const updated = await svc.updateContribution(req.params.id, dto);
    auditUpdate('care_contributions', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function initiateContributionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as InitiateContributionDto;
    const result = await svc.initiateContribution(dto);
    sendCreated(res, result);
  } catch (err) { next(err); }
}

export async function getContributionStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getContributionStatus(req.params.id));
  } catch (err) { next(err); }
}

export async function getContributionStatusByNumberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getContributionStatusByNumber(req.params.contributionNumber));
  } catch (err) { next(err); }
}
