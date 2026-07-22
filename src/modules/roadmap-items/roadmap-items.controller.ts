import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './roadmap-items.service';
import type { CreateRoadmapItemDto, UpdateRoadmapItemDto, RoadmapItemListQuery } from './roadmap-items.types';

export async function createRoadmapItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateRoadmapItemDto;
    const item = await svc.createRoadmapItem(dto);
    auditCreate('roadmap_items', item.id, { titleEn: dto.titleEn }, auditContextFromRequest(req));
    sendCreated(res, item);
  } catch (err) { next(err); }
}

export async function listRoadmapItemsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listRoadmapItems(req.query as never as RoadmapItemListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getRoadmapItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getRoadmapItem(req.params.id));
  } catch (err) { next(err); }
}

export async function updateRoadmapItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateRoadmapItemDto;
    const updated = await svc.updateRoadmapItem(req.params.id, dto);
    auditUpdate('roadmap_items', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteRoadmapItemHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteRoadmapItem(req.params.id);
    auditDelete('roadmap_items', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function listActiveRoadmapItemsPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActiveRoadmapItemsPublic());
  } catch (err) { next(err); }
}
