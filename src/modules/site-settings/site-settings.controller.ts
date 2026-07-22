import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import * as svc from './site-settings.service';
import type { UpdateSiteSettingsDto } from './site-settings.types';

export async function getPublicSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await svc.getPublicSettings();
    sendSuccess(res, settings);
  } catch (err) { next(err); }
}

export async function getAdminSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await svc.getSettings();
    sendSuccess(res, settings);
  } catch (err) { next(err); }
}

export async function updateSettingsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await svc.updateSettings(req.body as UpdateSiteSettingsDto);
    sendSuccess(res, settings);
  } catch (err) { next(err); }
}
