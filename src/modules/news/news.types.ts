import { z } from 'zod';
import { NewsStatus } from '@prisma/client';

// ─── Category DTOs ───────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
});

// ─── Tag DTOs ────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
});

// ─── News DTOs ───────────────────────────────────────────────────

export const createNewsSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/).optional(),
  excerpt: z.string().max(500).optional(),
  body: z.string().min(1),
  coverImageId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).optional(),
  isFeatured: z.boolean().optional(),
});

export const updateNewsSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  body: z.string().min(1).optional(),
  coverImageId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  isFeatured: z.boolean().optional(),
});

export const publishNewsSchema = z.object({
  status: z.enum([NewsStatus.published, NewsStatus.draft, NewsStatus.archived]),
  publishedAt: z.string().datetime().optional(),
});

export const newsListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(NewsStatus).optional(),
  categoryId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type CreateTagDto = z.infer<typeof createTagSchema>;
export type CreateNewsDto = z.infer<typeof createNewsSchema>;
export type UpdateNewsDto = z.infer<typeof updateNewsSchema>;
export type PublishNewsDto = z.infer<typeof publishNewsSchema>;
export type NewsListQuery = z.infer<typeof newsListQuerySchema>;

// ─── Response shapes ─────────────────────────────────────────────

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  newsCount?: number;
  createdAt: Date;
}

export interface TagResponse {
  id: string;
  name: string;
  slug: string;
}

export interface NewsResponse {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  coverImageId: string | null;
  coverImageUrl: string | null;
  authorId: string;
  authorName: string;
  categoryId: string | null;
  categoryName: string | null;
  tags: TagResponse[];
  status: NewsStatus;
  isFeatured: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  authorName: string;
  categoryName: string | null;
  tags: TagResponse[];
  status: NewsStatus;
  isFeatured: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
