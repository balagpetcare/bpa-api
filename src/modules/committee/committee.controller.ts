import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest } from '../../utils/audit';
import * as svc from './committee.service';

/**
 * @openapi
 * /api/v1/admin/committee:
 *   get:
 *     tags: [Committee CMS]
 *     summary: List committee members
 *     security: [bearerAuth: []]
 */
export async function listMembersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.listMembers(req.query as never)); } catch (e) { next(e); }
}

export async function getMemberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.getMemberById(req.params.id)); } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/committee:
 *   post:
 *     tags: [Committee CMS]
 *     summary: Create a committee member
 *     security: [bearerAuth: []]
 */
export async function createMemberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendCreated(res, await svc.createMember(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}

export async function updateMemberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.updateMember(req.params.id, req.body, auditContextFromRequest(req)));
  } catch (e) { next(e); }
}

export async function deleteMemberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteMember(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (e) { next(e); }
}

/**
 * @openapi
 * /api/v1/admin/committee/reorder:
 *   patch:
 *     tags: [Committee CMS]
 *     summary: Bulk update sort order
 *     security: [bearerAuth: []]
 */
export async function reorderMembersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await svc.reorderMembers(req.body, auditContextFromRequest(req))); } catch (e) { next(e); }
}
