import { prisma } from '../../database/prisma';
import { CampaignStatus, CampaignType, SpayOfferStatus } from '@prisma/client';
import { listPosts as listContentPosts } from '../content/content.repository';
import { findPublishedBranches } from '../clinics/clinics-public.repository';
import { findManyNews } from '../news/news.repository';

// ─── Vaccination campaigns ───────────────────────────────────────
// Deliberately narrower than campaigns.repository.ts's own
// `listFeaturedCampaigns` (which mixes every CampaignType together and adds
// `_count`/media/service data the homepage card doesn't need) — this is a
// minimal, homepage-scoped select for `campaignType: vaccination` only.
// `sessions.venue.name` is the source for the card's real location summary
// — the concrete place the campaign actually runs, not the more abstract
// CampaignCoverage location-tree entries used for discovery filtering.

const featuredCampaignSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  status: true,
  startDate: true,
  endDate: true,
  registrationOpenAt: true,
  registrationCloseAt: true,
  basePriceBdt: true,
  coverImage: { select: { id: true, url: true, altText: true } },
  homepageThumbnailMedia: { select: { id: true, url: true, altText: true } },
  // Legacy fallback for pre-existing campaigns that never had a cover image
  // set either: the role=thumbnail entry from the campaign media manager,
  // if one exists. See normalizeVaccinationCampaign() fallback chain.
  media: {
    where: { role: 'thumbnail' } as const,
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { mediaFile: { select: { id: true, url: true, altText: true } } },
  },
  // `distinct` isn't supported inside a nested relation query — venue names
  // are de-duplicated in the normalizer instead, after fetching a few extra
  // rows to make a post-dedupe cap of 3 names likely.
  sessions: {
    where: { isActive: true },
    select: { venue: { select: { name: true } } },
    orderBy: { sessionDate: 'asc' as const },
    take: 6,
  },
} as const;

const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.published,
  CampaignStatus.registration_open,
];

export async function listFeaturedVaccinationCampaigns(limit: number) {
  const now = new Date();
  return prisma.campaign.findMany({
    where: {
      campaignType: CampaignType.vaccination,
      status: { in: ACTIVE_CAMPAIGN_STATUSES },
      OR: [{ registrationCloseAt: null }, { registrationCloseAt: { gt: now } }, { endDate: { gte: now } }],
    },
    orderBy: [{ isFeatured: 'desc' }, { startDate: 'asc' }],
    take: limit,
    select: featuredCampaignSelect,
  });
}

export type FeaturedCampaignRow = Awaited<ReturnType<typeof listFeaturedVaccinationCampaigns>>[number];

// ─── Spay & Neuter offers ─────────────────────────────────────────
// A homepage-scoped select distinct from spay-neuter.availability.service's
// `listPublicOffers()` (which returns policy/eligibility/contact text the
// homepage card never shows) — this adds `clinics.clinicBranch` for the
// card's real location/clinic summary instead.

const featuredSpayOfferSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  description: true,
  status: true,
  neuterTotalPriceBdt: true,
  spayTotalPriceBdt: true,
  startsAt: true,
  endsAt: true,
  bookingOpensAt: true,
  bookingClosesAt: true,
  mobileImage: { select: { id: true, url: true, altText: true } },
  webImage: { select: { id: true, url: true, altText: true } },
  homepageThumbnailMedia: { select: { id: true, url: true, altText: true } },
  clinics: {
    where: { isActive: true },
    select: { clinicBranch: { select: { branchName: true, area: true, district: true } } },
    take: 3,
  },
} as const;

export async function listFeaturedSpayOffers(limit: number) {
  const now = new Date();
  return prisma.spayOffer.findMany({
    where: {
      status: SpayOfferStatus.published,
      deletedAt: null,
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: [{ featuredOnHomepage: 'desc' }, { startsAt: 'asc' }],
    take: limit,
    select: featuredSpayOfferSelect,
  });
}

export type FeaturedSpayOfferRow = Awaited<ReturnType<typeof listFeaturedSpayOffers>>[number];

// ─── Core BPA programs ────────────────────────────────────────────

export async function listActivePrograms(limit: number) {
  return prisma.bpaProgram.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: {
      id: true,
      key: true,
      titleEn: true,
      descriptionEn: true,
      iconKey: true,
      ctaLabel: true,
      ctaHref: true,
      iconMedia: { select: { id: true, url: true, altText: true } },
    },
  });
}

// ─── Featured videos ──────────────────────────────────────────────

export async function listFeaturedVideos(limit: number) {
  const result = await listContentPosts({
    type: 'VIDEO',
    status: 'published',
    showOnHomepage: true,
    limit,
  });
  return result.items;
}

// ─── App showcase (BPA / Furtail) ─────────────────────────────────
// `platforms[].storeUrl` is only ever non-null when `availability` is
// 'LIVE' — enforced by the admin write layer, not re-checked here, since
// this is a read path. The normalizer still defensively nulls out any
// storeUrl on a non-LIVE row (see homepage-public.normalizers.ts) so a
// future write-path bug can never leak a fake-looking store button.

