import { CampaignStatus, CampaignType } from '@prisma/client';
import { prisma } from '../../../database/prisma';
import { createCampaignMedia, listCampaignMedia } from '../campaign-media.repository';
import { getCampaignById } from '../campaigns.repository';

describe('Campaign media API response — MIME/type metadata', () => {
  let userId: string;
  let campaignId: string;
  const mediaFileIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Campaign Media Test User', role: 'ADMIN' } });
    userId = user.id;

    const campaign = await prisma.campaign.create({
      data: {
        slug: `media-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Media Metadata Test Campaign',
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.draft,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        createdById: userId,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.campaignMedia.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
    if (mediaFileIds.length > 0) {
      await prisma.mediaFile.deleteMany({ where: { id: { in: mediaFileIds } } });
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  async function attachMedia(role: 'hero' | 'gallery', filename: string, mimeType: string) {
    const mediaFile = await prisma.mediaFile.create({
      data: {
        filename,
        originalName: filename,
        mimeType,
        sizeBytes: 1024,
        url: `https://cdn.example.com/uploads/${filename}`,
        uploadedById: userId,
      },
    });
    mediaFileIds.push(mediaFile.id);
    return createCampaignMedia(campaignId, mediaFile.id, role, undefined);
  }

  it('attaches a GIF hero image and returns extension + fileCategory alongside it', async () => {
    const cm = await attachMedia('hero', 'hero-banner.gif', 'image/gif');
    expect(cm.mediaFile.mimeType).toBe('image/gif');
    expect(cm.mediaFile.extension).toBe('gif');
    expect(cm.mediaFile.fileCategory).toBe('image');
  });

  it('attaches a WebP gallery image and classifies it as an image', async () => {
    const cm = await attachMedia('gallery', 'gallery-1.webp', 'image/webp');
    expect(cm.mediaFile.extension).toBe('webp');
    expect(cm.mediaFile.fileCategory).toBe('image');
  });

  it('classifies a PDF gallery attachment as a document, not an image', async () => {
    const cm = await attachMedia('gallery', 'brochure.pdf', 'application/pdf');
    expect(cm.mediaFile.extension).toBe('pdf');
    expect(cm.mediaFile.fileCategory).toBe('document');
  });

  it('classifies a ZIP gallery attachment as an archive', async () => {
    const cm = await attachMedia('gallery', 'assets.zip', 'application/zip');
    expect(cm.mediaFile.extension).toBe('zip');
    expect(cm.mediaFile.fileCategory).toBe('archive');
  });

  it('listCampaignMedia returns extension/fileCategory for every item', async () => {
    const items = await listCampaignMedia(campaignId);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.mediaFile).toHaveProperty('extension');
      expect(item.mediaFile).toHaveProperty('fileCategory');
      expect(['image', 'video', 'document', 'archive', 'other']).toContain(
        item.mediaFile.fileCategory,
      );
    }
  });

  it('public campaign detail (getCampaignById) also carries fileCategory on its media array', async () => {
    const campaign = await getCampaignById(campaignId);
    expect(campaign).not.toBeNull();
    expect(campaign!.media.length).toBeGreaterThan(0);
    for (const item of campaign!.media) {
      expect(item.mediaFile).toHaveProperty('extension');
      expect(item.mediaFile).toHaveProperty('fileCategory');
    }
  });
});
