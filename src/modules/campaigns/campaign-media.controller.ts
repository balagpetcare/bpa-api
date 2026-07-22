import { Request, Response, NextFunction } from 'express';
import { CampaignMediaRole } from '@prisma/client';
import { z } from 'zod';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../database/prisma';
import * as repo from './campaign-media.repository';
import { uploadToStorage } from '../../storage/storage.service';
import {
  performDeferredStorageCleanup,
  removeCampaignMediaReference,
} from '../media/media-delete.service';
import { auditContextFromRequest } from '../../utils/audit';

const roleSchema = z.enum(['hero', 'thumbnail', 'mobile_banner', 'gallery']);
const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

async function assertCampaignExists(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) throw AppError.notFound('Campaign');
}

// GET /admin/campaigns/:id/media
export async function listHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);
    const items = await repo.listCampaignMedia(req.params.id);
    sendSuccess(res, items);
  } catch (err) { next(err); }
}

// POST /admin/campaigns/:id/media/upload  (multipart, field: file, body: role, altText?)
export async function uploadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);

    if (!req.file) throw AppError.badRequest('No file uploaded');
    const roleParse = roleSchema.safeParse(req.body.role);
    if (!roleParse.success) {
      throw AppError.badRequest('Invalid role. Must be: hero | thumbnail | mobile_banner | gallery');
    }

    const { objectKey, url } = await uploadToStorage(req.file);

    const mediaFile = await prisma.mediaFile.create({
      data: {
        filename: objectKey,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: BigInt(req.file.size),
        url,
        altText: req.body.altText ?? null,
        uploadedById: req.user!.sub,
      },
    });

    const role = roleParse.data as CampaignMediaRole;
    const cm = await repo.createCampaignMedia(
      req.params.id,
      mediaFile.id,
      role,
      req.body.altText ?? undefined,
    );

    sendCreated(res, cm);
  } catch (err) { next(err); }
}

// POST /admin/campaigns/:id/media/attach (body: { mediaFileId, role, altText? })
export async function attachHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);

    const bodySchema = z.object({
      mediaFileId: z.string().uuid(),
      role: roleSchema,
      altText: z.string().optional(),
    });

    const parse = bodySchema.safeParse(req.body);
    if (!parse.success) throw AppError.badRequest(parse.error.message);

    const { mediaFileId, role, altText } = parse.data;

    // Validate media file exists
    const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaFileId } });
    if (!mediaFile) throw AppError.notFound('Media file');

    const cm = await repo.createCampaignMedia(
      req.params.id,
      mediaFileId,
      role as CampaignMediaRole,
      altText,
    );

    sendCreated(res, cm);
  } catch (err) { next(err); }
}

// PATCH /admin/campaigns/:id/media/:mediaId
export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cm = await repo.getCampaignMediaById(req.params.mediaId);
    if (!cm || cm.campaignId !== req.params.id) throw AppError.notFound('Campaign media');

    const updated = await repo.updateCampaignMedia(req.params.mediaId, {
      mediaFileId: req.body.mediaFileId,
      altText: req.body.altText !== undefined ? req.body.altText : undefined,
      sortOrder: req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined,
    });
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

// DELETE /admin/campaigns/:id/media/:mediaId
export async function deleteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cm = await repo.getCampaignMediaById(req.params.mediaId);
    if (!cm || cm.campaignId !== req.params.id) throw AppError.notFound('Campaign media');
    const result = await prisma.$transaction((tx) =>
      removeCampaignMediaReference(tx, req.params.mediaId),
    );
    await performDeferredStorageCleanup(result.storageCleanup, auditContextFromRequest(req));

    sendNoContent(res);
  } catch (err) { next(err); }
}

// PATCH /admin/campaigns/:id/media/reorder
export async function reorderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);
    const parse = reorderSchema.safeParse(req.body);
    if (!parse.success) throw AppError.badRequest('Body must be { ids: string[] }');
    const items = await repo.reorderGallery(req.params.id, parse.data.ids);
    sendSuccess(res, items);
  } catch (err) { next(err); }
}
