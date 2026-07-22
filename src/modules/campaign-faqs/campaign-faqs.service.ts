import { AppError } from '../../utils/AppError';
import * as repo from './campaign-faqs.repository';
import type { CreateCampaignFaqDto, UpdateCampaignFaqDto, ReorderCampaignFaqsDto } from './campaign-faqs.types';

export async function listFaqs(campaignId: string) {
  return repo.listFaqs(campaignId);
}

export async function listActiveFaqs(campaignId: string) {
  return repo.listActiveFaqs(campaignId);
}

export async function getFaq(faqId: string) {
  const faq = await repo.getFaqById(faqId);
  if (!faq) throw AppError.notFound('FAQ not found');
  return faq;
}

export async function createFaq(campaignId: string, dto: CreateCampaignFaqDto, userId: string) {
  return repo.createFaq(campaignId, dto, userId);
}

export async function updateFaq(campaignId: string, faqId: string, dto: UpdateCampaignFaqDto, userId: string) {
  const faq = await getFaq(faqId);
  if (faq.campaignId !== campaignId) throw AppError.notFound('FAQ not found in this campaign');
  return repo.updateFaq(faqId, dto, userId);
}

export async function deleteFaq(campaignId: string, faqId: string) {
  const faq = await getFaq(faqId);
  if (faq.campaignId !== campaignId) throw AppError.notFound('FAQ not found in this campaign');
  return repo.deleteFaq(faqId);
}

export async function reorderFaqs(campaignId: string, dto: ReorderCampaignFaqsDto) {
  // Verify all faqIds belong to this campaign
  const faqs = await repo.listFaqs(campaignId);
  const validIds = new Set(faqs.map((f) => f.id));
  for (const id of dto.faqIds) {
    if (!validIds.has(id)) {
      throw AppError.notFound(`FAQ ${id} not found in this campaign`);
    }
  }
  await repo.reorderFaqs(dto.faqIds);
}
