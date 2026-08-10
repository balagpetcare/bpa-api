import { z } from 'zod';

const nullableText = z.string().trim().max(2000).optional().nullable();
const categorySchema = z.enum(['LEGAL', 'GOVERNANCE', 'FINANCIAL', 'POLICY', 'OTHER']);

export const createPublicDocumentSchema = z.object({
  key: z.string().trim().min(1).max(80),
  titleEn: z.string().trim().min(1).max(200),
  titleBn: z.string().trim().max(200).optional().nullable(),
  category: categorySchema.default('OTHER'),
  summary: nullableText,
  fileMediaId: z.string().uuid().optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),
  version: z.string().trim().max(40).optional().nullable(),
  // Explicitly setting a publishedAt is what makes a document public — see
  // homepage-public.repository.ts's publicDocumentWhere(). Leaving this
  // null keeps a document a draft even if isActive is true.
  publishedAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updatePublicDocumentSchema = createPublicDocumentSchema.partial();

export const publicDocumentAdminListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  category: categorySchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreatePublicDocumentDto = z.infer<typeof createPublicDocumentSchema>;
export type UpdatePublicDocumentDto = z.infer<typeof updatePublicDocumentSchema>;
export type PublicDocumentAdminListQuery = z.infer<typeof publicDocumentAdminListQuerySchema>;
