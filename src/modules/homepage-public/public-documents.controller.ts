import { Request, Response, NextFunction } from 'express';
import { sendSuccess, buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import * as repo from './homepage-public.repository';
import { normalizeDocument } from './homepage-public.normalizers';
import type { PublicDocumentsQuery } from './homepage-public.types';

// Same short cache window as the homepage aggregate — this is admin-edited
// content editors expect to see reflected quickly after publishing.
function setDocumentsCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15, stale-while-revalidate=30');
}

export async function listPublicDocumentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { category } = req.query as unknown as PublicDocumentsQuery;
    const { page, limit } = parsePaginationQuery(req.query.page, req.query.limit, 20);
    const { items, total } = await repo.listPublicDocumentsPage({ category, page, limit });
    setDocumentsCacheHeaders(res);
    sendSuccess(res, items.map(normalizeDocument), 200, buildPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}
