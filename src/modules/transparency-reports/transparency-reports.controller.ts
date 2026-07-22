import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete, auditPublish, auditUnpublish } from '../../utils/audit';
import * as svc from './transparency-reports.service';
import type { CreateTransparencyReportDto, UpdateTransparencyReportDto, ReportListQuery } from './transparency-reports.types';

// ─── Admin ───────────────────────────────────────────────────────

export async function createReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateTransparencyReportDto;
    const report = await svc.createReport(dto);
    auditCreate('transparency_reports', report.id, { title: dto.title }, auditContextFromRequest(req));
    sendCreated(res, report);
  } catch (err) { next(err); }
}

export async function listReportsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listReports(req.query as never as ReportListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getReport(req.params.id));
  } catch (err) { next(err); }
}

export async function updateReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateTransparencyReportDto;
    const updated = await svc.updateReport(req.params.id, dto);
    auditUpdate('transparency_reports', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteReport(req.params.id);
    auditDelete('transparency_reports', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function publishReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await svc.publishReport(req.params.id);
    auditPublish('transparency_reports', req.params.id, auditContextFromRequest(req));
    sendSuccess(res, report);
  } catch (err) { next(err); }
}

export async function unpublishReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await svc.unpublishReport(req.params.id);
    auditUnpublish('transparency_reports', req.params.id, auditContextFromRequest(req));
    sendSuccess(res, report);
  } catch (err) { next(err); }
}

// ─── Public ──────────────────────────────────────────────────────

export async function listPublishedReportsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPublishedReports(req.query as { page?: number; limit?: number });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function publicSummaryHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPublicSummary());
  } catch (err) { next(err); }
}

export async function getReportBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getReportBySlug(req.params.slug));
  } catch (err) { next(err); }
}
