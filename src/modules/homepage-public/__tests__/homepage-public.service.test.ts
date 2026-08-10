jest.mock('../homepage-public.repository', () => ({
  listFeaturedVaccinationCampaigns: jest.fn(),
  listFeaturedSpayOffers: jest.fn(),
  listActivePrograms: jest.fn(),
  listFeaturedVideos: jest.fn(),
  listAppShowcases: jest.fn(),
  listFeaturedClinics: jest.fn(),
  listPublicDocuments: jest.fn(),
  listLatestNews: jest.fn(),
  getImpactStatisticsRaw: jest.fn(),
}));

import * as repo from '../homepage-public.repository';
import { getPublicHomepage } from '../homepage-public.service';

const mocked = repo as jest.Mocked<typeof repo>;

function resetMocks() {
  mocked.listFeaturedVaccinationCampaigns.mockResolvedValue([
    {
      id: 'c1',
      slug: 'vax-campaign',
      title: 'Vax Campaign',
      description: null,
      status: 'published',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-10T00:00:00Z'),
      registrationOpenAt: null,
      registrationCloseAt: null,
      basePriceBdt: 100 as unknown as never,
      coverImage: null,
      sessions: [],
    },
  ] as any);
  mocked.listFeaturedSpayOffers.mockResolvedValue([
    {
      id: 's1',
      slug: 'spay-offer',
      title: 'Spay Offer',
      summary: null,
      description: null,
      status: 'published',
      startsAt: null,
      endsAt: null,
      bookingOpensAt: null,
      bookingClosesAt: null,
      neuterTotalPriceBdt: 1000 as unknown as never,
      spayTotalPriceBdt: 1200 as unknown as never,
      mobileImage: null,
      webImage: null,
      clinics: [],
    },
  ] as any);
  mocked.listActivePrograms.mockResolvedValue([]);
  mocked.listFeaturedVideos.mockResolvedValue([]);
  mocked.listAppShowcases.mockResolvedValue([]);
  mocked.listFeaturedClinics.mockResolvedValue([]);
  mocked.listPublicDocuments.mockResolvedValue([]);
  mocked.listLatestNews.mockResolvedValue([]);
  mocked.getImpactStatisticsRaw.mockResolvedValue({
    animalsVaccinated: 10,
    spayNeuterCompleted: 5,
    activeMembers: 3,
    partnerClinics: 2,
    districtsReached: 1,
  });
}

// The service keeps its cache in a module-level Map with no test-only reset
// hook (deliberately — it's the same minimal pattern as `app.service.ts`'s
// cache). To keep these tests isolated from each other without reaching
// into that internal state, every test uses a locale string it never
// reuses, so each test's calls are guaranteed a fresh cache key.
describe('getPublicHomepage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it('merges vaccination campaigns and spay offers into one normalized featuredCampaigns list', async () => {
    const result = await getPublicHomepage('locale-merge-test');

    expect(result.featuredCampaigns).toHaveLength(2);
    expect(result.featuredCampaigns.map((c) => c.kind).sort()).toEqual(['SPAY_NEUTER', 'VACCINATION']);
    expect(result.featuredCampaigns.every((c) => 'pricing' in c && 'ctaHref' in c)).toBe(true);
  });

  it('includes live-computed stats, never hardcoded values', async () => {
    const result = await getPublicHomepage('locale-stats-test');

    expect(result.stats).toMatchObject({
      animalsVaccinated: 10,
      spayNeuterCompleted: 5,
      activeMembers: 3,
      partnerClinics: 2,
      districtsReached: 1,
    });
    expect(typeof result.stats.asOf).toBe('string');
  });

  it('does not re-run the repository fan-out on a second call within the cache window', async () => {
    await getPublicHomepage('locale-no-rerun-test');
    await getPublicHomepage('locale-no-rerun-test');

    expect(mocked.listFeaturedVaccinationCampaigns).toHaveBeenCalledTimes(1);
  });

  it('caches each locale independently', async () => {
    await getPublicHomepage('locale-independent-a');
    await getPublicHomepage('locale-independent-b');

    expect(mocked.listFeaturedVaccinationCampaigns).toHaveBeenCalledTimes(2);
  });
});
