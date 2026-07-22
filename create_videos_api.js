import * as fs from 'fs';

const repoContent = 
import { prisma } from '../../database/prisma';
import { CampaignVideo } from '@prisma/client';

export async function listCampaignVideos(campaignId: string): Promise<CampaignVideo[]> {
  return prisma.campaignVideo.findMany({
    where: { campaignId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createCampaignVideo(data: Omit<CampaignVideo, 'id' | 'createdAt' | 'updatedAt'>): Promise<CampaignVideo> {
  return prisma.campaignVideo.create({ data });
}

export async function getCampaignVideoById(id: string): Promise<CampaignVideo | null> {
  return prisma.campaignVideo.findUnique({ where: { id } });
}

export async function updateCampaignVideo(id: string, data: Partial<CampaignVideo>): Promise<CampaignVideo> {
  return prisma.campaignVideo.update({ where: { id }, data });
}

export async function deleteCampaignVideo(id: string): Promise<void> {
  await prisma.campaignVideo.delete({ where: { id } });
}
;

fs.writeFileSync('src/modules/campaigns/campaign-videos.repository.ts', repoContent);

const controllerContent = 
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../database/prisma';
import * as repo from './campaign-videos.repository';

// Basic regex for normal and youtu.be links
const youtubeRegex = /^(https?:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.?be)\\/.+$/;

const createSchema = z.object({
  youtubeUrl: z.string().regex(youtubeRegex, 'Must be a valid YouTube URL'),
  title: z.string().min(1).max(255),
  caption: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

async function assertCampaignExists(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) throw AppError.notFound('Campaign');
}

export async function listHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);
    const items = await repo.listCampaignVideos(req.params.id);
    sendSuccess(res, items);
  } catch (err) { next(err); }
}

export async function createHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCampaignExists(req.params.id);
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) throw AppError.badRequest(parse.error.message);

    const video = await repo.createCampaignVideo({
      campaignId: req.params.id,
      youtubeUrl: parse.data.youtubeUrl,
      title: parse.data.title,
      caption: parse.data.caption ?? null,
      sortOrder: parse.data.sortOrder,
      isActive: parse.data.isActive,
    });
    sendCreated(res, video);
  } catch (err) { next(err); }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const video = await repo.getCampaignVideoById(req.params.videoId);
    if (!video || video.campaignId !== req.params.id) throw AppError.notFound('Campaign video');

    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) throw AppError.badRequest(parse.error.message);

    const updated = await repo.updateCampaignVideo(req.params.videoId, parse.data);
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const video = await repo.getCampaignVideoById(req.params.videoId);
    if (!video || video.campaignId !== req.params.id) throw AppError.notFound('Campaign video');

    await repo.deleteCampaignVideo(req.params.videoId);
    sendNoContent(res);
  } catch (err) { next(err); }
}
;

fs.writeFileSync('src/modules/campaigns/campaign-videos.controller.ts', controllerContent);

console.log('Created repository and controller');
