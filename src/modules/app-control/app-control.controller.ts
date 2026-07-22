import { NextFunction, Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import * as svc from './app-control.service';

export function listResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await svc.listEntities(resource, req.query as never);
      sendSuccess(res, data, 200, meta);
    } catch (e) { next(e); }
  };
}

export function getResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { sendSuccess(res, await svc.getEntity(resource, req.params.id)); } catch (e) { next(e); }
  };
}

export function createResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { sendCreated(res, await svc.createEntity(resource, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
  };
}

export function updateResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { sendSuccess(res, await svc.updateEntity(resource, req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
  };
}

export function deleteResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await svc.deleteEntity(resource, req.params.id, auditContextFromRequest(req)); sendNoContent(res); } catch (e) { next(e); }
  };
}

export function publishResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { sendSuccess(res, await svc.publishEntity(resource, req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
  };
}

export function reorderResourceHandler(resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { sendSuccess(res, await svc.reorderEntities(resource, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
  };
}

export async function listAuditLogsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, meta } = await svc.listAuditLogs(req.query as never);
    sendSuccess(res, data, 200, meta);
  } catch (e) { next(e); }
}

export async function getAuditLogHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getAuditLog(req.params.id)); } catch (e) { next(e); }
}
