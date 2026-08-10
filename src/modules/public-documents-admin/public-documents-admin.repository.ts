import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type {
  CreatePublicDocumentDto,
  UpdatePublicDocumentDto,
  PublicDocumentAdminListQuery,
} from './public-documents-admin.types';

const include = { fileMedia: { select: { id: true, url: true, altText: true } } } as const;

export async function createPublicDocument(dto: CreatePublicDocumentDto) {
  return prisma.publicDocument.create({ data: dto, include });
}

export async function listPublicDocuments(query: PublicDocumentAdminListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PublicDocumentWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

  const [items, total] = await Promise.all([
    prisma.publicDocument.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include,
    }),
    prisma.publicDocument.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPublicDocumentById(id: string) {
  return prisma.publicDocument.findUnique({ where: { id }, include });
}

export async function updatePublicDocument(id: string, dto: UpdatePublicDocumentDto) {
  return prisma.publicDocument.update({ where: { id }, data: dto, include });
}

export async function deletePublicDocument(id: string) {
  return prisma.publicDocument.delete({ where: { id } });
}
