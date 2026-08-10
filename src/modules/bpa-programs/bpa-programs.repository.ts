import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateBpaProgramDto, UpdateBpaProgramDto, BpaProgramListQuery } from './bpa-programs.types';

const include = { iconMedia: { select: { id: true, url: true, altText: true } } } as const;

export async function createBpaProgram(dto: CreateBpaProgramDto) {
  return prisma.bpaProgram.create({ data: dto, include });
}

export async function listBpaPrograms(query: BpaProgramListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.BpaProgramWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

  const [items, total] = await Promise.all([
    prisma.bpaProgram.findMany({ where, skip, take: limit, orderBy: { sortOrder: 'asc' }, include }),
    prisma.bpaProgram.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getBpaProgramById(id: string) {
  return prisma.bpaProgram.findUnique({ where: { id }, include });
}

export async function updateBpaProgram(id: string, dto: UpdateBpaProgramDto) {
  return prisma.bpaProgram.update({ where: { id }, data: dto, include });
}

export async function deleteBpaProgram(id: string) {
  return prisma.bpaProgram.delete({ where: { id } });
}
