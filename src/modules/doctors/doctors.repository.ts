import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { DoctorListQuery } from './doctors.types';

export async function createDoctor(dto: Record<string, unknown>) {
  return prisma.doctor.create({ data: dto as Prisma.DoctorCreateInput });
}

export async function listDoctors(query: DoctorListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.DoctorWhereInput = {};
  
  if (query.isActive === undefined) {
    where.isActive = true; // default to active
  } else if (query.isActive === 'true') {
    where.isActive = true;
  } else if (query.isActive === 'false') {
    where.isActive = false;
  } else if (query.isActive === 'all') {
    // return both active and inactive (no filter applied)
  }

  if (query.specialization) {
    where.specialization = { contains: query.specialization, mode: 'insensitive' };
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { licenseNumber: { contains: query.search, mode: 'insensitive' } },
      { specialization: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.doctor.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.doctor.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getDoctorById(id: string) {
  return prisma.doctor.findUnique({ where: { id } });
}

export async function getDoctorByLicenseNumber(licenseNumber: string) {
  return prisma.doctor.findUnique({ where: { licenseNumber } });
}

export async function updateDoctor(id: string, dto: Record<string, unknown>) {
  return prisma.doctor.update({ where: { id }, data: dto as Prisma.DoctorUpdateInput });
}

export async function softDeleteDoctor(id: string) {
  return prisma.doctor.update({ where: { id }, data: { isActive: false } });
}

