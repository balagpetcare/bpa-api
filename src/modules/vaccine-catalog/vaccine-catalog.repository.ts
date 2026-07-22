import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type {
  CreateVaccineCatalogDto, UpdateVaccineCatalogDto, VaccineCatalogListQuery,
  CreateCertificateTemplateDto, UpdateCertificateTemplateDto,
} from './vaccine-catalog.types';

// ─── Vaccine Catalog ─────────────────────────────────────────────

export async function createVaccine(dto: CreateVaccineCatalogDto) {
  return prisma.vaccineCatalog.create({ data: dto });
}

export async function listVaccines(query: VaccineCatalogListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.VaccineCatalogWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.species) where.species = query.species;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.vaccineCatalog.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.vaccineCatalog.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getVaccineById(id: string) {
  return prisma.vaccineCatalog.findUnique({ where: { id } });
}

export async function updateVaccine(id: string, dto: UpdateVaccineCatalogDto) {
  return prisma.vaccineCatalog.update({ where: { id }, data: dto });
}

export async function deleteVaccine(id: string) {
  return prisma.vaccineCatalog.delete({ where: { id } });
}

// ─── Certificate Templates ────────────────────────────────────────

export async function createTemplate(dto: CreateCertificateTemplateDto) {
  if (dto.isDefault) {
    await prisma.certificateTemplate.updateMany({ data: { isDefault: false } });
  }
  return prisma.certificateTemplate.create({ data: dto });
}

export async function listTemplates() {
  return prisma.certificateTemplate.findMany({ where: { isActive: true }, orderBy: { isDefault: 'desc' } });
}

export async function getTemplateById(id: string) {
  return prisma.certificateTemplate.findUnique({ where: { id } });
}

export async function updateTemplate(id: string, dto: UpdateCertificateTemplateDto) {
  if (dto.isDefault) {
    await prisma.certificateTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  }
  return prisma.certificateTemplate.update({ where: { id }, data: dto });
}
