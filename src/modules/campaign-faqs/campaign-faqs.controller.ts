import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './campaign-faqs.service';
import type { CreateCampaignFaqDto, UpdateCampaignFaqDto, ReorderCampaignFaqsDto } from './campaign-faqs.types';

export async function listFaqsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const faqs = await svc.listFaqs(req.params.campaignId);
    sendSuccess(res, faqs);
  } catch (err) { next(err); }
}

export async function getFaqHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const faq = await svc.getFaq(req.params.faqId);
    sendSuccess(res, faq);
  } catch (err) { next(err); }
}

export async function createFaqHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateCampaignFaqDto;
    const faq = await svc.createFaq(req.params.campaignId, dto, req.user!.sub);
    sendCreated(res, faq);
  } catch (err) { next(err); }
}

export async function updateFaqHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateCampaignFaqDto;
    const faq = await svc.updateFaq(req.params.campaignId, req.params.faqId, dto, req.user!.sub);
    sendSuccess(res, faq);
  } catch (err) { next(err); }
}

export async function deleteFaqHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteFaq(req.params.campaignId, req.params.faqId);
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function reorderFaqsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as ReorderCampaignFaqsDto;
    await svc.reorderFaqs(req.params.campaignId, dto);
    sendSuccess(res, { reordered: true });
  } catch (err) { next(err); }
}
