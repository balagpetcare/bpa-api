import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateCarePartnerBenefitDto, UpdateCarePartnerBenefitDto, CarePartnerBenefitListQuery } from './care-partner-benefits.types';

export async function createBenefit(dto: CreateCarePartnerBenefitDto) {
  return prisma.carePartnerBenefit.create({ data: dto });
}

export async function listBenefits(query: CarePartnerBenefitListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CarePartnerBenefitWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const [items, total] = await Promise.all([
    prisma.carePartnerBenefit.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.carePartnerBenefit.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listActiveBenefitsPublic() {
  return prisma.carePartnerBenefit.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }],
  });
}

export async function getBenefitById(id: string) {
  return prisma.carePartnerBenefit.findUnique({ where: { id } });
}

export async function updateBenefit(id: string, dto: UpdateCarePartnerBenefitDto) {
  const data: Prisma.CarePartnerBenefitUpdateInput = { ...dto };
  return prisma.carePartnerBenefit.update({ where: { id }, data });
}

export async function deleteBenefit(id: string) {
  return prisma.carePartnerBenefit.delete({ where: { id } });
}
