import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import * as service from './app.service';
import * as homeContentService from './app-home-content.service';
import type { AppPageParams } from './app.types';

function setAppCacheHeaders(res: Response) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
}

export async function getBootstrapHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getBootstrapPayload(_req.user));
  } catch (err) {
    next(err);
  }
}

export async function getHomeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getHomePayload(req.user));
  } catch (err) {
    next(err);
  }
}

export async function getNavigationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getNavigation(req.user));
  } catch (err) {
    next(err);
  }
}

export async function getPageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getPagePayload((req.params as unknown as AppPageParams).key, req.user));
  } catch (err) {
    next(err);
  }
}

export async function getVersionHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getAppVersion());
  } catch (err) {
    next(err);
  }
}

export async function getMaintenanceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    sendSuccess(res, await service.getMaintenanceMode(req.user));
  } catch (err) {
    next(err);
  }
}

export async function getCareVideosHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    const { limit, category } = req.query as { limit?: string; category?: string };
    sendSuccess(res, await homeContentService.getCareVideos({ limit, category }));
  } catch (err) {
    next(err);
  }
}

export async function getTutorialsGuidesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    const { limit, language, category } = req.query as { limit?: string; language?: string; category?: string };
    sendSuccess(res, await homeContentService.getTutorialsGuides({ limit, language, category }));
  } catch (err) {
    next(err);
  }
}

export async function getPartnerClinicsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    setAppCacheHeaders(res);
    const { limit, divisionId, districtId } = req.query as { limit?: string; divisionId?: string; districtId?: string };
    sendSuccess(res, await homeContentService.getPartnerClinics({ limit, divisionId, districtId }));
  } catch (err) {
    next(err);
  }
}
