import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import { AppError } from '../../utils/AppError';
import * as svc from './media.service';

/**
 * @openapi
 * /api/v1/admin/media:
 *   get:
 *     tags: [Media Library]
 *     summary: List media files
 *     security: [bearerAuth: []]
 */
export async function listMediaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, meta } = await svc.listMedia(req.query as never);
    sendSuccess(res, data, 200, meta);
  } catch (e) { next(e); }
}

export async function getMediaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getMediaById(req.params.id)); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/media/upload:
 *   post:
 *     tags: [Media Library]
 *     summary: Upload a single file
 *     security: [bearerAuth: []]
 */
export async function uploadFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw AppError.badRequest('No file uploaded');
    const userId = req.user.sub;
    sendCreated(res, await svc.uploadFile(req.file, userId, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}

export async function updateMediaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.updateMedia(req.params.id, req.body, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}

export async function deleteMediaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteMedia(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

export async function cropMediaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    sendCreated(res, await svc.cropMedia(req.params.id, req.body, userId, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}
