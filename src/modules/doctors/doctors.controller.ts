import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './doctors.service';
import type { CreateDoctorDto, UpdateDoctorDto, DoctorListQuery } from './doctors.types';

export async function createDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateDoctorDto;
    const doctor = await svc.createDoctor(dto);
    await auditCreate('doctor', doctor.id, { name: dto.name, licenseNumber: dto.licenseNumber }, auditContextFromRequest(req));
    sendCreated(res, doctor);
  } catch (err) { next(err); }
}

export async function listDoctorsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listDoctors(req.query as never as DoctorListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getDoctor(req.params.id));
  } catch (err) { next(err); }
}

export async function updateDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateDoctorDto;
    const updated = await svc.updateDoctor(req.params.id, dto);
    await auditUpdate('doctor', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deactivateDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctor = await svc.getDoctor(req.params.id);
    await svc.deactivateDoctor(req.params.id);
    await auditDelete('doctor', req.params.id, { name: doctor.name }, auditContextFromRequest(req));
    sendSuccess(res, { message: 'Doctor deactivated' });
  } catch (err) { next(err); }
}
