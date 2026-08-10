import { prisma } from '../../../database/prisma';
import { listCampaignSessions } from '../campaigns.repository';
import { createVenue } from '../../locations/locations.repository';
import { CampaignStatus, CampaignType, LocationType } from '@prisma/client';

// Public "Sessions & Venues" list: upcoming-only by default (soonest first),
// past sessions excluded unless tab=past, search/division/district/
// availability filters, and page/limit pagination matching the project's
// standard { items, meta } convention.

describe('listCampaignSessions', () => {
  let userId: string;
  let divisionA: { id: string };
  let districtA: { id: string };
  let districtB: { id: string };
  let venueA: Awaited<ReturnType<typeof createVenue>>;
  let venueB: Awaited<ReturnType<typeof createVenue>>;
  let campaignId: string;

  const createdCampaignIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVenueIds: string[] = [];

  async function createLocation(type: LocationType, nameEn: string, parentId?: string) {
    const loc = await prisma.location.create({
      data: {
        type,
        nameEn,
        slug: `${nameEn.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: parentId ?? null,
      },
    });
    createdLocationIds.push(loc.id);
    return loc;
  }

  async function addSession(venueId: string, dayOffset: number, capacity = 50, bookedCount = 0, isActive = true) {
    return prisma.campaignSession.create({
      data: {
        campaignId, venueId, sessionDate: new Date(Date.now() + dayOffset * 86400000),
        startTime: '09:00', endTime: '12:00', capacity, bookedCount, isActive,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Sessions List Test User', role: 'ADMIN' } });
    userId = user.id;

    divisionA = await createLocation(LocationType.DIVISION, 'Sessions Test Division');
    districtA = await createLocation(LocationType.DISTRICT, 'Sessions Test District Alpha', divisionA.id);
    districtB = await createLocation(LocationType.DISTRICT, 'Sessions Test District Beta', divisionA.id);

    venueA = await createVenue({ name: `Alpha Community Venue ${Date.now()}`, address: 'Alpha Road', locationId: districtA.id });
    venueB = await createVenue({ name: `Beta Pet Clinic ${Date.now()}`, address: 'Beta Road', locationId: districtB.id });
    createdVenueIds.push(venueA.id, venueB.id);

    const campaign = await prisma.campaign.create({
      data: {
        slug: `sessions-list-campaign-${Date.now()}`,
        title: 'Sessions List Test Campaign',
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

  it('defaults to upcoming sessions only, sorted soonest-first, excluding past sessions', async () => {
    const past = await addSession(venueA.id, -3);
    const soon = await addSession(venueA.id, 1);
    const later = await addSession(venueA.id, 5);

    const result = await listCampaignSessions(campaignId, CampaignStatus.registration_open, {});

    const ids = result.items.map((s) => s.id);
    expect(ids).not.toContain(past.id);
    expect(ids.indexOf(soon.id)).toBeLessThan(ids.indexOf(later.id));

    await prisma.campaignSession.deleteMany({ where: { id: { in: [past.id, soon.id, later.id] } } });
  });

  it('tab=past returns only past sessions, most-recent-past first', async () => {
    const older = await addSession(venueA.id, -10);
    const newer = await addSession(venueA.id, -2);
    const future = await addSession(venueA.id, 3);

    const result = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { tab: 'past' });

    const ids = result.items.map((s) => s.id);
    expect(ids).not.toContain(future.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    for (const item of result.items) {
      expect(item.status === 'completed' || item.sessionDate < new Date()).toBeTruthy();
    }

    await prisma.campaignSession.deleteMany({ where: { id: { in: [older.id, newer.id, future.id] } } });
  });

  it('search matches venue name and location district name', async () => {
    const s1 = await addSession(venueA.id, 1);
    const s2 = await addSession(venueB.id, 1);

    const byVenueName = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { search: 'Alpha Community' });
    expect(byVenueName.items.map((s) => s.id)).toEqual([s1.id]);

    const byDistrict = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { search: 'District Beta' });
    expect(byDistrict.items.map((s) => s.id)).toEqual([s2.id]);

    await prisma.campaignSession.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
  });

  it('filters by divisionId and districtId', async () => {
    const s1 = await addSession(venueA.id, 1);
    const s2 = await addSession(venueB.id, 1);

    const byDivision = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { divisionId: divisionA.id });
    expect(byDivision.items.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());

    const byDistrict = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { districtId: districtA.id });
    expect(byDistrict.items.map((s) => s.id)).toEqual([s1.id]);

    await prisma.campaignSession.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
  });

  it('filters by availability (full vs available)', async () => {
    const full = await addSession(venueA.id, 1, 10, 10);
    const available = await addSession(venueA.id, 2, 10, 0);

    const fullOnly = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { availability: 'full' });
    expect(fullOnly.items.map((s) => s.id)).toEqual([full.id]);

    const availableOnly = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { availability: 'available' });
    expect(availableOnly.items.map((s) => s.id)).toContain(available.id);
    expect(availableOnly.items.map((s) => s.id)).not.toContain(full.id);

    await prisma.campaignSession.deleteMany({ where: { id: { in: [full.id, available.id] } } });
  });

  it('paginates with the standard { page, limit, total, hasNext } meta shape', async () => {
    const created = await Promise.all([1, 2, 3, 4, 5].map((d) => addSession(venueA.id, d)));

    const page1 = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta.total).toBeGreaterThanOrEqual(5);
    expect(page1.meta.hasNext).toBe(true);

    const page2 = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);

    await prisma.campaignSession.deleteMany({ where: { id: { in: created.map((s) => s.id) } } });
  });

  it('returns an empty items array (not an error) when no sessions match the filters', async () => {
    const result = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { search: 'no-such-venue-name-xyz' });
    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  // ── Availability filter + pagination correctness ────────────────────
  // Regression guard: availability filtering must be applied to the FULL
  // matching candidate set BEFORE pagination/count are computed. A buggy
  // "paginate first, then filter the page" implementation would return a
  // wrong (too-small or duplicated) page and an incorrect meta.total.
  it('applies the availability filter before pagination, so total/pages are correct and pages never overlap', async () => {
    // 5 sessions total: 3 available, 2 full — deliberately more than one
    // page's worth (limit=2) of the filtered ("available") set.
    const available1 = await addSession(venueA.id, 1, 10, 0);
    const available2 = await addSession(venueA.id, 2, 10, 1);
    const available3 = await addSession(venueA.id, 3, 10, 2);
    const full1 = await addSession(venueA.id, 4, 10, 10);
    const full2 = await addSession(venueA.id, 5, 10, 10);
    const createdIds = [available1.id, available2.id, available3.id, full1.id, full2.id];

    const page1 = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { availability: 'available', page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta.total).toBe(3);
    expect(page1.meta.totalPages).toBe(2);
    expect(page1.meta.hasNext).toBe(true);

    const page2 = await listCampaignSessions(campaignId, CampaignStatus.registration_open, { availability: 'available', page: 2, limit: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.meta.hasNext).toBe(false);

    // No full session ever appears, and pages are disjoint (proves this
    // isn't "paginate the raw 5, then filter the page down").
    const allReturnedIds = [...page1.items, ...page2.items].map((s) => s.id);
    expect(allReturnedIds).not.toContain(full1.id);
    expect(allReturnedIds).not.toContain(full2.id);
    expect(new Set(allReturnedIds).size).toBe(3);
    expect(allReturnedIds.sort()).toEqual([available1.id, available2.id, available3.id].sort());

    await prisma.campaignSession.deleteMany({ where: { id: { in: createdIds } } });
  });
});
