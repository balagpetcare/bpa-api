import { PrismaClient } from '@prisma/client';

export async function seedCampaignCoverages(prisma: PrismaClient) {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: 'cat-vaccination-dhaka-2026' },
    select: { id: true },
  });

  if (!campaign) {
    throw new Error('Campaign coverage seeding requires campaign "cat-vaccination-dhaka-2026"');
  }

  const existing = await prisma.campaignCoverage.findFirst({
    where: {
      campaignId: campaign.id,
      isNationwide: true,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.campaignCoverage.create({
      data: {
        campaignId: campaign.id,
        isNationwide: true,
      },
    });
  }

  return { coverages: 1 };
}
