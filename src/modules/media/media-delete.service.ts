import { AuditAction, Prisma, PrismaClient } from '@prisma/client';

import { deleteFromStorageStrict } from '../../storage/storage.service';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import { getMediaUsageReport, buildMediaInUseError } from './media-usage.service';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface MediaStorageCleanupPlan {
  mediaFileId: string;
  objectKey: string;
}

export interface MediaDeleteResult {
  deletedMediaFile: boolean;
  storageCleanup?: MediaStorageCleanupPlan;
}

async function recordStorageCleanupFailure(
  cleanup: MediaStorageCleanupPlan,
  error: unknown,
  ctx?: AuditContext,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[media-cleanup] storage deletion retry required', {
    mediaFileId: cleanup.mediaFileId,
    objectKey: cleanup.objectKey,
    error: message,
  });
  await writeAuditLog(
    {
      action: AuditAction.update,
      resource: 'media_file_storage_cleanup',
      resourceId: cleanup.mediaFileId,
      newValues: {
        objectKey: cleanup.objectKey,
        status: 'retry_required',
        error: message,
      },
    },
    ctx ?? {},
  );
}

export async function performDeferredStorageCleanup(
  cleanup: MediaStorageCleanupPlan | undefined,
  ctx?: AuditContext,
): Promise<void> {
  if (!cleanup) return;
  try {
    await deleteFromStorageStrict(cleanup.objectKey);
  } catch (error) {
    await recordStorageCleanupFailure(cleanup, error, ctx);
  }
}

async function planUnusedMediaDeletion(
  tx: DbClient,
  mediaFileId: string,
): Promise<MediaDeleteResult> {
  const report = await getMediaUsageReport(tx, mediaFileId);
  if (report.totalReferences > 0) {
    return { deletedMediaFile: false };
  }

  const mediaFile = await tx.mediaFile.findUnique({
    where: { id: mediaFileId },
    select: { id: true, filename: true },
  });
  if (!mediaFile) {
    return { deletedMediaFile: false };
  }

  await tx.mediaFile.delete({ where: { id: mediaFileId } });
  return {
    deletedMediaFile: true,
    storageCleanup: { mediaFileId, objectKey: mediaFile.filename },
  };
}

export async function deleteMediaLibraryEntry(
  tx: DbClient,
  mediaFileId: string,
): Promise<MediaDeleteResult> {
  const report = await getMediaUsageReport(tx, mediaFileId);
  if (report.totalReferences > 0) {
    throw buildMediaInUseError(report);
  }
  return planUnusedMediaDeletion(tx, mediaFileId);
}

export async function removeCampaignMediaReference(
  tx: DbClient,
  campaignMediaId: string,
): Promise<MediaDeleteResult> {
  const relation = await tx.campaignMedia.findUnique({
    where: { id: campaignMediaId },
    select: { id: true, mediaFileId: true },
  });
  if (!relation) {
    return { deletedMediaFile: false };
  }

  await tx.campaignMedia.delete({ where: { id: campaignMediaId } });
  return planUnusedMediaDeletion(tx, relation.mediaFileId);
}

export async function deleteCampaignAndCollectOrphanMedia(
  tx: DbClient,
  campaignId: string,
): Promise<MediaDeleteResult[]> {
  const linkedMedia = await tx.campaignMedia.findMany({
    where: { campaignId },
    select: { mediaFileId: true },
  });
  const uniqueMediaIds = [...new Set(linkedMedia.map((item) => item.mediaFileId))];

  await tx.campaign.delete({ where: { id: campaignId } });

  const cleanupPlans: MediaDeleteResult[] = [];
  for (const mediaFileId of uniqueMediaIds) {
    cleanupPlans.push(await planUnusedMediaDeletion(tx, mediaFileId));
  }
  return cleanupPlans;
}
