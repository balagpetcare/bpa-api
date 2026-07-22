import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import * as svc from './news.service';

// ─── Categories ───────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/news/categories:
 *   get:
 *     tags: [News CMS]
 *     summary: List all news categories
 *     security: [bearerAuth: []]
 *     responses:
 *       200:
 *         description: Array of categories
 */
export async function listCategoriesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listCategories()); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news/categories:
 *   post:
 *     tags: [News CMS]
 *     summary: Create a news category
 *     security: [bearerAuth: []]
 */
export async function createCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createCategory(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateCategory(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await svc.deleteCategory(req.params.id, auditContextFromRequest(req)); sendNoContent(res); } catch (e) { next(e); }
}

// ─── Tags ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/news/tags:
 *   get:
 *     tags: [News CMS]
 *     summary: List all news tags
 *     security: [bearerAuth: []]
 */
export async function listTagsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listTags()); } catch (e) { next(e); }
}

export async function createTagHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createTag(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteTagHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await svc.deleteTag(req.params.id, auditContextFromRequest(req)); sendNoContent(res); } catch (e) { next(e); }
}

// ─── News articles ────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/news:
 *   get:
 *     tags: [News CMS]
 *     summary: List all news articles (all statuses)
 *     security: [bearerAuth: []]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 */
export async function listNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, meta } = await svc.listNews(req.query as never);
    sendSuccess(res, data, 200, meta);
  } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news/{id}:
 *   get:
 *     tags: [News CMS]
 *     summary: Get a single news article by ID
 *     security: [bearerAuth: []]
 */
export async function getNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getNewsById(req.params.id)); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/news/{slug}:
 *   get:
 *     tags: [News Public]
 *     summary: Get a published news article by slug
 */
export async function getNewsBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getNewsBySlug(req.params.slug)); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news:
 *   post:
 *     tags: [News CMS]
 *     summary: Create a news article
 *     security: [bearerAuth: []]
 */
export async function createNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createNews(req.body, req.user.sub, auditContextFromRequest(req))); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news/{id}:
 *   put:
 *     tags: [News CMS]
 *     summary: Update a news article
 *     security: [bearerAuth: []]
 */
export async function updateNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateNews(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news/{id}/publish:
 *   patch:
 *     tags: [News CMS]
 *     summary: Publish, unpublish or archive a news article
 *     security: [bearerAuth: []]
 */
export async function publishNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.publishNews(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/news/{id}:
 *   delete:
 *     tags: [News CMS]
 *     summary: Delete a news article
 *     security: [bearerAuth: []]
 */
export async function deleteNewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await svc.deleteNews(req.params.id, auditContextFromRequest(req)); sendNoContent(res); } catch (e) { next(e); }
}
