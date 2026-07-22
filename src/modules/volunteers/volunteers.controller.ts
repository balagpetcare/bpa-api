import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate } from '../../utils/audit';
import * as svc from './volunteers.service';
import type { CreateVolunteerDto, UpdateVolunteerStatusDto, VolunteerListQuery } from './volunteers.types';

export async function submitVolunteerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateVolunteerDto;
    const volunteer = await svc.submitVolunteer(dto);
    const ctx = auditContextFromRequest(req);
    await auditCreate('volunteer', volunteer.id, { email: dto.email, name: dto.name }, ctx);
    sendCreated(res, volunteer);
  } catch (err) {
    next(err);
  }
}

export async function listVolunteersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listVolunteers(req.query as never as VolunteerListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getVolunteerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const volunteer = await svc.getVolunteer(req.params.id);
    sendSuccess(res, volunteer);
  } catch (err) {
    next(err);
  }
}

export async function updateVolunteerStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as UpdateVolunteerStatusDto;
    const volunteer = await svc.updateVolunteerStatus(req.params.id, status, req.user?.sub);
    sendSuccess(res, volunteer);
  } catch (err) {
    next(err);
  }
}
