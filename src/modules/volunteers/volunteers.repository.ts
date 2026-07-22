import { VolunteerStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateVolunteerDto, VolunteerListQuery, VolunteerResponse } from './volunteers.types';

function format(v: {
  id: string; name: string; email: string; phone: string | null;
  areaOfInterest: string | null; availability: string | null; message: string | null;
  status: VolunteerStatus; createdAt: Date; updatedAt: Date;
}): VolunteerResponse {
  return {
    id: v.id, name: v.name, email: v.email, phone: v.phone,
    areaOfInterest: v.areaOfInterest, availability: v.availability,
    message: v.message, status: v.status, createdAt: v.createdAt, updatedAt: v.updatedAt,
  };
}

export async function createVolunteer(dto: CreateVolunteerDto): Promise<VolunteerResponse> {
  const v = await prisma.volunteer.create({ data: dto });
  return format(v);
}

export async function listVolunteers(query: VolunteerListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.VolunteerWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    const s = query.search;
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.volunteer.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.volunteer.count({ where }),
  ]);
  return { items: items.map(format), meta: buildPaginationMeta(total, page, limit) };
}

export async function getVolunteerById(id: string): Promise<VolunteerResponse | null> {
  const v = await prisma.volunteer.findUnique({ where: { id } });
  return v ? format(v) : null;
}

export async function updateVolunteerStatus(id: string, status: VolunteerStatus, reviewedById?: string): Promise<VolunteerResponse | null> {
  const v = await prisma.volunteer.update({
    where: { id },
    data: { status, reviewedById: reviewedById ?? null },
  });
  return format(v);
}
