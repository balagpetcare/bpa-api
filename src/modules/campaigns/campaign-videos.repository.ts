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
