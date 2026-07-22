import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateRoadmapItemDto, UpdateRoadmapItemDto, RoadmapItemListQuery } from './roadmap-items.types';

export async function createRoadmapItem(dto: CreateRoadmapItemDto) {
  return prisma.roadmapItem.create({ data: dto });
}

export async function listRoadmapItems(query: RoadmapItemListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.RoadmapItemWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.year) where.year = query.year;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const [items, total] = await Promise.all([
    prisma.roadmapItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ year: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.roadmapItem.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listActiveRoadmapItemsPublic() {
  return prisma.roadmapItem.findMany({
    where: { isActive: true },
    orderBy: [{ year: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function getRoadmapItemById(id: string) {
  return prisma.roadmapItem.findUnique({ where: { id } });
}

export async function updateRoadmapItem(id: string, dto: UpdateRoadmapItemDto) {
  const data: Prisma.RoadmapItemUpdateInput = { ...dto };
  return prisma.roadmapItem.update({ where: { id }, data });
}

export async function deleteRoadmapItem(id: string) {
  return prisma.roadmapItem.delete({ where: { id } });
}
