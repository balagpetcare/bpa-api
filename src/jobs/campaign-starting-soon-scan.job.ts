import { prisma } from '../database/prisma';
import { publishOutboxEvent } from '../modules/push-notifications/outbox';

const OFFSETS_DAYS = [7, 1] as const;
const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/**
 * Emits CAMPAIGN_STARTING_SOON at {7, 1} days before Campaign.startDate for
 * campaigns that are actually published/open — never for drafts. Targets
 * registered participants only (real registrants), not a broadcast, since
 * "starting soon" is only actionable for people who already registered.
 */
export async function runCampaignStartingSoonScan(): Promise<number> {
  let emitted = 0;
  const now = new Date();

  for (const offsetDays of OFFSETS_DAYS) {
    const targetDate = new Date(now);
    targetDate.setUTCHours(0, 0, 0, 0);
    targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const campaigns = await prisma.campaign.findMany({
      where: {
        startDate: { gte: targetDate, lt: nextDay },
        status: { in: ['published', 'registration_open', 'registration_closed'] },
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        registrations: {
          where: { status: { notIn: ['cancelled', 'pending_payment'] } },
          select: { owner: { select: { userId: true } } },
        },
      },
    });

    for (const campaign of campaigns) {
      const userIds = [...new Set(campaign.registrations.map((r) => r.owner.userId).filter((id): id is string => !!id))];
      if (userIds.length === 0) continue;

      await publishOutboxEvent({
        eventType: 'CAMPAIGN_STARTING_SOON',
        entityType: 'campaign',
        entityId: campaign.id,
        dedupeKey: `campaign_starting_soon:${campaign.id}:${offsetDays}d`,
        payload: {
          category: 'campaign',
          priority: offsetDays <= 1 ? 'high' : 'normal',
          title: `${campaign.title} starts in ${offsetDays} day${offsetDays === 1 ? '' : 's'}`,
          titleBn: `${campaign.title} শুরু হবে ${offsetDays} দিনের মধ্যে`,
          body: `Your registered campaign starts on ${campaign.startDate.toISOString().slice(0, 10)}. Tap to view details.`,
          bodyBn: `আপনার নিবন্ধিত ক্যাম্পেইন ${campaign.startDate.toISOString().slice(0, 10)} তারিখে শুরু হবে। বিস্তারিত দেখতে ট্যাপ করুন।`,
          deepLink: `bpa://campaigns/${campaign.id}`,
          targetUserIds: userIds,
        },
      });
      emitted++;
    }
  }

  return emitted;
}

export function startCampaignStartingSoonScanJob(): NodeJS.Timeout {
  runCampaignStartingSoonScan()
    .then((n) => console.log(`[CampaignStartingSoonScan] initial scan: ${n} events`))
    .catch((err) => console.error('[CampaignStartingSoonScan] initial scan failed:', err));

  return setInterval(() => {
    runCampaignStartingSoonScan()
      .then((n) => console.log(`[CampaignStartingSoonScan] scan: ${n} events`))
      .catch((err) => console.error('[CampaignStartingSoonScan] scan failed:', err));
  }, SCAN_INTERVAL_MS);
}
