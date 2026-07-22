const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
  const campaigns = await prisma.membershipCampaign.findMany();
  const tiers = await prisma.communityMembershipTier.findMany({ where: { isActive: true } });

  console.log(`Found ${campaigns.length} campaigns and ${tiers.length} active tiers.`);

  for (const campaign of campaigns) {
    const existingPlans = await prisma.membershipPlan.findMany({ where: { campaignId: campaign.id } });
    if (existingPlans.length === 0) {
      console.log(`Initializing campaign ${campaign.nameEn} with ${tiers.length} plans`);
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        await prisma.membershipPlan.create({
          data: {
            campaignId: campaign.id,
            tierId: tier.id,
            code: `${campaign.code}-${tier.code || 'tier-'+i}`,
            nameEn: `${campaign.nameEn} - ${tier.nameEn}`,
            nameBn: `${campaign.nameBn} - ${tier.nameBn}`,
            regularPriceSnapshot: null,
            campaignPrice: null,
            minPetsSnapshot: null,
            includedPetsSnapshot: null,
            maxPetsSnapshot: null,
            validityMonthsSnapshot: null,
            benefitsSnapshot: null,
            tierVersion: tier.version,
            allowPriceIncrease: false,
            maxCoveredPets: tier.petLimitMax,
            validityYears: Math.floor(tier.validityMonths / 12),
            validityMonths: tier.validityMonths % 12,
            maximumReplacementCount: 0,
            replacementRequiresApproval: true,
            replacementFee: null,
            sortOrder: i,
            isActive: true,
          }
        });
      }
    } else {
      console.log(`Campaign ${campaign.nameEn} already has ${existingPlans.length} plans. Skipping...`);
    }
  }
}
backfill().then(() => prisma.$disconnect()).catch(console.error);
