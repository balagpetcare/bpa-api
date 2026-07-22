import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import * as svc from './events.service';

/**
 * @openapi
 * /api/v1/admin/events:
 *   get:
 *     tags: [Event CMS]
 *     summary: List all events
 *     security: [bearerAuth: []]
 */
export async function listEventsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, meta } = await svc.listEvents(req.query as never);
    sendSuccess(res, data, 200, meta);
  } catch (e) { next(e); }
}

export async function getEventHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getEventById(req.params.id)); } catch (e) { next(e); }
}

export async function getEventBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getEventBySlug(req.params.slug)); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/events:
 *   post:
 *     tags: [Event CMS]
 *     summary: Create an event
 *     security: [bearerAuth: []]
 */
export async function createEventHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createEvent(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateEventHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.updateEvent(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/events/{id}/publish:
 *   patch:
 *     tags: [Event CMS]
 *     summary: Publish, unpublish or cancel an event
 *     security: [bearerAuth: []]
 */
export async function publishEventHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.publishEvent(req.params.id, req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function deleteEventHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await svc.deleteEvent(req.params.id, auditContextFromRequest(req)); sendNoContent(res); } catch (e) { next(e); }
}

// ─── Registrations ────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/events/{id}/registrations:
 *   get:
 *     tags: [Event CMS]
 *     summary: List registrations for an event
 *     security: [bearerAuth: []]
 */
export async function listRegistrationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, meta } = await svc.listRegistrations(req.params.id, req.query as never);
    sendSuccess(res, data, 200, meta);
  } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/events/{id}/register:
 *   post:
 *     tags: [Event Public]
 *     summary: Register for an event (public)
 */
export async function createRegistrationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reg = await svc.createRegistration(
      req.params.id,
      req.body,
      req.user?.sub,
      auditContextFromRequest(req),
    );
    sendCreated(res, reg);
  } catch (e) { next(e); }
}

export async function updateRegistrationStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.updateRegistrationStatus(req.params.regId, req.body, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}
