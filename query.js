const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const campaign = await prisma.membershipCampaign.findFirst({
    where: {
      titleEn: {
        contains: 'BPA Community Care Partner Membership Offer 2026'
      }
    }
  });
  console.log("Campaign:", campaign);

  if (campaign) {
    const plans = await prisma.membershipPlan.findMany({
      where: { campaignId: campaign.id }
    });
    console.log("Plans:", plans);
  }

  const tiers = await prisma.communityMembershipTier.findMany({
    where: { isActive: true }
  });
  console.log("Active Tiers:", tiers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
