import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateSocialImpactProgramDto, UpdateSocialImpactProgramDto, SocialImpactProgramListQuery } from './social-impact-programs.types';

export async function createProgram(dto: CreateSocialImpactProgramDto) {
  return prisma.socialImpactProgram.create({ data: dto });
}

export async function listPrograms(query: SocialImpactProgramListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.SocialImpactProgramWhereInput = {};
  if (query.impactType) where.impactType = query.impactType;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const [items, total] = await Promise.all([
    prisma.socialImpactProgram.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.socialImpactProgram.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listActiveProgramsPublic() {
  return prisma.socialImpactProgram.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { impactType: 'asc' }],
  });
}

export async function getProgramById(id: string) {
  return prisma.socialImpactProgram.findUnique({ where: { id } });
}

export async function updateProgram(id: string, dto: UpdateSocialImpactProgramDto) {
  const data: Prisma.SocialImpactProgramUpdateInput = { ...dto };
  return prisma.socialImpactProgram.update({ where: { id }, data });
}

export async function deleteProgram(id: string) {
  return prisma.socialImpactProgram.delete({ where: { id } });
}
