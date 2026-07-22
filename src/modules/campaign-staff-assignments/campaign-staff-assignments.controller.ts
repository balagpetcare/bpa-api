import { Request, Response, NextFunction } from 'express';
import * as svc from './campaign-staff-assignments.service';
import { HTTP_STATUS } from '../../config/constants';

export async function listHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.listStaffAssignments(req.params.campaignId, req.query as any);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function assignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.assignStaff(req.params.campaignId, req.body, req.user.sub, req.ip);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.updateStaffAssignment(req.params.campaignId, req.params.assignmentId, req.body, req.user.sub, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deactivateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deactivateStaffAssignment(req.params.campaignId, req.params.assignmentId, req.user.sub, req.ip);
    res.json({ success: true, data: { message: 'Staff assignment deactivated' } });
  } catch (err) { next(err); }
}

export async function bulkAssignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.bulkAssignStaff(req.params.campaignId, req.body, req.user.sub, req.ip);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function myAssignedCampaignsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getMyAssignedCampaigns(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
