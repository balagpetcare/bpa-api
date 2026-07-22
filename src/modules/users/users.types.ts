import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().max(20).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  password: z.string().min(8).optional(),
  phone: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const userListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export interface UserResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  roles: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}
