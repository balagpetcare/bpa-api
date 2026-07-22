import { NewsStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { uniqueNewsSlug, uniqueCategorySlug, uniqueTagSlug } from '../../utils/slug';
import { AuditContext, auditCreate, auditUpdate, auditDelete, auditPublish, auditUnpublish } from '../../utils/audit';
import { PaginationMeta } from '../../types';
import * as repo from './news.repository';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateTagDto,
  CreateNewsDto, UpdateNewsDto, PublishNewsDto, NewsListQuery,
  CategoryResponse, TagResponse, NewsResponse, NewsListItem,
} from './news.types';

// ─── Formatters ───────────────────────────────────────────────────

function formatCategory(c: { id: string; name: string; slug: string; createdAt: Date; _count?: { news: number } }): CategoryResponse {
  return { id: c.id, name: c.name, slug: c.slug, newsCount: c._count?.news, createdAt: c.createdAt };
}

function formatTag(t: { id: string; name: string; slug: string }): TagResponse {
  return { id: t.id, name: t.name, slug: t.slug };
}

type RawNews = Awaited<ReturnType<typeof repo.findNewsById>>;

function formatNews(n: NonNullable<RawNews>): NewsResponse {
  return {
    id: n.id,
    title: n.title,
    slug: n.slug,
    excerpt: n.excerpt,
    body: n.body,
    coverImageId: n.coverImageId,
    coverImageUrl: n.coverImage?.url ?? null,
    authorId: n.authorId,
    authorName: n.author.name,
    categoryId: n.categoryId,
    categoryName: n.category?.name ?? null,
    tags: n.tags.map(formatTag),
    status: n.status,
    isFeatured: n.isFeatured,
    publishedAt: n.publishedAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

type RawListItem = Awaited<ReturnType<typeof repo.findManyNews>>[number];

function formatListItem(n: RawListItem): NewsListItem {
  return {
    id: n.id,
    title: n.title,
    slug: n.slug,
    excerpt: n.excerpt,
    coverImageUrl: n.coverImage?.url ?? null,
    authorName: n.author.name,
    categoryName: n.category?.name ?? null,
    tags: n.tags.map(formatTag),
    status: n.status,
    isFeatured: n.isFeatured,
    publishedAt: n.publishedAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

// ─── Category service ─────────────────────────────────────────────

export async function listCategories(): Promise<CategoryResponse[]> {
  const cats = await repo.findAllCategories();
  return cats.map(formatCategory);
}

export async function createCategory(dto: CreateCategoryDto, ctx: AuditContext): Promise<CategoryResponse> {
  const slug = dto.slug ?? (await uniqueCategorySlug(dto.name));
  const existing = await repo.findCategoryBySlug(slug);
  if (existing) throw AppError.conflict(`Category "${slug}" already exists`);
  const cat = await repo.createCategory({ name: dto.name, slug });
  await auditCreate('news_category', cat.id, { name: cat.name, slug: cat.slug }, ctx);
  return formatCategory(cat);
}

export async function updateCategory(id: string, dto: UpdateCategoryDto, ctx: AuditContext): Promise<CategoryResponse> {
  const existing = await repo.findCategoryById(id);
  if (!existing) throw AppError.notFound('Category');
  const slug = dto.slug ?? (dto.name ? await uniqueCategorySlug(dto.name, id) : undefined);
  if (slug && slug !== existing.slug) {
    const conflict = await repo.findCategoryBySlug(slug);
    if (conflict) throw AppError.conflict(`Slug "${slug}" already in use`);
  }
  const updated = await repo.updateCategory(id, { ...(dto.name && { name: dto.name }), ...(slug && { slug }) });
  await auditUpdate('news_category', id, { name: existing.name }, { name: updated.name }, ctx);
  return formatCategory(updated);
}

export async function deleteCategory(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findCategoryById(id);
  if (!existing) throw AppError.notFound('Category');
  await repo.deleteCategory(id);
  await auditDelete('news_category', id, { name: existing.name }, ctx);
}

// ─── Tag service ──────────────────────────────────────────────────

export async function listTags(): Promise<TagResponse[]> {
  const tags = await repo.findAllTags();
  return tags.map(formatTag);
}

export async function createTag(dto: CreateTagDto, ctx: AuditContext): Promise<TagResponse> {
  const slug = dto.slug ?? (await uniqueTagSlug(dto.name));
  const existing = await repo.findTagBySlug(slug);
  if (existing) throw AppError.conflict(`Tag "${slug}" already exists`);
  const tag = await repo.createTag({ name: dto.name, slug });
  await auditCreate('news_tag', tag.id, { name: tag.name, slug: tag.slug }, ctx);
  return formatTag(tag);
}

export async function deleteTag(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findTagById(id);
  if (!existing) throw AppError.notFound('Tag');
  await repo.deleteTag(id);
  await auditDelete('news_tag', id, { name: existing.name }, ctx);
}

// ─── News service ─────────────────────────────────────────────────

export async function listNews(
  query: NewsListQuery,
): Promise<{ data: NewsListItem[]; meta: PaginationMeta }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const filter = {
    search: query.search,
    status: query.status,
    categoryId: query.categoryId,
    tagId: query.tagId,
    isFeatured: query.isFeatured !== undefined ? query.isFeatured === 'true' : undefined,
  };
  const [rows, total] = await Promise.all([
    repo.findManyNews(filter, skip, limit),
    repo.countNews(filter),
  ]);
  return { data: rows.map(formatListItem), meta: buildPaginationMeta(total, page, limit) };
}

export async function getNewsById(id: string): Promise<NewsResponse> {
  const news = await repo.findNewsById(id);
  if (!news) throw AppError.notFound('News article');
  return formatNews(news);
}

export async function getNewsBySlug(slug: string): Promise<NewsResponse> {
  const news = await repo.findNewsBySlug(slug);
  if (!news) throw AppError.notFound('News article');
  return formatNews(news);
}

export async function createNews(dto: CreateNewsDto, authorId: string, ctx: AuditContext): Promise<NewsResponse> {
  const slug = dto.slug ?? (await uniqueNewsSlug(dto.title));
  const news = await repo.createNews({
    title: dto.title,
    slug,
    excerpt: dto.excerpt,
    body: dto.body,
    isFeatured: dto.isFeatured ?? false,
    author: { connect: { id: authorId } },
    ...(dto.coverImageId ? { coverImage: { connect: { id: dto.coverImageId } } } : {}),
    ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
    ...(dto.tagIds?.length ? { tags: { connect: dto.tagIds.map((id) => ({ id })) } } : {}),
  });
  await auditCreate('news', news.id, { title: news.title, slug: news.slug }, ctx);
  return formatNews(news);
}

export async function updateNews(id: string, dto: UpdateNewsDto, ctx: AuditContext): Promise<NewsResponse> {
  const existing = await repo.findNewsById(id);
  if (!existing) throw AppError.notFound('News article');

  const slug =
    dto.slug ??
    (dto.title && dto.title !== existing.title ? await uniqueNewsSlug(dto.title, id) : undefined);

  const updated = await repo.updateNews(id, {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(slug !== undefined && { slug }),
    ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
    ...(dto.body !== undefined && { body: dto.body }),
    ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
    ...(dto.coverImageId !== undefined && {
      coverImage: dto.coverImageId ? { connect: { id: dto.coverImageId } } : { disconnect: true },
    }),
    ...(dto.categoryId !== undefined && {
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true },
    }),
    ...(dto.tagIds !== undefined && {
      tags: { set: dto.tagIds.map((tid) => ({ id: tid })) },
    }),
  });

  await auditUpdate('news', id, { title: existing.title, status: existing.status }, { title: updated.title }, ctx);
  return formatNews(updated);
}

export async function publishNews(id: string, dto: PublishNewsDto, ctx: AuditContext): Promise<NewsResponse> {
  const existing = await repo.findNewsById(id);
  if (!existing) throw AppError.notFound('News article');

  const isPublishing = dto.status === NewsStatus.published;
  const publishedAt = isPublishing
    ? dto.publishedAt ? new Date(dto.publishedAt) : existing.publishedAt ?? new Date()
    : existing.publishedAt;

  const updated = await repo.updateNews(id, {
    status: dto.status,
    publishedAt: isPublishing ? publishedAt : undefined,
  });

  if (isPublishing) {
    await auditPublish('news', id, ctx);
  } else {
    await auditUnpublish('news', id, ctx);
  }
  return formatNews(updated);
}

export async function deleteNews(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findNewsById(id);
  if (!existing) throw AppError.notFound('News article');
  await repo.deleteNews(id);
  await auditDelete('news', id, { title: existing.title, status: existing.status }, ctx);
}
