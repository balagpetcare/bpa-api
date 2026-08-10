import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateAppShowcaseDto, UpdateAppShowcaseDto, AppShowcaseListQuery } from './app-showcases.types';

const mediaSelect = { id: true, url: true, altText: true } as const;

const include = {
  iconMedia: { select: mediaSelect },
  features: { orderBy: { sortOrder: 'asc' as const } },
  screenshots: { orderBy: { sortOrder: 'asc' as const }, include: { mediaFile: { select: mediaSelect } } },
  platforms: { orderBy: { sortOrder: 'asc' as const }, include: { qrCodeMedia: { select: mediaSelect } } },
} satisfies Prisma.AppShowcaseInclude;

// Normalizes a LIVE-only-storeUrl invariant defensively at the write layer
// too (the zod refine already enforces it at the API boundary — this is
// belt-and-suspenders for any future caller that bypasses validation).
function sanitizePlatform(p: NonNullable<CreateAppShowcaseDto['platforms']>[number]) {
  return {
    platform: p.platform,
    availability: p.availability,
    storeUrl: p.availability === 'LIVE' ? (p.storeUrl ?? null) : null,
    qrCodeMediaId: p.qrCodeMediaId ?? null,
  };
}

function scalarData(dto: Partial<CreateAppShowcaseDto>) {
  const data: Prisma.AppShowcaseUpdateInput = {};
  if (dto.appKey !== undefined) data.appKey = dto.appKey;
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.tagline !== undefined) data.tagline = dto.tagline;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.relationshipLabel !== undefined) data.relationshipLabel = dto.relationshipLabel;
  if (dto.iconMediaId !== undefined) {
    data.iconMedia = dto.iconMediaId ? { connect: { id: dto.iconMediaId } } : { disconnect: true };
  }
  if (dto.isActive !== undefined) data.isActive = dto.isActive;
  if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
  return data;
}

export async function createAppShowcase(dto: CreateAppShowcaseDto) {
  return prisma.appShowcase.create({
    data: {
      appKey: dto.appKey,
      name: dto.name,
      tagline: dto.tagline,
      description: dto.description,
      relationshipLabel: dto.relationshipLabel,
      iconMediaId: dto.iconMediaId,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
      features: { create: dto.features.map((label, i) => ({ label, sortOrder: i })) },
      screenshots: { create: dto.screenshots.map((s, i) => ({ ...s, sortOrder: i })) },
      platforms: { create: dto.platforms.map((p, i) => ({ ...sanitizePlatform(p), sortOrder: i })) },
    },
    include,
  });
}

export async function listAppShowcases(query: AppShowcaseListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.AppShowcaseWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

  const [items, total] = await Promise.all([
    prisma.appShowcase.findMany({ where, skip, take: limit, orderBy: { sortOrder: 'asc' }, include }),
    prisma.appShowcase.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAppShowcaseById(id: string) {
  return prisma.appShowcase.findUnique({ where: { id }, include });
}

// Nested lists (features/screenshots/platforms) are replaced wholesale on
// every update that includes them — simplest correct approach for lists
// this small (max 20/10/3 respectively), avoids a client-side diffing
// layer for what is, in practice, an infrequently-edited admin form.
export async function updateAppShowcase(id: string, dto: UpdateAppShowcaseDto) {
  return prisma.$transaction(async (tx) => {
    if (dto.features) await tx.appShowcaseFeature.deleteMany({ where: { appShowcaseId: id } });
    if (dto.screenshots) await tx.appShowcaseScreenshot.deleteMany({ where: { appShowcaseId: id } });
    if (dto.platforms) await tx.appShowcasePlatformLink.deleteMany({ where: { appShowcaseId: id } });

    return tx.appShowcase.update({
      where: { id },
      data: {
        ...scalarData(dto),
        ...(dto.features && { features: { create: dto.features.map((label, i) => ({ label, sortOrder: i })) } }),
        ...(dto.screenshots && { screenshots: { create: dto.screenshots.map((s, i) => ({ ...s, sortOrder: i })) } }),
        ...(dto.platforms && {
          platforms: { create: dto.platforms.map((p, i) => ({ ...sanitizePlatform(p), sortOrder: i })) },
        }),
      },
      include,
    });
  });
}

export async function deleteAppShowcase(id: string) {
  return prisma.appShowcase.delete({ where: { id } });
}
