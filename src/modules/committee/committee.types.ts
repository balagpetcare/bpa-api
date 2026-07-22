import { z } from 'zod';

// ─── DTOs ─────────────────────────────────────────────────────────

export const createCommitteeMemberSchema = z.object({
  name: z.string().min(1).max(120),
  designation: z.string().min(1).max(120),
  bio: z.string().optional().nullable(),
  photoId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateCommitteeMemberSchema = createCommitteeMemberSchema.partial();

export const sortOrderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
    }),
  ).min(1),
});

export const committeeListQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateCommitteeMemberDto = z.infer<typeof createCommitteeMemberSchema>;
export type UpdateCommitteeMemberDto = z.infer<typeof updateCommitteeMemberSchema>;
export type SortOrderDto = z.infer<typeof sortOrderSchema>;
export type CommitteeListQuery = z.infer<typeof committeeListQuerySchema>;

// ─── Response shapes ──────────────────────────────────────────────

export interface CommitteeMemberResponse {
  id: string;
  name: string;
  designation: string;
  bio: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
