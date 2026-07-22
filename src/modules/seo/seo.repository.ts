import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export const seoSelect = {
  id: true,
  route: true,
  title: true,
  description: true,
  ogTitle: true,
  ogDescription: true,
  schemaJson: true,
  updatedAt: true,
  ogImage: { select: { url: true } },
} as const;

export async function findAllSeo() {
  return prisma.seoMetadata.findMany({ select: seoSelect, orderBy: { route: 'asc' } });
}

export async function findSeoByRoute(route: string) {
  return prisma.seoMetadata.findUnique({ where: { route }, select: seoSelect });
}

export async function upsertSeo(route: string, data: Prisma.SeoMetadataUpdateInput, updatedById: string) {
  const createData: Prisma.SeoMetadataCreateInput = {
    route,
    title: data.title as string | undefined,
    description: data.description as string | undefined,
    ogTitle: data.ogTitle as string | undefined,
    ogDescription: data.ogDescription as string | undefined,
    schemaJson: data.schemaJson as Prisma.InputJsonValue | undefined,
    updatedBy: { connect: { id: updatedById } },
    ...(data.ogImage ? { ogImage: data.ogImage as Prisma.MediaFileCreateNestedOneWithoutSeoImagesInput } : {}),
  };

  return prisma.seoMetadata.upsert({
    where: { route },
    create: createData,
    update: {
      ...data,
      updatedBy: { connect: { id: updatedById } },
    },
    select: seoSelect,
  });
}

export async function deleteSeo(route: string) {
  return prisma.seoMetadata.delete({ where: { route } });
}
