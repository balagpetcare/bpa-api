import { prisma } from '../../database/prisma';
import type { CreateCampaignFaqDto, UpdateCampaignFaqDto } from './campaign-faqs.types';

const faqInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
} as const;

export async function listFaqs(campaignId: string) {
  return prisma.campaignFaq.findMany({
    where: { campaignId },
    orderBy: { sortOrder: 'asc' },
    include: faqInclude,
  });
}

export async function listActiveFaqs(campaignId: string) {
  return prisma.campaignFaq.findMany({
    where: { campaignId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getFaqById(id: string) {
  return prisma.campaignFaq.findUnique({
    where: { id },
    include: faqInclude,
  });
}

export async function createFaq(campaignId: string, dto: CreateCampaignFaqDto, userId: string) {
  return prisma.campaignFaq.create({
    data: {
      campaignId,
      questionEn: dto.questionEn,
      questionBn: dto.questionBn ?? null,
      answerEn: dto.answerEn,
      answerBn: dto.answerBn ?? null,
      category: dto.category ?? null,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
      createdById: userId,
      updatedById: userId,
    },
    include: faqInclude,
  });
}

export async function updateFaq(id: string, dto: UpdateCampaignFaqDto, userId: string) {
  return prisma.campaignFaq.update({
    where: { id },
    data: {
      ...dto,
      updatedBy: { connect: { id: userId } },
    },
    include: faqInclude,
  });
}

export async function deleteFaq(id: string) {
  return prisma.campaignFaq.delete({ where: { id } });
}

export async function reorderFaqs(faqIds: string[]) {
  await prisma.$transaction(
    faqIds.map((id, index) =>
      prisma.campaignFaq.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function countFaqsByCampaign(campaignId: string): Promise<number> {
  return prisma.campaignFaq.count({ where: { campaignId } });
}
