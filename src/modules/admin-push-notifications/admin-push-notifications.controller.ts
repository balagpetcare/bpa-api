import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { getUserPermissions, hasPermission } from '../../middlewares/authorize';
import * as service from './admin-push-notifications.service';

function userId(req: Request): string {
  return req.user.sub;
}

// ─── Templates ───────────────────────────────────────────────────

export async function handleListTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, category } = req.query as any;
    const { items, meta } = await service.listTemplates(Number(page) || 1, Number(limit) || 20, category);
    sendSuccess(res, items, 200, meta);
  } catch (err) { next(err); }
}

export async function handleGetTemplate(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.getTemplate(req.params.id)); } catch (err) { next(err); }
}

export async function handleCreateTemplate(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await service.createTemplate(req.body, userId(req))); } catch (err) { next(err); }
}

export async function handleUpdateTemplate(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.updateTemplate(req.params.id, req.body)); } catch (err) { next(err); }
}

export async function handleDeleteTemplate(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteTemplate(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// ─── Campaigns ───────────────────────────────────────────────────

export async function handleListCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query as any;
    const { items, meta } = await service.listCampaigns(Number(page) || 1, Number(limit) || 20, status);
    sendSuccess(res, items, 200, meta);
  } catch (err) { next(err); }
}

export async function handleGetCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.getCampaign(req.params.id)); } catch (err) { next(err); }
}

export async function handleCreateCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await service.createCampaign(req.body, userId(req))); } catch (err) { next(err); }
}

export async function handleUpdateCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.updateCampaign(req.params.id, req.body)); } catch (err) { next(err); }
}

export async function handleDeleteCampaign(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteCampaign(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

export async function handleEstimateAudience(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.estimateAudience(req.params.id)); } catch (err) { next(err); }
}

export async function handlePreviewCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.previewCampaign(req.params.id)); } catch (err) { next(err); }
}

export async function handleTestSendCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.testSendCampaign(req.params.id, req.body)); } catch (err) { next(err); }
}

export async function handleApproveCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.approveCampaign(req.params.id, userId(req))); } catch (err) { next(err); }
}

export async function handleSendCampaignNow(req: Request, res: Response, next: NextFunction) {
  try {
    const permissions = await getUserPermissions(req.user.sub, req.user.roles);
    const canEmergency = hasPermission(permissions, 'notifications', 'emergency');
    sendSuccess(res, await service.sendCampaignNow(req.params.id, canEmergency));
  } catch (err) { next(err); }
}

export async function handleScheduleCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.scheduleCampaign(req.params.id, req.body)); } catch (err) { next(err); }
}

export async function handleCancelCampaign(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.cancelCampaign(req.params.id)); } catch (err) { next(err); }
}

export async function handleCampaignAnalytics(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.getCampaignAnalytics(req.params.id)); } catch (err) { next(err); }
}

// ─── Automation rules ──────────────────────────────────────────────

export async function handleListAutomationRules(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.listAutomationRules()); } catch (err) { next(err); }
}

export async function handleCreateAutomationRule(req: Request, res: Response, next: NextFunction) {
  try { sendCreated(res, await service.createAutomationRule(req.body, userId(req))); } catch (err) { next(err); }
}

export async function handleUpdateAutomationRule(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.updateAutomationRule(req.params.id, req.body)); } catch (err) { next(err); }
}

export async function handleDeleteAutomationRule(req: Request, res: Response, next: NextFunction) {
  try { await service.deleteAutomationRule(req.params.id); sendNoContent(res); } catch (err) { next(err); }
}

// ─── Failed deliveries ───────────────────────────────────────────

export async function handleListFailedDeliveries(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { items, meta } = await service.listFailedDeliveries(Number(page) || 1, Number(limit) || 20);
    sendSuccess(res, items, 200, meta);
  } catch (err) { next(err); }
}

export async function handleRetryDelivery(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await service.retryFailedDelivery(req.params.id)); } catch (err) { next(err); }
}

// ─── Audit ─────────────────────────────────────────────────────────

export async function handleListAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { items, meta } = await service.listAuditTrail(Number(page) || 1, Number(limit) || 20);
    sendSuccess(res, items, 200, meta);
  } catch (err) { next(err); }
}
