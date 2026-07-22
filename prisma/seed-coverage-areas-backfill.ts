/**
 * seed-coverage-areas-backfill.ts — Idempotent backfill for CampaignCoverage.
 *
 * The public booking flow switched from campaign-first to location-first.
 * Existing campaigns have venues/sessions but no CampaignCoverage rows yet
 * (that model is new), so without this backfill they would be invisible to
 * the new /public/campaigns/discover endpoint.
 *
 * Run once after deploying the CampaignCoverage migration:
 *   npm run seed:coverage-backfill
 *
 * Strategy (safe to re-run):
 *  1. For every Campaign that has zero CampaignCoverage rows.
 *  2. Look at its active CampaignSessions -> Venue -> locationId (leaf node
 *     the venue was created under).
 *  3. Create one CampaignCoverage row per distinct venue locationId found,
 *     skipping any (campaignId, locationId) pair that already exists.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { coverages: { none: {} } },
    include: {
      sessions: {
        where: { isActive: true },
        include: { venue: { select: { id: true, locationId: true } } },
      },
    },
  });

  let created = 0;
  let skippedNoLocation = 0;

  for (const campaign of campaigns) {
    const locationIds = Array.from(new Set(
      campaign.sessions
        .map((s) => s.venue?.locationId)
        .filter((id): id is string => Boolean(id)),
    ));

    if (locationIds.length === 0) {
      skippedNoLocation += 1;
      console.log(`[skip] "${campaign.title}" has no venue with a resolved location — nothing to backfill`);
      continue;
    }

    for (const locationId of locationIds) {
      const existing = await prisma.campaignCoverage.findFirst({
        where: { campaignId: campaign.id, locationId },
      });
      if (existing) continue;

      await prisma.campaignCoverage.create({
        data: { campaignId: campaign.id, locationId },
      });
      created += 1;
      console.log(`[created] coverage for "${campaign.title}" @ location ${locationId}`);
    }
  }

  console.log(`\nDone. Created ${created} coverage row(s); ${skippedNoLocation} campaign(s) had no venue location to backfill from.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
