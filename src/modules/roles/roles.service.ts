import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { CreateRoleDto, UpdateRoleDto, RoleResponse, PermissionResponse } from './roles.types';

const roleSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  rolePermissions: {
    select: {
      permission: { select: { id: true, resource: true, action: true } },
    },
  },
} as const;

function format(r: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  rolePermissions: Array<{ permission: { id: string; resource: string; action: string } }>;
}): RoleResponse {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.rolePermissions.map((rp) => rp.permission),
    createdAt: r.createdAt,
  };
}

export async function listRoles(): Promise<RoleResponse[]> {
  const roles = await prisma.role.findMany({
    select: roleSelect,
    orderBy: { name: 'asc' },
  });
  return roles.map(format);
}

export async function getRoleById(id: string): Promise<RoleResponse> {
  const role = await prisma.role.findUnique({ where: { id }, select: roleSelect });
  if (!role) throw AppError.notFound('Role');
  return format(role);
}

export async function createRole(dto: CreateRoleDto): Promise<RoleResponse> {
  const existing = await prisma.role.findUnique({ where: { name: dto.name } });
  if (existing) throw AppError.conflict(`Role "${dto.name}" already exists`);

  const role = await prisma.role.create({
    data: {
      name: dto.name,
      description: dto.description,
      rolePermissions: dto.permissionIds?.length
        ? { create: dto.permissionIds.map((permissionId) => ({ permissionId })) }
        : undefined,
    },
    select: roleSelect,
  });

  return format(role);
}

export async function updateRole(id: string, dto: UpdateRoleDto): Promise<RoleResponse> {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Role');

  if (dto.name && dto.name !== existing.name) {
    const conflict = await prisma.role.findUnique({ where: { name: dto.name } });
    if (conflict) throw AppError.conflict(`Role "${dto.name}" already exists`);
  }

  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.permissionIds !== undefined && {
        rolePermissions: {
          deleteMany: {},
          create: dto.permissionIds.map((permissionId) => ({ permissionId })),
        },
      }),
    },
    select: roleSelect,
  });

  return format(role);
}

export async function deleteRole(id: string): Promise<void> {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Role');

  await prisma.role.delete({ where: { id } });
}

export async function listPermissions(): Promise<PermissionResponse[]> {
  return prisma.permission.findMany({
    select: { id: true, resource: true, action: true },
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });
}
