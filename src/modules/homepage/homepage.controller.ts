import { Request, Response, NextFunction } from 'express';
import { auditContextFromRequest } from '../../utils/audit';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import * as svc from './homepage.service';

export async function getAdminHomepageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getAdminHomepage(req.query as never)); } catch (e) { next(e); }
}

export async function updateAdminHomepageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateAdminHomepage(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function publishHomepageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.publishHomepage(req.query as never, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function listSectionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listSections(req.query as never);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (e) { next(e); }
}

export async function createSectionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createSection(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateSectionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateSection(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteSectionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteSection(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

export async function reorderSectionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.reorderSections(req.body, auditContextFromRequest(req));
    sendSuccess(res, result.items, 200, result.meta);
  } catch (e) { next(e); }
}

export async function createSectionItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createSectionItem(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateSectionItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateSectionItem(req.params.itemId, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteSectionItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteSectionItem(req.params.itemId, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

export async function listHeroSlidesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listHeroSlides(req.query as never);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (e) { next(e); }
}

export async function createHeroSlideHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createHeroSlide(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateHeroSlideHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateHeroSlide(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteHeroSlideHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteHeroSlide(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

export async function listPartnersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPartners(req.query as never);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (e) { next(e); }
}

export async function createPartnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createPartner(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updatePartnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updatePartner(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deletePartnerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deletePartner(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

export async function getFooterHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getFooter(req.query as never)); } catch (e) { next(e); }
}

export async function upsertFooterHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.upsertFooter(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function getPublicHomepageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getPublicHomepage(req.query as never)); } catch (e) { next(e); }
}

export async function getUserAppHomeFeedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getUserAppHomeFeed(req.query as never, req.user?.sub)); } catch (e) { next(e); }
}
