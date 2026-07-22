import { CampaignMediaRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { withFileMeta } from '../../utils/fileType';

const mediaInclude = {
  mediaFile: {
    select: {
      id: true,
      url: true,
      filename: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
    },
  },
} as const;

// Adds derived `extension`/`fileCategory` to the nested mediaFile so
// admin/Flutter consumers can pick the right preview widget without
// re-deriving it from the URL themselves.
function enrichMedia<T extends { mediaFile: Parameters<typeof withFileMeta>[0] }>(cm: T) {
  return { ...cm, mediaFile: withFileMeta(cm.mediaFile) };
}

function enrichMediaList<T extends { mediaFile: Parameters<typeof withFileMeta>[0] }>(items: T[]) {
  return items.map(enrichMedia);
}

// ─── Queries ─────────────────────────────────────────────────────

export async function listCampaignMedia(campaignId: string) {
  const items = await prisma.campaignMedia.findMany({
    where: { campaignId },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
    include: mediaInclude,
  });
  return enrichMediaList(items);
}

export async function getCampaignMediaById(id: string) {
  const cm = await prisma.campaignMedia.findUnique({ where: { id }, include: mediaInclude });
  return cm ? enrichMedia(cm) : cm;
}

export async function getCampaignMediaByRole(campaignId: string, role: CampaignMediaRole) {
  const items = await prisma.campaignMedia.findMany({
    where: { campaignId, role },
    orderBy: { sortOrder: 'asc' },
    include: mediaInclude,
  });
  return enrichMediaList(items);
}

// ─── Mutations ───────────────────────────────────────────────────

export async function createCampaignMedia(
  campaignId: string,
  mediaFileId: string,
  role: CampaignMediaRole,
  altText?: string,
) {
  // For singleton roles, remove existing first
  if (role !== CampaignMediaRole.gallery) {
    await prisma.campaignMedia.deleteMany({ where: { campaignId, role } });
  }

  // Compute next sortOrder for gallery
  let sortOrder = 0;
  if (role === CampaignMediaRole.gallery) {
    const last = await prisma.campaignMedia.findFirst({
      where: { campaignId, role: CampaignMediaRole.gallery },
      orderBy: { sortOrder: 'desc' },
    });
    sortOrder = last ? last.sortOrder + 1 : 0;
  }

  const created = await prisma.campaignMedia.create({
    data: { campaignId, mediaFileId, role, sortOrder, altText },
    include: mediaInclude,
  });
  return enrichMedia(created);
}

export async function updateCampaignMedia(id: string, data: { mediaFileId?: string; altText?: string | null; sortOrder?: number }) {
  const updated = await prisma.campaignMedia.update({ where: { id }, data, include: mediaInclude });
  return enrichMedia(updated);
}

export async function deleteCampaignMedia(id: string) {
  return prisma.campaignMedia.delete({ where: { id } });
}

export async function reorderGallery(campaignId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.campaignMedia.update({
        where: { id, campaignId },
        data: { sortOrder: i },
      }),
    ),
  );
  return listCampaignMedia(campaignId);
}

// ─── Detail include (used by campaigns.repository) ───────────────

export const campaignMediaDetailInclude = {
  media: {
    orderBy: [{ role: 'asc' as const }, { sortOrder: 'asc' as const }],
    include: {
      mediaFile: { select: { id: true, url: true, mimeType: true, sizeBytes: true } },
    },
  },
} as const;
