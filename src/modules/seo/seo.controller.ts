import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendNoContent } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import * as svc from './seo.service';

/**
 * @openapi
 * /api/v1/admin/seo:
 *   get:
 *     tags: [SEO]
 *     summary: List all SEO metadata entries
 *     security: [bearerAuth: []]
 */
export async function listSeoHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listSeo()); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/seo/{route}:
 *   get:
 *     tags: [SEO]
 *     summary: Get SEO metadata for a specific route
 *     security: [bearerAuth: []]
 */
export async function getSeoHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const route = decodeURIComponent(req.params[0] ?? req.params.route ?? '');
    const data = await svc.getSeoByRoute(route);
    sendSuccess(res, data ?? null);
  } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/seo/{route}:
 *   put:
 *     tags: [SEO]
 *     summary: Create or update SEO metadata for a route
 *     security: [bearerAuth: []]
 */
export async function upsertSeoHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const route = decodeURIComponent(req.params[0] ?? req.params.route ?? '');
    const userId = req.user.sub;
    sendSuccess(res, await svc.upsertSeo(route, req.body, userId, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}

export async function deleteSeoHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const route = decodeURIComponent(req.params[0] ?? req.params.route ?? '');
    await svc.deleteSeo(route, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

// ─── Public ───────────────────────────────────────────────────────

export async function getPublicSeoHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const route = decodeURIComponent(req.params[0] ?? req.params.route ?? '');
    const data = await svc.getSeoByRoute(route);
    sendSuccess(res, data ?? null);
  } catch (e) { next(e); }
}
