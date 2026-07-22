import { prisma } from '../../database/prisma';
import { hashPassword } from '../../utils/hash';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { PaginationMeta } from '../../types';
import { CreateUserDto, UpdateUserDto, UserListQuery, UserResponse } from './users.types';

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  userRoles: { select: { role: { select: { id: true, name: true } } } },
} as const;

function format(u: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userRoles: Array<{ role: { id: string; name: string } }>;
}): UserResponse {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    isActive: u.isActive,
    roles: u.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function listUsers(
  query: UserListQuery,
): Promise<{ data: UserResponse[]; meta: PaginationMeta }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);

  const where = {
    deletedAt: null,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: userSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  return { data: users.map(format), meta: buildPaginationMeta(total, page, limit) };
}

export async function getUserById(id: string): Promise<UserResponse> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: userSelect,
  });
  if (!user) throw AppError.notFound('User');
  return format(user);
}

interface RequestingUser {
  sub: string;
  roles: string[];
}

async function enforceSuperAdminPrivilege(
  targetUserId: string | null,
  requestedRoleIds: string[] | undefined,
  currentUser: RequestingUser
) {
  const isSuperAdmin = currentUser.roles.includes('super_admin');

  // 1. If target user exists, check if they currently have super_admin or admin roles
  if (targetUserId) {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: {
        userRoles: {
          select: {
            role: { select: { name: true } }
          }
        }
      }
    });
    if (targetUser) {
      const currentRoles = targetUser.userRoles.map(ur => ur.role.name);
      const isTargetHighPrivilege = currentRoles.includes('super_admin') || currentRoles.includes('admin');
      if (isTargetHighPrivilege && !isSuperAdmin) {
        throw AppError.forbidden('Only a Super Admin can modify or delete high-privilege users.');
      }
    }
  }

  // 2. Check if the client is trying to assign high-privilege roles (super_admin or admin)
  if (requestedRoleIds && requestedRoleIds.length > 0) {
    const roles = await prisma.role.findMany({
      where: { id: { in: requestedRoleIds } },
      select: { name: true }
    });
    const assignsHighPrivilege = roles.some(r => r.name === 'super_admin' || r.name === 'admin');
    if (assignsHighPrivilege && !isSuperAdmin) {
      throw AppError.forbidden('Only a Super Admin can assign high-privilege roles.');
    }
  }
}

export async function createUser(dto: CreateUserDto, currentUser: RequestingUser): Promise<UserResponse> {
  await enforceSuperAdminPrivilege(null, dto.roleIds, currentUser);

  if (dto.email) {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw AppError.conflict('A user with this email already exists');
  }

  const passwordHash = await hashPassword(dto.password);

  const user = await prisma.user.create({
    data: {
      name: dto.name,
      email: dto.email || null,
      passwordHash,
      phone: dto.phone,
      userRoles: dto.roleIds?.length
        ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
        : undefined,
    },
    select: userSelect,
  });

  return format(user);
}

export async function updateUser(id: string, dto: UpdateUserDto, currentUser: RequestingUser): Promise<UserResponse> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound('User');

  if (id === currentUser.sub && dto.isActive === false) {
    throw AppError.forbidden('You cannot suspend your own account.');
  }

  await enforceSuperAdminPrivilege(id, dto.roleIds, currentUser);

  if (dto.isActive === false) {
    const isTargetSuperAdmin = await prisma.userRole.findFirst({
      where: { userId: id, role: { name: 'super_admin' } }
    });
    if (isTargetSuperAdmin) {
      const activeSuperAdminCount = await prisma.user.count({
        where: {
          deletedAt: null,
          isActive: true,
          userRoles: { some: { role: { name: 'super_admin' } } }
        }
      });
      if (activeSuperAdminCount <= 1) {
        throw AppError.conflict('Cannot suspend the last active Super Admin.');
      }
    }
  }

  if (dto.email && dto.email !== existing.email) {
    const conflict = await prisma.user.findUnique({ where: { email: dto.email } });
    if (conflict) throw AppError.conflict('Email already in use');
  }

  const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(passwordHash !== undefined && { passwordHash }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.roleIds !== undefined && {
        userRoles: {
          deleteMany: {},
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      }),
    },
    select: userSelect,
  });

  return format(user);
}

export async function deleteUser(id: string, currentUser: RequestingUser): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound('User');

  if (id === currentUser.sub) {
    throw AppError.forbidden('You cannot delete your own account.');
  }

  await enforceSuperAdminPrivilege(id, undefined, currentUser);

  const isTargetSuperAdmin = await prisma.userRole.findFirst({
    where: { userId: id, role: { name: 'super_admin' } }
  });
  if (isTargetSuperAdmin) {
    const activeSuperAdminCount = await prisma.user.count({
      where: {
        deletedAt: null,
        isActive: true,
        userRoles: { some: { role: { name: 'super_admin' } } }
      }
    });
    if (activeSuperAdminCount <= 1) {
      throw AppError.conflict('Cannot delete the last active Super Admin.');
    }
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
