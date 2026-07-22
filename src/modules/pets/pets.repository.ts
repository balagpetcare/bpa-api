import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreatePetOwnerDto, UpdatePetOwnerDto, CreatePetDto, UpdatePetDto, PetListQuery, PetOwnerListQuery } from './pets.types';

// ─── Pet Owners ──────────────────────────────────────────────────

export async function createPetOwner(dto: CreatePetOwnerDto) {
  return prisma.petOwner.create({ data: dto });
}

export async function listPetOwners(query: PetOwnerListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PetOwnerWhereInput = {};
  if (query.mobile) where.mobile = { contains: query.mobile };
  if (query.search) {
    where.OR = [
      { ownerName: { contains: query.search, mode: 'insensitive' } },
      { mobile: { contains: query.search } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.petOwner.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pets: true } } },
    }),
    prisma.petOwner.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPetOwnerById(id: string) {
  return prisma.petOwner.findUnique({
    where: { id },
    include: { pets: { where: { isActive: true }, orderBy: { name: 'asc' } } },
  });
}

export async function getPetOwnerByMobile(mobile: string) {
  return prisma.petOwner.findFirst({ where: { mobile } });
}

export async function updatePetOwner(id: string, dto: UpdatePetOwnerDto) {
  return prisma.petOwner.update({ where: { id }, data: dto });
}

// ─── Pets ────────────────────────────────────────────────────────

export async function createPet(dto: CreatePetDto) {
  const { weightKg, ...rest } = dto;
  return prisma.pet.create({
    data: { ...rest, weightKg: weightKg !== undefined ? weightKg : undefined },
    include: { owner: { select: { id: true, ownerName: true, mobile: true } } },
  });
}

export async function listPets(query: PetListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PetWhereInput = {};
  if (query.ownerId) where.ownerId = query.ownerId;
  if (query.petType) where.petType = query.petType;
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { breed: { contains: query.search, mode: 'insensitive' } },
      { owner: { ownerName: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.pet.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, ownerName: true, mobile: true } } },
    }),
    prisma.pet.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPetById(id: string) {
  return prisma.pet.findUnique({
    where: { id },
    include: { owner: true },
  });
}

export async function updatePet(id: string, dto: UpdatePetDto) {
  const { weightKg, ...rest } = dto;
  return prisma.pet.update({
    where: { id },
    data: { ...rest, ...(weightKg !== undefined ? { weightKg } : {}) },
    include: { owner: { select: { id: true, ownerName: true, mobile: true } } },
  });
}
