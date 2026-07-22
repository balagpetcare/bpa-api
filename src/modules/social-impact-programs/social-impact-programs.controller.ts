import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './social-impact-programs.service';
import type { CreateSocialImpactProgramDto, UpdateSocialImpactProgramDto, SocialImpactProgramListQuery } from './social-impact-programs.types';

export async function createProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateSocialImpactProgramDto;
    const program = await svc.createProgram(dto);
    auditCreate('social_impact_programs', program.id, { titleEn: dto.titleEn }, auditContextFromRequest(req));
    sendCreated(res, program);
  } catch (err) { next(err); }
}

export async function listProgramsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPrograms(req.query as never as SocialImpactProgramListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getProgram(req.params.id));
  } catch (err) { next(err); }
}

export async function updateProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateSocialImpactProgramDto;
    const updated = await svc.updateProgram(req.params.id, dto);
    auditUpdate('social_impact_programs', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteProgramHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteProgram(req.params.id);
    auditDelete('social_impact_programs', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function listActiveProgramsPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActiveProgramsPublic());
  } catch (err) { next(err); }
}
