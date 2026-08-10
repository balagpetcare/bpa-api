import { prisma } from '../../../database/prisma';
import { getCampaignCoverageSummary } from '../campaigns.repository';
import { createVenue } from '../../locations/locations.repository';
import { CampaignStatus, CampaignType, LocationType } from '@prisma/client';

// Coverage summary must aggregate divisions/districts/venues/sessions/
// capacity straight from the DB (no full-session dump), dedupe correctly,
// and never surface a public "Unknown" location group — venues with no
// resolvable area fall into a clearly-labeled bucket instead.

describe('Campaign coverage summary aggregation', () => {
  let userId: string;
  let divisionA: { id: string };
  let districtA1: { id: string };
  let districtA2: { id: string };

  const createdCampaignIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVenueIds: string[] = [];
  const createdLegacyDivisionIds: string[] = [];
  const createdLegacyDistrictIds: string[] = [];
  const createdLegacyCityCorpIds: string[] = [];
  const createdLegacyZoneIds: string[] = [];

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

  async function createTestVenue(nameEn: string, locationId: string) {
    const venue = await createVenue({ name: `${nameEn} Venue ${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, address: 'Test address', locationId });
    createdVenueIds.push(venue.id);
    return venue;
  }

  async function createTestCampaign(title: string, status: CampaignStatus = CampaignStatus.registration_open) {
    const campaign = await prisma.campaign.create({
      data: {
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        campaignType: CampaignType.vaccination,
        status,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 2 * 86400000),
        createdById: userId,
      },
    });
    createdCampaignIds.push(campaign.id);
    return campaign;
  }

  async function addSession(campaignId: string, venueId: string, dayOffset: number, capacity = 50, bookedCount = 0) {
    return prisma.campaignSession.create({
      data: { campaignId, venueId, sessionDate: new Date(Date.now() + dayOffset * 86400000), startTime: '09:00', endTime: '12:00', capacity, bookedCount },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Coverage Test User', role: 'ADMIN' } });
    userId = user.id;

    divisionA = await createLocation(LocationType.DIVISION, 'Coverage Test Division');
    districtA1 = await createLocation(LocationType.DISTRICT, 'Coverage Test District One', divisionA.id);
    districtA2 = await createLocation(LocationType.DISTRICT, 'Coverage Test District Two', divisionA.id);
  });

  afterAll(async () => {
    await prisma.campaignSession.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: createdVenueIds } } });
    for (const id of [...createdLocationIds].reverse()) {
      await prisma.location.deleteMany({ where: { id } });
    }
    await prisma.zone.deleteMany({ where: { id: { in: createdLegacyZoneIds } } });
    await prisma.cityCorporation.deleteMany({ where: { id: { in: createdLegacyCityCorpIds } } });
    await prisma.district.deleteMany({ where: { id: { in: createdLegacyDistrictIds } } });
    await prisma.division.deleteMany({ where: { id: { in: createdLegacyDivisionIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('dedupes divisions/districts across multiple venues in the same area', async () => {
    const campaign = await createTestCampaign('Dedup Coverage Campaign');
    const venue1 = await createTestVenue('First', districtA1.id);
    const venue2 = await createTestVenue('Second', districtA1.id);
    await addSession(campaign.id, venue1.id, 1, 100, 20);
    await addSession(campaign.id, venue2.id, 2, 50, 50);

    const summary = await getCampaignCoverageSummary(campaign.id);

    expect(summary.divisionsCovered).toBe(1);
    expect(summary.districtsCovered).toBe(1);
    expect(summary.venues).toBe(2);
    expect(summary.sessions).toBe(2);
    expect(summary.totalCapacity).toBe(150);
    expect(summary.bookedCount).toBe(70);
    expect(summary.availableSlots).toBe(80);
    expect(summary.breakdown).toHaveLength(1);
    expect(summary.breakdown[0].districts).toHaveLength(1);
    expect(summary.breakdown[0].districts[0].venues).toHaveLength(2);
  });

  it('counts two distinct districts under the same division separately', async () => {
    const campaign = await createTestCampaign('Multi District Coverage Campaign');
    const venue1 = await createTestVenue('DistrictOne', districtA1.id);
    const venue2 = await createTestVenue('DistrictTwo', districtA2.id);
    await addSession(campaign.id, venue1.id, 1);
    await addSession(campaign.id, venue2.id, 2);

    const summary = await getCampaignCoverageSummary(campaign.id);

    expect(summary.divisionsCovered).toBe(1);
    expect(summary.districtsCovered).toBe(2);
    expect(summary.venues).toBe(2);
  });

  it('never surfaces a public "Unknown" group for a venue with no resolvable location, and excludes it from districtsCovered', async () => {
    const campaign = await createTestCampaign('No Location Coverage Campaign');
    const orphanVenue = await prisma.venue.create({
      data: { name: `Orphan Venue ${Date.now()}`, address: 'Somewhere, BD' },
    });
    createdVenueIds.push(orphanVenue.id);
    await addSession(campaign.id, orphanVenue.id, 1);

    const summary = await getCampaignCoverageSummary(campaign.id);

    expect(summary.venues).toBe(1);
    expect(summary.districtsCovered).toBe(0);
    expect(summary.divisionsCovered).toBe(0);
    const allNames = summary.breakdown.flatMap((d) => [d.name, ...d.districts.map((x) => x.name)]);
    expect(allNames.some((n) => n.toLowerCase() === 'unknown')).toBe(false);
  });

  it('falls back to the legacy Zone -> CityCorporation -> District -> Division chain when the unified location tree is not set', async () => {
    const legacyDivision = await prisma.division.create({
      data: { name: `Legacy Division ${Date.now()}`, country: { connectOrCreate: { where: { code: 'BD' }, create: { name: 'Bangladesh', code: 'BD' } } } },
    });
    createdLegacyDivisionIds.push(legacyDivision.id);
    const legacyDistrict = await prisma.district.create({ data: { name: `Legacy District ${Date.now()}`, divisionId: legacyDivision.id } });
    createdLegacyDistrictIds.push(legacyDistrict.id);
    const legacyCityCorp = await prisma.cityCorporation.create({ data: { name: `Legacy DSCC ${Date.now()}`, districtId: legacyDistrict.id } });
    createdLegacyCityCorpIds.push(legacyCityCorp.id);
    const legacyZone = await prisma.zone.create({ data: { name: `Legacy Zone ${Date.now()}`, cityCorporationId: legacyCityCorp.id } });
    createdLegacyZoneIds.push(legacyZone.id);

    const legacyVenue = await prisma.venue.create({
      data: { name: `Legacy Venue ${Date.now()}`, address: 'Legacy address', zoneId: legacyZone.id },
    });
    createdVenueIds.push(legacyVenue.id);

    const campaign = await createTestCampaign('Legacy Chain Coverage Campaign');
    await addSession(campaign.id, legacyVenue.id, 1);

    const summary = await getCampaignCoverageSummary(campaign.id);

    const districtNames = summary.breakdown.flatMap((d) => d.districts.map((x) => x.name));
    expect(districtNames).toContain(legacyDistrict.name);
    const divisionNames = summary.breakdown.map((d) => d.name);
    expect(divisionNames).toContain(legacyDivision.name);
  });

  // ── No silent truncation at realistic nationwide scale ──────────────
  // Coverage counts/breakdown must reflect the FULL campaign dataset, not
  // a partial/truncated slice — even at 64-district-class venue counts.
  it('returns every venue/district — no silent truncation — for a campaign with 70 venues across many districts', async () => {
    const districts = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createLocation(LocationType.DISTRICT, `Scale Test District ${i}`, divisionA.id)),
    );
    const campaign = await createTestCampaign('Nationwide Scale Coverage Campaign');
    const venues = await Promise.all(
      Array.from({ length: 70 }, (_, i) => createTestVenue(`Scale Venue ${i}`, districts[i % districts.length].id)),
    );
    await Promise.all(venues.map((v, i) => addSession(campaign.id, v.id, (i % 10) + 1)));

    const summary = await getCampaignCoverageSummary(campaign.id);

    expect(summary.venues).toBe(70);
    expect(summary.districtsCovered).toBe(20);
    const totalVenuesInBreakdown = summary.breakdown.reduce(
      (sum, division) => sum + division.districts.reduce((s, d) => s + d.venues.length, 0),
      0,
    );
    expect(totalVenuesInBreakdown).toBe(70);
    const totalDistrictsInBreakdown = summary.breakdown.reduce((sum, division) => sum + division.districts.length, 0);
    expect(totalDistrictsInBreakdown).toBe(20);
  });

  it('does not throw and returns a zeroed summary for a campaign with no sessions', async () => {
    const campaign = await createTestCampaign('Empty Coverage Campaign');
    const summary = await getCampaignCoverageSummary(campaign.id);

    expect(summary.venues).toBe(0);
    expect(summary.sessions).toBe(0);
    expect(summary.totalCapacity).toBe(0);
    expect(summary.breakdown).toHaveLength(0);
  });
});
