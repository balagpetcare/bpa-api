import { AuditAction, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_CAMPAIGN_ID = '11c127a1-51c3-44d4-bd3b-b6c16f20e1cc';
const CHANGE_REASON = 'Synchronized campaign plan with linked membership tier master data.';

type TierSlug = 'primary' | 'premium' | 'enterprise';

const TARGET_CONFIG: Record<TierSlug, {
  regularPrice: number;
  campaignPrice: number;
  minPets: number;
  includedPets: number;
  maxPets: number;
}> = {
  primary: {
    regularPrice: 10000,
    campaignPrice: 3000,
    minPets: 1,
    includedPets: 3,
    maxPets: 3,
  },
  premium: {
    regularPrice: 18000,
    campaignPrice: 5000,
    minPets: 1,
    includedPets: 10,
    maxPets: 10,
  },
  enterprise: {
    regularPrice: 30000,
    campaignPrice: 10000,
    minPets: 1,
    includedPets: 20,
    maxPets: 50,
  },
};

function isTierSlug(value: string): value is TierSlug {
  return value === 'primary' || value === 'premium' || value === 'enterprise';
}

async function main() {
  const tiers = await prisma.communityMembershipTier.findMany({
    where: { slug: { in: ['primary', 'premium', 'enterprise'] } },
    include: {
      benefits: {
        include: {
          benefit: true,
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (tiers.length !== 3) {
    throw new Error(`Expected 3 master membership tiers, found ${tiers.length}`);
  }

  const tierMap = new Map(tiers.map((tier) => [tier.slug, tier]));

  const plans = await prisma.membershipPlan.findMany({
    where: { campaignId: TARGET_CAMPAIGN_ID },
    include: { tier: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (plans.length === 0) {
    throw new Error(`No membership plans found for campaign ${TARGET_CAMPAIGN_ID}`);
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      const slug = plan.tier?.slug;
      if (!slug || !isTierSlug(slug)) {
        throw new Error(`Plan ${plan.id} is not linked to a supported master tier`);
      }

      const tier = tierMap.get(slug);
      if (!tier) {
        throw new Error(`Missing master tier for slug ${slug}`);
      }

      const target = TARGET_CONFIG[slug];
      const tierBenefitTitles = tier.benefits
        .map((mapping) => mapping.benefit.titleEn)
        .filter(Boolean);
      const nextBenefits = Array.from(new Set(tierBenefitTitles));
      const nextValidityMonths = tier.validityMonths;
      const nextValidityYears = nextValidityMonths % 12 === 0 ? nextValidityMonths / 12 : null;

      const before = {
        tierId: plan.tierId,
        regularPrice: Number(plan.regularPrice),
        offerPrice: plan.offerPrice ? Number(plan.offerPrice) : null,
        regularPriceSnapshot: Number(plan.regularPriceSnapshot),
        campaignPrice: Number(plan.campaignPrice),
        minPetsSnapshot: plan.minPetsSnapshot,
        includedPetsSnapshot: plan.includedPetsSnapshot,
        maxPetsSnapshot: plan.maxPetsSnapshot,
        maxCoveredPets: plan.maxCoveredPets,
        validityMonths: plan.validityMonths,
        validityMonthsSnapshot: plan.validityMonthsSnapshot,
        validityYears: plan.validityYears,
        benefitsSnapshot: plan.benefitsSnapshot,
        tierVersion: plan.tierVersion,
        isActive: plan.isActive,
      };

      const next = {
        tierId: tier.id,
        regularPrice: target.regularPrice,
        offerPrice: target.campaignPrice,
        regularPriceSnapshot: target.regularPrice,
        campaignPrice: target.campaignPrice,
        minPetsSnapshot: target.minPets,
        includedPetsSnapshot: target.includedPets,
        maxPetsSnapshot: target.maxPets,
        maxCoveredPets: target.maxPets,
        validityMonths: nextValidityMonths,
        validityMonthsSnapshot: nextValidityMonths,
        validityYears: nextValidityYears,
        benefitsSnapshot: nextBenefits,
        tierVersion: tier.version,
        isActive: true,
      };

      const changed = JSON.stringify(before) !== JSON.stringify(next);

      if (changed) {
        await tx.membershipPlan.update({
          where: { id: plan.id },
          data: {
            tierId: next.tierId,
            regularPrice: next.regularPrice,
            offerPrice: next.offerPrice,
            regularPriceSnapshot: next.regularPriceSnapshot,
            campaignPrice: next.campaignPrice,
            minPetsSnapshot: next.minPetsSnapshot,
            includedPetsSnapshot: next.includedPetsSnapshot,
            maxPetsSnapshot: next.maxPetsSnapshot,
            maxCoveredPets: next.maxCoveredPets,
            validityMonths: next.validityMonths,
            validityMonthsSnapshot: next.validityMonthsSnapshot,
            validityYears: next.validityYears,
            benefitsSnapshot: next.benefitsSnapshot as Prisma.JsonArray,
            tierVersion: next.tierVersion,
            isActive: next.isActive,
          },
        });
      }

      const existingAudit = await tx.auditLog.findFirst({
        where: {
          resource: 'membership_plan',
          resourceId: plan.id,
          reason: CHANGE_REASON,
        },
      });

      if (!existingAudit) {
        await tx.auditLog.create({
          data: {
            actorEmail: 'system:membership-plan-correction',
            action: AuditAction.update,
            resource: 'membership_plan',
            resourceId: plan.id,
            oldValues: changed ? (before as Prisma.InputJsonValue) : ({ synchronizedFromCurrentState: true } as Prisma.InputJsonValue),
            newValues: next as Prisma.InputJsonValue,
            reason: CHANGE_REASON,
            effectiveAt: new Date(),
            existingMembersAffected: false,
            userAgent: 'fix-membership-tier-campaign-plans',
          },
        });
      }
    }
  });

  console.log(`Membership plan correction completed for campaign ${TARGET_CAMPAIGN_ID}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
