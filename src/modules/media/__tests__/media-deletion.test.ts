import { CampaignStatus, CampaignType, Prisma } from '@prisma/client';

import { prisma } from '../../../database/prisma';
import { errorHandler } from '../../../middlewares/errorHandler';
import { deleteCampaign } from '../../campaigns/campaigns.service';
import { deleteMedia } from '../media.service';
import {
  performDeferredStorageCleanup,
  removeCampaignMediaReference,
} from '../media-delete.service';
import * as storage from '../../../storage/storage.service';
import * as audit from '../../../utils/audit';

describe('Media deletion safety', () => {
  let userId: string;
  const campaignIds: string[] = [];
  const mediaIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: 'Media Delete Test User', role: 'ADMIN' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.campaignMedia.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.mediaFile.deleteMany({ where: { id: { in: mediaIds } } });
    campaignIds.length = 0;
    mediaIds.length = 0;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createCampaign(title: string) {
    const campaign = await prisma.campaign.create({
      data: {
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.draft,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        createdById: userId,
      },
    });
    campaignIds.push(campaign.id);
    return campaign;
  }

  async function createMediaFile(originalName: string) {
    const media = await prisma.mediaFile.create({
      data: {
        filename: `media/test/${originalName}`,
        originalName,
        mimeType: 'image/png',
        sizeBytes: 1024,
        url: `https://cdn.example.com/${originalName}`,
        uploadedById: userId,
      },
    });
    mediaIds.push(media.id);
    return media;
  }

  it('deletes an unused media file', async () => {
    const media = await createMediaFile('unused.png');
    const deleteSpy = jest
      .spyOn(storage, 'deleteFromStorageStrict')
      .mockResolvedValue();

    await deleteMedia(media.id, {});

    expect(await prisma.mediaFile.findUnique({ where: { id: media.id } })).toBeNull();
    expect(deleteSpy).toHaveBeenCalledWith(media.filename);
  });

  it('returns MEDIA_FILE_IN_USE when attempting to delete a referenced media file', async () => {
    const campaign = await createCampaign('Referenced media campaign');
    const media = await createMediaFile('referenced.png');

    await prisma.campaignMedia.create({
      data: {
        campaignId: campaign.id,
        mediaFileId: media.id,
        role: 'hero',
        sortOrder: 0,
      },
    });

    await expect(deleteMedia(media.id, {})).rejects.toMatchObject({
      code: 'MEDIA_FILE_IN_USE',
      statusCode: 409,
    });
    expect(await prisma.mediaFile.findUnique({ where: { id: media.id } })).not.toBeNull();
  });

  it('removing media from one campaign keeps the MediaFile when other references still exist', async () => {
    const campaignA = await createCampaign('Campaign A');
    const campaignB = await createCampaign('Campaign B');
    const media = await createMediaFile('shared.png');

    const [cmA, cmB] = await Promise.all([
      prisma.campaignMedia.create({
        data: {
          campaignId: campaignA.id,
          mediaFileId: media.id,
          role: 'gallery',
          sortOrder: 0,
        },
      }),
      prisma.campaignMedia.create({
        data: {
          campaignId: campaignB.id,
          mediaFileId: media.id,
          role: 'gallery',
          sortOrder: 0,
        },
      }),
    ]);

    const result = await prisma.$transaction((tx) =>
      removeCampaignMediaReference(tx, cmA.id),
    );

    expect(result.deletedMediaFile).toBe(false);
    expect(await prisma.campaignMedia.findUnique({ where: { id: cmA.id } })).toBeNull();
    expect(await prisma.campaignMedia.findUnique({ where: { id: cmB.id } })).not.toBeNull();
    expect(await prisma.mediaFile.findUnique({ where: { id: media.id } })).not.toBeNull();
  });

  it('removing the final reference deletes the MediaFile', async () => {
    const campaign = await createCampaign('Final reference campaign');
    const media = await createMediaFile('final-reference.png');

    const cm = await prisma.campaignMedia.create({
      data: {
        campaignId: campaign.id,
        mediaFileId: media.id,
        role: 'gallery',
        sortOrder: 0,
      },
    });

    const result = await prisma.$transaction((tx) =>
      removeCampaignMediaReference(tx, cm.id),
    );

    expect(result.deletedMediaFile).toBe(true);
    expect(result.storageCleanup?.objectKey).toBe(media.filename);
    expect(await prisma.mediaFile.findUnique({ where: { id: media.id } })).toBeNull();
  });

  it('deleting a campaign removes CampaignMedia rows and cleans up orphaned media', async () => {
    const campaign = await createCampaign('Campaign delete media cleanup');
    const media = await createMediaFile('campaign-delete.png');
    const deleteSpy = jest
      .spyOn(storage, 'deleteFromStorageStrict')
      .mockResolvedValue();

    await prisma.campaignMedia.create({
      data: {
        campaignId: campaign.id,
        mediaFileId: media.id,
        role: 'hero',
        sortOrder: 0,
      },
    });

    await deleteCampaign(campaign.id, {});

    expect(await prisma.campaign.findUnique({ where: { id: campaign.id } })).toBeNull();
    expect(await prisma.campaignMedia.findMany({ where: { campaignId: campaign.id } })).toHaveLength(0);
    expect(await prisma.mediaFile.findUnique({ where: { id: media.id } })).toBeNull();
    expect(deleteSpy).toHaveBeenCalledWith(media.filename);
  });

  it('converts Prisma P2003 into a clean MEDIA_FILE_IN_USE response', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: 'test',
        meta: { field_name: 'campaign_media_media_file_id_fkey (index)' },
      },
    );

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    errorHandler(err, {} as never, res as never, {} as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'MEDIA_FILE_IN_USE',
        message:
          'This media file is currently used by one or more campaigns or content modules. Remove those references before deleting it.',
        details: [],
      },
    });
  });

  it('logs and marks storage cleanup failures for retry', async () => {
    const writeAuditLogSpy = jest
      .spyOn(audit, 'writeAuditLog')
      .mockResolvedValue();
    jest
      .spyOn(storage, 'deleteFromStorageStrict')
      .mockRejectedValue(new Error('b2 delete failed'));

    await performDeferredStorageCleanup(
      { mediaFileId: 'media-123', objectKey: 'media/test/failure.png' },
      {},
    );

    expect(writeAuditLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'media_file_storage_cleanup',
        resourceId: 'media-123',
      }),
      {},
    );
  });
});
