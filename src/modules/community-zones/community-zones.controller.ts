import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './community-zones.service';
import type { CreateCommunityZoneDto, UpdateCommunityZoneDto, CommunityZoneListQuery } from './community-zones.types';

export async function createZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCommunityZoneDto;
    const zone = await svc.createZone(dto);
    auditCreate('community_zones', zone.id, { name: dto.name }, auditContextFromRequest(req));
    sendCreated(res, zone);
  } catch (err) { next(err); }
}

export async function listZonesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listZones(req.query as never as CommunityZoneListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getDemandRankingHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getDemandRanking());
  } catch (err) { next(err); }
}

export async function getZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getZone(req.params.id));
  } catch (err) { next(err); }
}

export async function updateZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateCommunityZoneDto;
    const updated = await svc.updateZone(req.params.id, dto);
    auditUpdate('community_zones', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteZoneHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteZone(req.params.id);
    auditDelete('community_zones', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function listActiveZonesPublicHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.listActiveZonesPublic());
  } catch (err) { next(err); }
}

export async function getZoneBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getZoneBySlug(req.params.slug));
  } catch (err) { next(err); }
}
