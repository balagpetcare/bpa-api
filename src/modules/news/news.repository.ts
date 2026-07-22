import { NewsStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

// ─── Selects ─────────────────────────────────────────────────────

export const newsListSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  isFeatured: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  coverImage: { select: { url: true } },
  tags: { select: { id: true, name: true, slug: true } },
} as const;

export const newsDetailSelect = {
  ...newsListSelect,
  body: true,
  coverImageId: true,
  authorId: true,
  categoryId: true,
} as const;

// ─── Category repository ─────────────────────────────────────────

export async function findAllCategories() {
  return prisma.newsCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { news: true } } },
  });
}

export async function findCategoryById(id: string) {
  return prisma.newsCategory.findUnique({ where: { id } });
}

export async function findCategoryBySlug(slug: string) {
  return prisma.newsCategory.findUnique({ where: { slug } });
}

export async function createCategory(data: Prisma.NewsCategoryCreateInput) {
  return prisma.newsCategory.create({ data });
}

export async function updateCategory(id: string, data: Prisma.NewsCategoryUpdateInput) {
  return prisma.newsCategory.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  return prisma.newsCategory.delete({ where: { id } });
}

// ─── Tag repository ───────────────────────────────────────────────

export async function findAllTags() {
  return prisma.newsTag.findMany({ orderBy: { name: 'asc' } });
}

export async function findTagById(id: string) {
  return prisma.newsTag.findUnique({ where: { id } });
}

export async function findTagBySlug(slug: string) {
  return prisma.newsTag.findUnique({ where: { slug } });
}

export async function upsertTag(name: string, slug: string) {
  return prisma.newsTag.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
}

export async function createTag(data: Prisma.NewsTagCreateInput) {
  return prisma.newsTag.create({ data });
}

export async function deleteTag(id: string) {
  return prisma.newsTag.delete({ where: { id } });
}

// ─── News repository ─────────────────────────────────────────────

export interface NewsFilter {
  search?: string;
  status?: NewsStatus;
  categoryId?: string;
  tagId?: string;
  isFeatured?: boolean;
}

function buildNewsWhere(filter: NewsFilter): Prisma.NewsWhereInput {
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.tagId ? { tags: { some: { id: filter.tagId } } } : {}),
    ...(filter.isFeatured !== undefined ? { isFeatured: filter.isFeatured } : {}),
    ...(filter.search
      ? {
          OR: [
            { title: { contains: filter.search, mode: 'insensitive' } },
            { excerpt: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function countNews(filter: NewsFilter): Promise<number> {
  return prisma.news.count({ where: buildNewsWhere(filter) });
}

export async function findManyNews(filter: NewsFilter, skip: number, take: number) {
  return prisma.news.findMany({
    where: buildNewsWhere(filter),
    select: newsListSelect,
    skip,
    take,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findNewsById(id: string) {
  return prisma.news.findUnique({ where: { id }, select: newsDetailSelect });
}

export async function findNewsBySlug(slug: string) {
  return prisma.news.findUnique({ where: { slug }, select: newsDetailSelect });
}

export async function createNews(data: Prisma.NewsCreateInput) {
  return prisma.news.create({ data, select: newsDetailSelect });
}

export async function updateNews(id: string, data: Prisma.NewsUpdateInput) {
  return prisma.news.update({ where: { id }, data, select: newsDetailSelect });
}

export async function deleteNews(id: string) {
  return prisma.news.delete({ where: { id } });
}
