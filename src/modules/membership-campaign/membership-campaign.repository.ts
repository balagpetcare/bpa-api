import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import type {
  MembershipCampaignListQuery,
  MembershipChildListQuery,
  MembershipApplicationListQuery,
  MembershipListQuery,
  MembershipCoveredPetListQuery,
  MembershipServiceUsageListQuery,
  MembershipUpgradeListQuery,
  MembershipReplacementListQuery,
} from './membership-campaign.types';

export const membershipCampaignPublicInclude = {
  plans: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      tier: true,
    },
  },
  mediaItems: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { mediaFile: true },
  },
  benefits: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      plans: {
        select: { planId: true },
      },
    },
  },
  documents: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { mediaFile: true },
  },
  faqs: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.MembershipCampaignInclude;

export const membershipDetailInclude = {
  plan: {
    include: {
      tier: true,
    },
  },
  user: true,
  membershipCampaign: {
    include: {
      plans: {
        include: {
          tier: true,
        },
      },
      benefits: {
        where: { isActive: true },
        include: { plans: true },
      },
    },
  },
  application: true,
  coveredPets: {
    include: {
      pet: true,
      linkedAtClinic: true,
      linkedByUser: true,
      linkedByStaff: true,
      replacedCoveredPets: {
        include: { pet: true },
      },
    },
    orderBy: [{ slotNumber: 'asc' as const }, { linkedAt: 'asc' as const }],
  },
  serviceUsages: {
    include: {
      pet: true,
      coveredPet: { include: { pet: true } },
      clinic: true,
    },
    orderBy: { serviceDate: 'desc' as const },
  },
  upgrades: {
    include: { fromPlan: true, toPlan: true, payment: true },
    orderBy: { requestedAt: 'desc' as const },
  },
} satisfies Prisma.MembershipInclude;

export const membershipApplicationInclude = {
  campaign: true,
  plan: {
    include: {
      tier: true,
    },
  },
  payment: true,
  membership: true,
} satisfies Prisma.MembershipApplicationInclude;