export async function listAppShowcases(limit: number) {
  return prisma.appShowcase.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: {
      appKey: true,
      name: true,
      tagline: true,
      description: true,
      relationshipLabel: true,
      iconMedia: { select: { id: true, url: true, altText: true } },
      features: {
        orderBy: { sortOrder: 'asc' },
        select: { label: true },
      },
      screenshots: {
        orderBy: { sortOrder: 'asc' },
        select: { mediaFile: { select: { id: true, url: true, altText: true } } },
      },
      platforms: {
        orderBy: { sortOrder: 'asc' },
        select: {
          platform: true,
          availability: true,
          storeUrl: true,
          qrCodeMedia: { select: { id: true, url: true, altText: true } },
        },
      },
    },
  });
}

export type AppShowcaseRow = Awaited<ReturnType<typeof listAppShowcases>>[number];

export async function listPlatformShowcases() {
  return prisma.platformShowcaseSection.findMany({
    where: { status: 'published', isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      key: true, eyebrow: true, title: true, subtitle: true, description: true, layout: true, theme: true,
      logoMedia: { select: { id: true, url: true, altText: true } },
      items: {
        where: { isActive: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          platformKey: true, brandKey: true, platformType: true, name: true, badgeText: true, heading: true,
          subheading: true, description: true, featureBullets: true, ctaText: true, ctaUrl: true,
          layoutOverride: true, previewMode: true, featured: true,
          logoMedia: { select: { id: true, url: true, altText: true } },
          primaryPreviewMedia: { select: { id: true, url: true, altText: true } },
          secondaryPreviewMedia: { select: { id: true, url: true, altText: true } },
          links: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], select: { type: true, label: true, url: true, qrEnabled: true, qrCaption: true, openInNewTab: true } },
        },
      },
    },
  });
}
export type PlatformShowcaseRow = Awaited<ReturnType<typeof listPlatformShowcases>>[number];

// ─── Featured clinics ─────────────────────────────────────────────
// Reuses the existing published-branch query with the same `featured` flag
// the admin-curated clinic directory already exposes — never a second,
// diverging "is this clinic featured" concept.

export async function listFeaturedClinics(limit: number) {
  const branches = await findPublishedBranches({ featured: true });
  return branches.slice(0, limit);
}

// ─── Public/governance documents ─────────────────────────────────
// "Public" means explicitly `isActive: true` AND a `publishedAt` in the
// past — a document with `isActive: true` but no publishedAt (or one
// scheduled in the future) is still a draft as far as this read path is
// concerned. This is the one gate between the admin's document catalog and
// anything ever reaching an unauthenticated visitor.

const publicDocumentSelect = {
  id: true,
  key: true,
  titleEn: true,
  category: true,
  summary: true,
  version: true,
  publishedAt: true,
  externalUrl: true,
  fileMedia: { select: { url: true } },
} as const;

function publicDocumentWhere(now: Date, category?: string) {
  return {
    isActive: true,
    publishedAt: { not: null, lte: now },
    ...(category ? { category: category as never } : {}),
  };
}

export async function listPublicDocuments(limit: number) {
  return prisma.publicDocument.findMany({
    where: publicDocumentWhere(new Date()),
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: publicDocumentSelect,
  });
}

/** Full, paginated public document catalog — backs `GET /public/documents`, the "supporting page" the homepage teaser links out to. */
export async function listPublicDocumentsPage(params: { category?: string; page: number; limit: number }) {
  const now = new Date();
  const where = publicDocumentWhere(now, params.category);
  const skip = (params.page - 1) * params.limit;

  const [items, total] = await Promise.all([
    prisma.publicDocument.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      skip,
      take: params.limit,
      select: publicDocumentSelect,
    }),
    prisma.publicDocument.count({ where }),
  ]);

  return { items, total };
}

// ─── News/resources ────────────────────────────────────────────────

export async function listLatestNews(limit: number) {
  return findManyNews({ status: 'published' }, 0, limit);
}

// ─── Impact statistics ────────────────────────────────────────────
// Real, live counts — never estimates, never hardcoded. Callers MUST wrap
// this in a cache (see homepage-public.service.ts) since it issues several
// `count()`/`findMany` queries and must never run on every homepage
// request.

export async function getImpactStatisticsRaw() {
  const [animalsVaccinated, spayNeuterCompleted, activeMembers, partnerClinics, districtRows] = await Promise.all([
    prisma.vaccinationRecord.count(),
    prisma.spayBooking.count({ where: { status: 'completed' } }),
    prisma.membership.count({ where: { status: 'active' } }),
    prisma.clinicBranch.count({ where: { published: true, archivedAt: null } }),
    prisma.clinicBranch.findMany({
      where: { published: true, archivedAt: null, district: { not: null } },
      distinct: ['district'],
      select: { district: true },
    }),
  ]);

  return {
    animalsVaccinated,
    spayNeuterCompleted,
    activeMembers,
    partnerClinics,
    districtsReached: districtRows.length,
  };
}
