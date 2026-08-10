import { prisma } from '../../../database/prisma';
import {
  getCampaignBySlugLite, getCampaignSessionStats, getCampaignSessionById,
} from '../campaigns.repository';
import { createVenue } from '../../locations/locations.repository';
import { CampaignStatus, CampaignType, LocationType } from '@prisma/client';

// The public campaign page must not download the full `sessions` collection
// merely to render title/pricing/hero stats. `getCampaignBySlugLite` never
// fetches the sessions relation at the DB level; `getCampaignSessionStats`
// computes the small aggregates the page actually needs via bounded
// count/aggregate/groupBy queries; `getCampaignSessionById` resolves a
// single deep-linked session without ever touching the rest of the
// campaign's sessions.

describe('Lite campaign detail (no unbounded sessions payload)', () => {
  let userId: string;
  let location: { id: string };
  let venue: Awaited<ReturnType<typeof createVenue>>;
  let campaignId: string;
  let campaignSlug: string;

  const createdCampaignIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVenueIds: string[] = [];

  async function createLocation(type: LocationType, nameEn: string, parentId?: string) {
    const loc = await prisma.location.create({
      data: {
        type, nameEn,
        slug: `${nameEn.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: parentId ?? null,
      },
    });
    createdLocationIds.push(loc.id);
    return loc;
  }

  async function addSession(dayOffset: number, capacity = 20, bookedCount = 0, isActive = true) {
    return prisma.campaignSession.create({
      data: {
        campaignId, venueId: venue.id, sessionDate: new Date(Date.now() + dayOffset * 86400000),
        startTime: '09:00', endTime: '12:00', capacity, bookedCount, isActive,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Lite Detail Test User', role: 'ADMIN' } });
    userId = user.id;
    location = await createLocation(LocationType.DISTRICT, `Lite Test District ${Date.now()}`);
    venue = await createVenue({ name: `Lite Test Venue ${Date.now()}`, address: 'Test address', locationId: location.id });
    createdVenueIds.push(venue.id);

    campaignSlug = `lite-detail-campaign-${Date.now()}`;
    const campaign = await prisma.campaign.create({
      data: {
        slug: campaignSlug,
        title: 'Lite Detail Test Campaign',
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.registration_open,
        startDate: new Date(Date.now() - 5 * 86400000),
        endDate: new Date(Date.now() + 30 * 86400000),
        createdById: userId,
      },
    });
    createdCampaignIds.push(campaign.id);
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.campaignSession.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: createdVenueIds } } });
    for (const id of [...createdLocationIds].reverse()) {
      await prisma.location.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('getCampaignBySlugLite never populates a sessions field, regardless of how many sessions exist', async () => {
    const created = await Promise.all([1, 2, 3, 4, 5].map((d) => addSession(d)));

    const lite = await getCampaignBySlugLite(campaignSlug);
    expect(lite).not.toBeNull();
    expect((lite as unknown as { sessions?: unknown }).sessions).toBeUndefined();
    expect(lite?.title).toBe('Lite Detail Test Campaign');

    await prisma.campaignSession.deleteMany({ where: { id: { in: created.map((s) => s.id) } } });
  });

  it('getCampaignSessionStats computes correct bounded aggregates', async () => {
    const s1 = await addSession(1, 20, 5);
    const s2 = await addSession(2, 30, 30); // full
    const s3 = await addSession(-1, 10, 10); // past — excluded from nextSession lookahead

    const stats = await getCampaignSessionStats(campaignId);

    expect(stats.sessionCount).toBe(3);
    expect(stats.totalCapacity).toBe(60);
    expect(stats.totalBooked).toBe(45);
    expect(stats.totalAvailable).toBe(15);
    expect(stats.venueCount).toBe(1);
    expect(stats.nextSession?.venueName).toBe(venue.name);

    await prisma.campaignSession.deleteMany({ where: { id: { in: [s1.id, s2.id, s3.id] } } });
  });

  it('getCampaignSessionStats bounds the day breakdown and flags hasMoreDays for a long-running campaign', async () => {
    const created = await Promise.all(
      Array.from({ length: 35 }, (_, i) => addSession(i + 1)),
    );

    const stats = await getCampaignSessionStats(campaignId);

    expect(stats.dayBreakdown.length).toBeLessThanOrEqual(30);
    expect(stats.hasMoreDays).toBe(true);

    await prisma.campaignSession.deleteMany({ where: { id: { in: created.map((s) => s.id) } } });
  });

  it('getCampaignSessionById resolves exactly one session by id, scoped to the given campaign', async () => {
    const s1 = await addSession(1);

    const found = await getCampaignSessionById(campaignId, s1.id);
    expect(found?.id).toBe(s1.id);
    expect(found?.venue?.id).toBe(venue.id);

    // Not found when the session belongs to a different campaign
    const otherCampaign = await prisma.campaign.create({
      data: {
        slug: `lite-detail-other-${Date.now()}`,
        title: 'Other Campaign',
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.registration_open,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 2 * 86400000),
        createdById: userId,
      },
    });
    createdCampaignIds.push(otherCampaign.id);
    const notFound = await getCampaignSessionById(otherCampaign.id, s1.id);
    expect(notFound).toBeNull();

    await prisma.campaignSession.deleteMany({ where: { id: s1.id } });
  });
});
