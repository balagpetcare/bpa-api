import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z_]+$/, 'Name must be lowercase with underscores only'),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z_]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export interface PermissionResponse {
  id: string;
  resource: string;
  action: string;
}

export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  permissions: PermissionResponse[];
  createdAt: Date;
}
