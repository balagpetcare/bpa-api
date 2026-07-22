import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export const memberSelect = {
  id: true,
  name: true,
  designation: true,
  bio: true,
  email: true,
  phone: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  photo: { select: { url: true } },
} as const;

export async function findAllMembers(isActive?: boolean) {
  return prisma.committeeMember.findMany({
    where: isActive !== undefined ? { isActive } : undefined,
    select: memberSelect,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function findMemberById(id: string) {
  return prisma.committeeMember.findUnique({ where: { id }, select: memberSelect });
}

export async function createMember(data: Prisma.CommitteeMemberCreateInput) {
  return prisma.committeeMember.create({ data, select: memberSelect });
}

export async function updateMember(id: string, data: Prisma.CommitteeMemberUpdateInput) {
  return prisma.committeeMember.update({ where: { id }, data, select: memberSelect });
}

export async function deleteMember(id: string) {
  return prisma.committeeMember.delete({ where: { id } });
}

export async function bulkUpdateSortOrder(items: { id: string; sortOrder: number }[]) {
  return prisma.$transaction(
    items.map(({ id, sortOrder }) =>
      prisma.committeeMember.update({ where: { id }, data: { sortOrder } }),
    ),
  );
}