export async function listCampaigns(query: MembershipCampaignListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipCampaignWhereInput = {};

  // Only filter by status if explicitly provided (not undefined and not empty string)
  if (query.status) {
    where.status = query.status;
  }
  // Otherwise, list all campaigns regardless of status

  if (query.search) {
    where.OR = [
      { titleEn: { contains: query.search, mode: 'insensitive' } },
      { titleBn: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.membershipCampaign.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { titleEn: 'asc' }],
      skip,
      take: limit,
      include: {
        plans: {
          include: { tier: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    }),
    prisma.membershipCampaign.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listPlans(query: MembershipChildListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipPlanWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) {
    where.OR = [
      { code: { contains: query.search, mode: 'insensitive' } },
      { nameEn: { contains: query.search, mode: 'insensitive' } },
      { nameBn: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membershipPlan.findMany({
      where,
      include: { campaign: true, tier: true },
      orderBy: [{ campaignId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.membershipPlan.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listBenefits(query: MembershipChildListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipBenefitWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) {
    where.OR = [
      { titleEn: { contains: query.search, mode: 'insensitive' } },
      { titleBn: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membershipBenefit.findMany({ where, include: { campaign: true, plans: true }, orderBy: [{ campaignId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], skip, take: limit }),
    prisma.membershipBenefit.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listMediaItems(query: MembershipChildListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipMediaWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) where.OR = [{ titleEn: { contains: query.search, mode: 'insensitive' } }, { titleBn: { contains: query.search, mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    prisma.membershipMedia.findMany({ where, include: { campaign: true, mediaFile: true }, orderBy: [{ campaignId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], skip, take: limit }),
    prisma.membershipMedia.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listDocuments(query: MembershipChildListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipDocumentWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) where.OR = [{ titleEn: { contains: query.search, mode: 'insensitive' } }, { titleBn: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search, mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    prisma.membershipDocument.findMany({ where, include: { campaign: true, mediaFile: true }, orderBy: [{ campaignId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], skip, take: limit }),
    prisma.membershipDocument.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listFaqs(query: MembershipChildListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipFaqWhereInput = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.search) where.OR = [{ questionEn: { contains: query.search, mode: 'insensitive' } }, { questionBn: { contains: query.search, mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    prisma.membershipFaq.findMany({ where, include: { campaign: true }, orderBy: [{ campaignId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], skip, take: limit }),
    prisma.membershipFaq.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getCampaignById(id: string) {
  return prisma.membershipCampaign.findUnique({
    where: { id },
    include: membershipCampaignPublicInclude,
  });
}

export async function getCampaignBySlug(slug: string) {
  return prisma.membershipCampaign.findUnique({
    where: { slug },
    include: membershipCampaignPublicInclude,
  });
}

export async function listActiveCampaigns(now: Date) {
  return prisma.membershipCampaign.findMany({
    where: {
      status: { in: ['published', 'application_open'] },
      applicationStartAt: { lte: now },
      AND: [
        {
          OR: [
            { publishedAt: null },
            { publishedAt: { lte: now } },
          ],
        },
        {
          OR: [
            { applicationEndAt: null },
            { applicationEndAt: { gte: now } },
          ],
        },
      ],
    },
    include: {
      plans: {
        where: { isActive: true },
        include: { tier: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
      benefits: {
        where: { isActive: true },
        include: { plans: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listMembershipApplications(query: MembershipApplicationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipApplicationWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.userId) where.userId = query.userId;
  if (query.search) {
    where.OR = [
      { applicationNumber: { contains: query.search, mode: 'insensitive' } },
      { applicantName: { contains: query.search, mode: 'insensitive' } },
      { applicantMobile: { contains: query.search } },
      { applicantEmail: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membershipApplication.findMany({
      where,
      include: membershipApplicationInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.membershipApplication.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getMembershipApplicationById(id: string) {
  return prisma.membershipApplication.findUnique({
    where: { id },
    include: membershipApplicationInclude,
  });
}

export async function listMemberships(query: MembershipListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipWhereInput = {};
  if (query.status) where.membershipRecordStatus = query.status;
  if (query.campaignId) where.membershipCampaignId = query.campaignId;
  if (query.userId) where.userId = query.userId;
  if (query.search) {
    where.OR = [
      { membershipNumber: { contains: query.search, mode: 'insensitive' } },
      { cardNumber: { contains: query.search, mode: 'insensitive' } },
      { planNameSnapshot: { contains: query.search, mode: 'insensitive' } },
      { user: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      include: membershipDetailInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.membership.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getMembershipById(id: string) {
  return prisma.membership.findUnique({
    where: { id },
    include: membershipDetailInclude,
  });
}

export async function listMembershipCoveredPets(query: MembershipCoveredPetListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipCoveredPetWhereInput = {};
  if (query.membershipId) where.membershipId = query.membershipId;
  if (query.status) where.status = query.status as never;
  if (query.search) {
    where.OR = [
      { pet: { name: { contains: query.search, mode: 'insensitive' } } },
      { membership: { membershipNumber: { contains: query.search, mode: 'insensitive' } } },
      { membership: { cardNumber: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membershipCoveredPet.findMany({
      where,
      include: {
        membership: true,
        pet: true,
        linkedAtClinic: true,
        linkedByUser: true,
        linkedByStaff: true,
      },
      orderBy: [{ linkedAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.membershipCoveredPet.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listMembershipServiceUsages(query: MembershipServiceUsageListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipServiceUsageWhereInput = {};
  if (query.membershipId) where.membershipId = query.membershipId;
  if (query.clinicId) where.clinicId = query.clinicId;
  if (query.search) {
    where.OR = [
      { serviceCode: { contains: query.search, mode: 'insensitive' } },
      { serviceName: { contains: query.search, mode: 'insensitive' } },
      { membership: { membershipNumber: { contains: query.search, mode: 'insensitive' } } },
      { pet: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.membershipServiceUsage.findMany({
      where,
      include: {
        membership: true,
        pet: true,
        clinic: true,
        coveredPet: true,
      },
      orderBy: [{ serviceDate: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.membershipServiceUsage.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listMembershipUpgrades(query: MembershipUpgradeListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipUpgradeWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.membershipId) where.membershipId = query.membershipId;
  if (query.userId) where.requestedByUserId = query.userId;
  const [items, total] = await Promise.all([
    prisma.membershipUpgrade.findMany({
      where,
      include: { membership: true, fromPlan: true, toPlan: true, payment: true },
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.membershipUpgrade.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listMembershipReplacements(query: MembershipReplacementListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.MembershipPetReplacementWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.membershipId) where.membershipId = query.membershipId;
  if (query.reason) where.reason = query.reason;
  const [items, total] = await Promise.all([
    prisma.membershipPetReplacement.findMany({
      where,
      include: {
        membership: true,
        oldCoveredPet: { include: { pet: true } },
        newPet: true,
      },
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.membershipPetReplacement.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getMembershipReplacementById(id: string) {
  return prisma.membershipPetReplacement.findUnique({
    where: { id },
    include: {
      membership: {
        include: membershipDetailInclude,
      },
      oldCoveredPet: {
        include: { pet: true, linkedAtClinic: true },
      },
      newPet: true,
      requestedByUser: true,
      requestedByStaff: true,
      reviewedByAdmin: true,
    },
  });
}
