import { prisma } from '../../../database/prisma';
import { discoverCampaignsByLocation } from '../campaigns.repository';
import { addCoverage, removeCoverage, listCoverages } from '../campaigns.service';
import { CampaignStatus, CampaignType, LocationType } from '@prisma/client';

// Integration tests against the real dev database (same pattern as
// donations.service.test.ts) — builds a throwaway Division -> District ->
// Upazila -> Union chain and a City Corporation -> Zone -> Ward chain, plus
// test campaigns, then exercises the location-first discovery fallback.

describe('Location-first campaign discovery', () => {
  let userId: string;
  let division: { id: string };
  let district: { id: string };
  let upazila: { id: string };
  let union: { id: string };
  let cityCorp: { id: string };
  let zone: { id: string };
  let ward: { id: string };

  const createdCampaignIds: string[] = [];
  const createdLocationIds: string[] = [];

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

  async function createTestCampaign(title: string) {
    const campaign = await prisma.campaign.create({
      data: {
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        campaignType: CampaignType.vaccination,
        status: CampaignStatus.registration_open,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 2 * 86400000),
        createdById: userId,
      },
    });
    createdCampaignIds.push(campaign.id);
    return campaign;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Coverage Test User', role: 'ADMIN' } });
    userId = user.id;

    division = await createLocation(LocationType.DIVISION, 'Test Division');
    district = await createLocation(LocationType.DISTRICT, 'Test District', division.id);
    upazila = await createLocation(LocationType.UPAZILA, 'Test Upazila', district.id);
    union = await createLocation(LocationType.UNION, 'Test Union', upazila.id);

    cityCorp = await createLocation(LocationType.CITY_CORPORATION, 'Test City Corp');
    zone = await createLocation(LocationType.CITY_ZONE, 'Test Zone', cityCorp.id);
    ward = await createLocation(LocationType.WARD, 'Test Ward', zone.id);
  });

  afterAll(async () => {
    await prisma.campaignCoverage.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    // Children must go before parents (FK constraint) — reverse creation order.
    for (const id of [...createdLocationIds].reverse()) {
      await prisma.location.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('matches a campaign with direct Union coverage', async () => {
    const campaign = await createTestCampaign('Union Direct Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: union.id } });

    const results = await discoverCampaignsByLocation(union.id);
    const match = results.find((r) => r.campaign.id === campaign.id);
    expect(match).toBeDefined();
    expect(match?.matchedLevel).toBe('UNION');
  });

  it('falls back from Union to Upazila coverage', async () => {
    const campaign = await createTestCampaign('Upazila Fallback Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: upazila.id } });

    const results = await discoverCampaignsByLocation(union.id);
    const match = results.find((r) => r.campaign.id === campaign.id);
    expect(match).toBeDefined();
    expect(match?.matchedLevel).toBe('UPAZILA');
  });

  it('falls back from Union to District coverage', async () => {
    const campaign = await createTestCampaign('District Fallback Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: district.id } });

    const results = await discoverCampaignsByLocation(union.id);
    const match = results.find((r) => r.campaign.id === campaign.id);
    expect(match).toBeDefined();
    expect(match?.matchedLevel).toBe('DISTRICT');
  });

  it('falls back from Union to Division coverage', async () => {
    const campaign = await createTestCampaign('Division Fallback Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: division.id } });

    const results = await discoverCampaignsByLocation(union.id);
    const match = results.find((r) => r.campaign.id === campaign.id);
    expect(match).toBeDefined();
    expect(match?.matchedLevel).toBe('DIVISION');
  });

  it('prefers the most specific coverage when multiple levels match the same campaign', async () => {
    const campaign = await createTestCampaign('Multi-level Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: division.id } });
    await prisma.campaignCoverage.create({ data: { campaignId: campaign.id, locationId: union.id } });

    const results = await discoverCampaignsByLocation(union.id);
    const match = results.find((r) => r.campaign.id === campaign.id);
    expect(match?.matchedLevel).toBe('UNION');
  });

  it('returns an empty array (not an error) when no campaign covers the area', async () => {
    // Fresh, totally isolated Union with no ancestors covered and no nationwide campaign in play.
    const isolatedDivision = await createLocation(LocationType.DIVISION, 'Isolated Division');
    const isolatedDistrict = await createLocation(LocationType.DISTRICT, 'Isolated District', isolatedDivision.id);
    const isolatedUpazila = await createLocation(LocationType.UPAZILA, 'Isolated Upazila', isolatedDistrict.id);
    const isolatedUnion = await createLocation(LocationType.UNION, 'Isolated Union', isolatedUpazila.id);

    const results = await discoverCampaignsByLocation(isolatedUnion.id);
    expect(results).toEqual([]);
  });

  it('matches nationwide coverage regardless of selected location, but a specific match outranks it', async () => {
    const nationwideCampaign = await createTestCampaign('Nationwide Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: nationwideCampaign.id, isNationwide: true } });

    const resultsAtUnion = await discoverCampaignsByLocation(union.id);
    const nationwideMatch = resultsAtUnion.find((r) => r.campaign.id === nationwideCampaign.id);
    expect(nationwideMatch?.matchedLevel).toBe('NATIONWIDE');

    // Same campaign also has a more specific Union coverage -> Union should win.
    await prisma.campaignCoverage.create({ data: { campaignId: nationwideCampaign.id, locationId: union.id } });
    const resultsAfter = await discoverCampaignsByLocation(union.id);
    const specificMatch = resultsAfter.find((r) => r.campaign.id === nationwideCampaign.id);
    expect(specificMatch?.matchedLevel).toBe('UNION');
  });

  it('Dhaka City path: Ward falls back to Zone, then City Corporation', async () => {
    const zoneCampaign = await createTestCampaign('Zone Fallback Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: zoneCampaign.id, locationId: zone.id } });

    let results = await discoverCampaignsByLocation(ward.id);
    expect(results.find((r) => r.campaign.id === zoneCampaign.id)?.matchedLevel).toBe('CITY_ZONE');

    const cityCorpCampaign = await createTestCampaign('City Corp Fallback Campaign');
    await prisma.campaignCoverage.create({ data: { campaignId: cityCorpCampaign.id, locationId: cityCorp.id } });

    results = await discoverCampaignsByLocation(ward.id);
    expect(results.find((r) => r.campaign.id === cityCorpCampaign.id)?.matchedLevel).toBe('CITY_CORPORATION');
  });

  it('rejects a duplicate nationwide coverage row for the same campaign with a conflict error', async () => {
    const campaign = await createTestCampaign('Duplicate Nationwide Campaign');
    await addCoverage(campaign.id, { isNationwide: true });

    await expect(addCoverage(campaign.id, { isNationwide: true })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a duplicate (campaign, location) coverage pair with a conflict error', async () => {
    const campaign = await createTestCampaign('Duplicate Location Campaign');
    await addCoverage(campaign.id, { locationId: union.id });

    await expect(addCoverage(campaign.id, { locationId: union.id })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('admin add/delete coverage round-trip is immediately reflected in public discovery', async () => {
    const campaign = await createTestCampaign('Round Trip Campaign');

    let results = await discoverCampaignsByLocation(union.id);
    expect(results.find((r) => r.campaign.id === campaign.id)).toBeUndefined();

    const coverage = await addCoverage(campaign.id, { locationId: union.id });
    results = await discoverCampaignsByLocation(union.id);
    expect(results.find((r) => r.campaign.id === campaign.id)).toBeDefined();

    await removeCoverage(campaign.id, coverage.id);
    results = await discoverCampaignsByLocation(union.id);
    expect(results.find((r) => r.campaign.id === campaign.id)).toBeUndefined();

    const remaining = await listCoverages(campaign.id);
    expect(remaining).toEqual([]);
  });
});
