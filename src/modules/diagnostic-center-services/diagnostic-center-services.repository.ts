import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateDiagnosticCenterServiceDto, UpdateDiagnosticCenterServiceDto, DiagnosticCenterServiceListQuery } from './diagnostic-center-services.types';

export async function createDiagnosticService(dto: CreateDiagnosticCenterServiceDto) {
  return prisma.diagnosticCenterService.create({ data: dto });
}

export async function listDiagnosticServices(query: DiagnosticCenterServiceListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.DiagnosticCenterServiceWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const [items, total] = await Promise.all([
    prisma.diagnosticCenterService.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.diagnosticCenterService.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listActiveDiagnosticServicesPublic() {
  return prisma.diagnosticCenterService.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }],
  });
}

export async function getDiagnosticServiceById(id: string) {
  return prisma.diagnosticCenterService.findUnique({ where: { id } });
}

export async function updateDiagnosticService(id: string, dto: UpdateDiagnosticCenterServiceDto) {
  const data: Prisma.DiagnosticCenterServiceUpdateInput = { ...dto };
  return prisma.diagnosticCenterService.update({ where: { id }, data });
}

export async function deleteDiagnosticService(id: string) {
  return prisma.diagnosticCenterService.delete({ where: { id } });
}
