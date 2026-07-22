import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { PartnerClinicListQuery } from './partner-clinics.types';

export async function createPartnerClinic(dto: Record<string, unknown>, createdById: string) {
  return prisma.partnerClinic.create({
    data: { ...dto, createdById, updatedById: createdById } as unknown as Prisma.PartnerClinicCreateInput,
  });
}

export async function listPartnerClinics(query: PartnerClinicListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PartnerClinicWhereInput = {};

  if (query.isActive === undefined) {
    where.isActive = true;
  } else if (query.isActive === 'true') {
    where.isActive = true;
  } else if (query.isActive === 'false') {
    where.isActive = false;
  }
  if (query.status) where.status = query.status;
  if (query.divisionId) where.divisionId = query.divisionId;
  if (query.districtId) where.districtId = query.districtId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { area: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.partnerClinic.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { division: { select: { name: true } }, district: { select: { name: true } } },
    }),
    prisma.partnerClinic.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPartnerClinicById(id: string) {
  return prisma.partnerClinic.findUnique({
    where: { id },
    include: { division: { select: { name: true } }, district: { select: { name: true } } },
  });
}

export async function updatePartnerClinic(id: string, dto: Record<string, unknown>, updatedById: string) {
  return prisma.partnerClinic.update({
    where: { id },
    data: { ...dto, updatedById } as Prisma.PartnerClinicUpdateInput,
  });
}

/** Soft delete — deactivates rather than removing the row, consistent with other directory modules. */
export async function softDeletePartnerClinic(id: string, updatedById: string) {
  return prisma.partnerClinic.update({ where: { id }, data: { isActive: false, updatedById } });
}

export async function reorderPartnerClinics(items: Array<{ id: string; sortOrder: number }>) {
  await prisma.$transaction(
    items.map((item) => prisma.partnerClinic.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );
}
