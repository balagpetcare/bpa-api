import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import * as repo from './participants.repository';
import { generateCsv, generateExcel } from './participants.export';
import { previewBulkSms, sendBulkSms, getBulkSmsHistory } from './participants.sms';
import { participantsListQuerySchema, bulkSmsSchema, bulkSmsPreviewSchema } from './participants.types';

export async function listParticipantsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const query = participantsListQuerySchema.parse(req.query);
    const result = await repo.listParticipants(campaignId, query);
    sendSuccess(res, result.items, 200, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasNext: result.page < result.totalPages,
      hasPrev: result.page > 1,
    });
  } catch (err) { next(err); }
}

export async function getPaymentSummaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const summary = await repo.getCampaignPaymentSummary(campaignId);
    sendSuccess(res, summary);
  } catch (err) { next(err); }
}

export async function exportCsvHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const query = participantsListQuerySchema.parse(req.query);
    const csv = await generateCsv(campaignId, query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=campaign-participants-${campaignId.slice(0, 8)}.csv`);
    res.send(csv);
  } catch (err) { next(err); }
}

export async function exportExcelHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const query = participantsListQuerySchema.parse(req.query);
    const buffer = await generateExcel(campaignId, query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=campaign-participants-${campaignId.slice(0, 8)}.xlsx`);
    res.send(buffer);
  } catch (err) { next(err); }
}

export async function bulkSmsPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const dto = bulkSmsPreviewSchema.parse(req.body);
    const result = await previewBulkSms(campaignId, dto, req.user!.sub);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function bulkSmsSendHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const dto = bulkSmsSchema.parse(req.body);
    const result = await sendBulkSms(campaignId, dto, req.user!.sub);
    sendCreated(res, result);
  } catch (err) { next(err); }
}

export async function bulkSmsHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;
    const history = await getBulkSmsHistory(campaignId);
    sendSuccess(res, history);
  } catch (err) { next(err); }
}
