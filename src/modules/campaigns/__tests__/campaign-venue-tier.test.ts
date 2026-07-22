import { prisma } from '../../../database/prisma';
import { getCampaignBySlug, filterSessionsByBestTier } from '../campaigns.repository';
import { createVenue } from '../../locations/locations.repository';
import { CampaignStatus, CampaignType, LocationType } from '@prisma/client';

// A single already-selected campaign's own venues/sessions must be filtered
// to ONE best-matching proximity tier relative to the visitor's selected
// location — never a mix of a nearer tier and a broader one. Builds a real
// Division -> District -> Upazila -> Union chain (Outside Dhaka) and a
// City Corporation -> Zone -> Ward chain (Dhaka City), attaches real venues
// and sessions at specific levels, and asserts the returned session list.

describe('Campaign venue/session best-tier filtering (registration Step 1)', () => {
  let userId: string;
  let division: { id: string };
  let district: { id: string };
  let upazila: { id: string };
  let union: { id: string };
  // A second, unrelated District/Upazila/Union branch under the same Division —
  // simulates "Gopalganj vs Madaripur" siblings that must never leak in.
  let otherDistrict: { id: string };
  let otherUpazila: { id: string };
  let otherUnion: { id: string };
  let cityCorp: { id: string };
  let zone: { id: string };
  let ward: { id: string };

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

  async function createTestVenue(nameEn: string, locationId: string) {
    const venue = await createVenue({ name: `${nameEn} Venue ${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, address: 'Test address', locationId });
    createdVenueIds.push(venue.id);
    return venue;
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

  async function addSession(campaignId: string, venueId: string, dayOffset: number) {
    return prisma.campaignSession.create({
      data: {
        campaignId,
        venueId,
        sessionDate: new Date(Date.now() + dayOffset * 86400000),
        startTime: '09:00',
        endTime: '12:00',
        capacity: 50,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: 'Venue Tier Test User', role: 'ADMIN' } });
    userId = user.id;

    division = await createLocation(LocationType.DIVISION, 'Tier Test Division');
    district = await createLocation(LocationType.DISTRICT, 'Tier Test District', division.id);
    upazila = await createLocation(LocationType.UPAZILA, 'Tier Test Upazila', district.id);
    union = await createLocation(LocationType.UNION, 'Tier Test Union', upazila.id);

    otherDistrict = await createLocation(LocationType.DISTRICT, 'Tier Test Other District', division.id);
    otherUpazila = await createLocation(LocationType.UPAZILA, 'Tier Test Other Upazila', otherDistrict.id);
    otherUnion = await createLocation(LocationType.UNION, 'Tier Test Other Union', otherUpazila.id);

    cityCorp = await createLocation(LocationType.CITY_CORPORATION, 'Tier Test City Corp');
    zone = await createLocation(LocationType.CITY_ZONE, 'Tier Test Zone', cityCorp.id);
    ward = await createLocation(LocationType.WARD, 'Tier Test Ward', zone.id);
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

  it('shows only Union-tier sessions when the exact Union has a venue', async () => {
    const campaign = await createTestCampaign('Union Exact Match Campaign');
    const unionVenue = await createTestVenue('Union', union.id);
    const districtVenue = await createTestVenue('District', district.id);
    await addSession(campaign.id, unionVenue.id, 1);
    await addSession(campaign.id, districtVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('exact');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(unionVenue.id);
  });

  it('falls back to Upazila-only sessions when the Union has none, ignoring District venues in the same response', async () => {
    const campaign = await createTestCampaign('Upazila Fallback Campaign');
    const upazilaVenue = await createTestVenue('Upazila', upazila.id);
    const districtVenue = await createTestVenue('District', district.id);
    await addSession(campaign.id, upazilaVenue.id, 1);
    await addSession(campaign.id, districtVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('upazila');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(upazilaVenue.id);
  });

  it('falls back to District-only sessions when Union and Upazila have none', async () => {
    const campaign = await createTestCampaign('District Fallback Campaign');
    const districtVenue = await createTestVenue('District', district.id);
    const divisionVenue = await createTestVenue('Division', division.id);
    await addSession(campaign.id, districtVenue.id, 1);
    await addSession(campaign.id, divisionVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('district');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(districtVenue.id);
  });

  it('does not leak an unrelated sibling district (Madaripur/Gopalganj style) into a District-tier match', async () => {
    const campaign = await createTestCampaign('Sibling District Isolation Campaign');
    const ourDistrictVenue = await createTestVenue('Our District', district.id);
    const otherDistrictVenue = await createTestVenue('Other District', otherDistrict.id);
    await addSession(campaign.id, ourDistrictVenue.id, 1);
    await addSession(campaign.id, otherDistrictVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('district');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(ourDistrictVenue.id);
  });

  it('falls back to a sibling District/Upazila/Union within the same Division when the selected one has none', async () => {
    const campaign = await createTestCampaign('Same Division Sibling Campaign');
    const otherUnionVenue = await createTestVenue('Unrelated Union', otherUnion.id);
    await addSession(campaign.id, otherUnionVenue.id, 1);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('division');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(otherUnionVenue.id);
  });

  it('returns an empty state (never unrelated venues) when nothing exists anywhere in the same division', async () => {
    const campaign = await createTestCampaign('Empty Fallback Campaign');
    const dhakaVenue = await createTestVenue('Unrelated Dhaka', ward.id);
    await addSession(campaign.id, dhakaVenue.id, 1);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('empty');
    expect(result.sessions).toHaveLength(0);
  });

  it('falls back to same-Division sessions when District/Upazila/Union all have none, never crossing into an unrelated division', async () => {
    const campaign = await createTestCampaign('Division Fallback Campaign');
    const divisionVenue = await createTestVenue('Division', division.id);
    const dhakaVenue = await createTestVenue('Unrelated Dhaka', ward.id);
    await addSession(campaign.id, divisionVenue.id, 1);
    await addSession(campaign.id, dhakaVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, union.id);

    expect(result.venueMatch.tier).toBe('division');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(divisionVenue.id);
  });

  it('Dhaka City path: falls back Ward -> Zone -> City Corporation without mixing tiers', async () => {
    const campaign = await createTestCampaign('Dhaka Ward Fallback Campaign');
    const zoneVenue = await createTestVenue('Zone', zone.id);
    const cityCorpVenue = await createTestVenue('City Corp', cityCorp.id);
    await addSession(campaign.id, zoneVenue.id, 1);
    await addSession(campaign.id, cityCorpVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, ward.id);

    expect(result.venueMatch.tier).toBe('zone');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(zoneVenue.id);
  });

  it('Dhaka City path never leaks unrelated districts (Madaripur/Gopalganj) when only City Corp has a venue', async () => {
    const campaign = await createTestCampaign('Dhaka Vs Unrelated District Campaign');
    const cityCorpVenue = await createTestVenue('City Corp', cityCorp.id);
    const unrelatedDistrictVenue = await createTestVenue('Unrelated District', otherDistrict.id);
    await addSession(campaign.id, cityCorpVenue.id, 1);
    await addSession(campaign.id, unrelatedDistrictVenue.id, 2);

    const full = await getCampaignBySlug(campaign.slug);
    const result = await filterSessionsByBestTier(full!, ward.id);

    expect(result.venueMatch.tier).toBe('dhaka_city_corp');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].venue!.id).toBe(cityCorpVenue.id);
  });
});
