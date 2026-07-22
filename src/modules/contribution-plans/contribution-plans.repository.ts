import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CreateContributionPlanDto, UpdateContributionPlanDto } from './contribution-plans.types';

export async function createPlan(dto: CreateContributionPlanDto) {
  return prisma.contributionPlan.create({
    data: {
      title: dto.title,
      slug: dto.slug,
      contributionType: dto.contributionType,
      amountBdt: dto.amountBdt,
      currency: dto.currency,
      description: dto.description,
      benefitsSummaryJson: dto.benefitsSummaryJson as Prisma.InputJsonValue ?? Prisma.JsonNull,
      legalDisclaimerText: dto.legalDisclaimerText,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    },
  });
}

export async function listPlans() {
  return prisma.contributionPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

export async function listActivePlansPublic() {
  return prisma.contributionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }],
    select: {
      id: true,
      title: true,
      slug: true,
      contributionType: true,
      amountBdt: true,
      currency: true,
      description: true,
      benefitsSummaryJson: true,
      legalDisclaimerText: true,
      sortOrder: true,
    },
  });
}

export async function getPlanById(id: string) {
  return prisma.contributionPlan.findUnique({ where: { id } });
}

export async function updatePlan(id: string, dto: UpdateContributionPlanDto) {
  const { benefitsSummaryJson, ...rest } = dto;
  const data: Prisma.ContributionPlanUpdateInput = { ...rest };
  if (benefitsSummaryJson !== undefined) {
    data.benefitsSummaryJson = benefitsSummaryJson !== null
      ? (benefitsSummaryJson as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }
  return prisma.contributionPlan.update({ where: { id }, data });
}

export async function deletePlan(id: string) {
  return prisma.contributionPlan.delete({ where: { id } });
}
