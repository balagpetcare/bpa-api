import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export const mediaSelect = {
  id: true,
  filename: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  url: true,
  altText: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface MediaFilter {
  search?: string;
  mimeType?: string;
}

function buildWhere(f: MediaFilter): Prisma.MediaFileWhereInput {
  return {
    ...(f.mimeType ? { mimeType: { startsWith: f.mimeType } } : {}),
    ...(f.search
      ? {
          OR: [
            { originalName: { contains: f.search, mode: 'insensitive' } },
            { altText: { contains: f.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function countMedia(f: MediaFilter) {
  return prisma.mediaFile.count({ where: buildWhere(f) });
}

export async function findManyMedia(f: MediaFilter, skip: number, take: number) {
  return prisma.mediaFile.findMany({
    where: buildWhere(f),
    select: mediaSelect,
    skip,
    take,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findMediaById(id: string) {
  return prisma.mediaFile.findUnique({ where: { id }, select: mediaSelect });
}

export async function createMediaFile(data: Prisma.MediaFileCreateInput) {
  return prisma.mediaFile.create({ data, select: mediaSelect });
}

export async function updateMediaFile(id: string, data: Prisma.MediaFileUpdateInput) {
  return prisma.mediaFile.update({ where: { id }, data, select: mediaSelect });
}

export async function deleteMediaFile(id: string) {
  return prisma.mediaFile.delete({ where: { id } });
}
