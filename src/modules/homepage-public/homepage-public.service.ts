import * as repo from './homepage-public.repository';
import {
  normalizeAppShowcase,
  normalizeClinic,
  normalizeDocument,
  normalizeNews,
  normalizeProgram,
  normalizeSpayOffer,
  normalizeVaccinationCampaign,
  normalizeVideo,
  normalizePlatformShowcase,
} from './homepage-public.normalizers';
import type { HomepageStatsDto, PublicHomepageResponseDto } from './homepage-public.types';

const FEATURED_CAMPAIGNS_LIMIT = 3;
const FEATURED_SPAY_OFFERS_LIMIT = 3;
const PROGRAMS_LIMIT = 12;
const FEATURED_VIDEOS_LIMIT = 6;
const FEATURED_CLINICS_LIMIT = 6;
const PUBLIC_DOCUMENTS_LIMIT = 20;
const NEWS_LIMIT = 6;
const APP_SHOWCASES_LIMIT = 10;

// ─── In-process TTL cache ──────────────────────────────────────────
// Same lightweight pattern as `src/modules/app/app.service.ts` (no shared
// cache infra exists in this codebase — see homepage-public research notes).
// This is what keeps the impact-statistics COUNT queries (and every other
// fan-out query below) from running on every single homepage request; it
// expires on its own rather than being invalidated on admin writes, which
// matches how `app.service.ts`/`site-settings` already behave.

type CacheEntry<T> = { expiresAt: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

/** Called by platform-showcase admin writes so publication/activation changes
 * cannot remain visible through the aggregate homepage cache. */
export function invalidatePlatformShowcasePublicCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith('homepage-public:aggregate:')) cache.delete(key);
  }
}

// Aggregation TTL: short enough that admins see published changes reflected
// quickly (matches the 15s Cache-Control window used below), long enough
// that the count()-heavy stats fan-out isn't re-run on every request.
const AGGREGATE_CACHE_TTL_MS = 15_000;
// Stats specifically get a longer TTL — these are slow-moving totals, not
// "just published" content, so there is no reason to recompute them as
// often as the rest of the homepage payload.
const STATS_CACHE_TTL_MS = 5 * 60_000;

async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  const value = await fn();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function getImpactStatistics(): Promise<HomepageStatsDto> {
  return withCache('homepage-public:stats', STATS_CACHE_TTL_MS, async () => {
    const raw = await repo.getImpactStatisticsRaw();
    return { ...raw, asOf: new Date().toISOString() };
  });
}

async function buildPublicHomepage(locale: string): Promise<PublicHomepageResponseDto> {
  const [
    vaccinationCampaigns,
    spayOffers,
    programs,
    videos,
    appShowcases,
    stats,
    clinics,
    documents,
    news,
    platformShowcases,
  ] = await Promise.all([
    repo.listFeaturedVaccinationCampaigns(FEATURED_CAMPAIGNS_LIMIT),
    repo.listFeaturedSpayOffers(FEATURED_SPAY_OFFERS_LIMIT),
    repo.listActivePrograms(PROGRAMS_LIMIT),
    repo.listFeaturedVideos(FEATURED_VIDEOS_LIMIT),
    repo.listAppShowcases(APP_SHOWCASES_LIMIT),
    getImpactStatistics(),
    repo.listFeaturedClinics(FEATURED_CLINICS_LIMIT),
    repo.listPublicDocuments(PUBLIC_DOCUMENTS_LIMIT),
    repo.listLatestNews(NEWS_LIMIT),
    repo.listPlatformShowcases(),
  ]);

  const featuredCampaigns = [
    ...vaccinationCampaigns.map(normalizeVaccinationCampaign),
    ...spayOffers.map(normalizeSpayOffer),
  ];

  return {
    locale,
    generatedAt: new Date().toISOString(),
    featuredCampaigns,
    programs: programs.map(normalizeProgram),
    featuredVideos: videos.map(normalizeVideo),
    apps: appShowcases.map(normalizeAppShowcase),
    platformShowcases: platformShowcases.map(normalizePlatformShowcase),
    stats,
    featuredClinics: clinics.map(normalizeClinic),
    documents: documents.map(normalizeDocument),
    news: news.map(normalizeNews),
  };
}

export async function getPublicHomepage(locale: string): Promise<PublicHomepageResponseDto> {
  return withCache(`homepage-public:aggregate:${locale}`, AGGREGATE_CACHE_TTL_MS, () =>
    buildPublicHomepage(locale),
  );
}
