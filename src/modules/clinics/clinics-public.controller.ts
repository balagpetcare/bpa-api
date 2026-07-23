import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as service from './clinics-public.service';
import type { PublicClinicListQuery } from './clinics-public.types';

function setPublicClinicCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
}

export async function listPublicClinicsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setPublicClinicCacheHeaders(res);
    const result = await service.listPublicClinics(req.query as never as PublicClinicListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPublicClinicBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setPublicClinicCacheHeaders(res);
    const clinic = await service.getPublicClinicBySlug(req.params.slug);
    sendSuccess(res, clinic);
  } catch (err) { next(err); }
}

export async function getPublicClinicFiltersHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setPublicClinicCacheHeaders(res);
    sendSuccess(res, await service.getPublicClinicFilters());
  } catch (err) { next(err); }
}
