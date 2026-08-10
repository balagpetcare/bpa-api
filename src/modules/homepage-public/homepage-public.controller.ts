import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { getPublicHomepage } from './homepage-public.service';
import type { PublicHomepageQuery } from './homepage-public.types';

// Same short-but-real cache window rationale as `setHomeCacheHeaders` in
// `src/modules/app/app.controller.ts`: this endpoint surfaces admin-edited
// content (programs, app links, documents) that editors expect to see
// reflected shortly after publishing, so `no-store` would be wasteful but a
// long TTL would make edits appear "stuck" behind a shared/CDN cache.
function setPublicHomepageCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15, stale-while-revalidate=30');
}

export async function getPublicHomepageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locale } = req.query as unknown as PublicHomepageQuery;
    const data = await getPublicHomepage(locale || 'en');
    setPublicHomepageCacheHeaders(res);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
