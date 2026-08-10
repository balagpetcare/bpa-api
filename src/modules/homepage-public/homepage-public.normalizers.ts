import type {
  FeaturedCampaignDto,
  FeaturedCampaignPricingDto,
  FeaturedCampaignStatusLabel,
  HomepageAppInfoDto,
  HomepageAppPlatformLinkDto,
  HomepageClinicDto,
  HomepageDocumentDto,
  HomepageNewsDto,
  HomepageProgramDto,
  HomepageVideoDto,
  PublicMediaDto,
  PlatformShowcaseDto,
} from './homepage-public.types';
import type { PlatformShowcaseRow } from './homepage-public.repository';
import type { AppShowcaseRow, FeaturedCampaignRow, FeaturedSpayOfferRow } from './homepage-public.repository';

/** Decimal-safe numeric coercion — mirrors the duck-typed Decimal handling
 * in `src/utils/response.ts` `serializeData`, since these DTOs are built by
 * hand (not passed straight through `sendSuccess`'s auto-serialization). */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toMediaDto(
  media: { id: string; url: string; altText: string | null } | null | undefined,
): PublicMediaDto | null {
  if (!media) return null;
  return { id: media.id, url: media.url, altText: media.altText };
}

export function normalizePlatformShowcase(row: PlatformShowcaseRow): PlatformShowcaseDto {
  const { logoMedia, items, ...section } = row;
  const safe = (value: string | null): string | null => {
    if (!value) return null;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password ? value : null; }
    catch { return null; }
  };
  return {
    ...section,
    logo: toMediaDto(logoMedia),
    items: items.map(({ logoMedia: itemLogo, primaryPreviewMedia, secondaryPreviewMedia, links, ...item }) => ({
      ...item,
      ctaUrl: safe(item.ctaUrl),
      layoutOverride: item.layoutOverride as PlatformShowcaseDto['items'][number]['layoutOverride'],
      previewMode: item.previewMode as PlatformShowcaseDto['items'][number]['previewMode'],
      logo: toMediaDto(itemLogo),
      primaryPreview: toMediaDto(primaryPreviewMedia),
      secondaryPreview: toMediaDto(secondaryPreviewMedia),
      links: links.filter((link) => safe(link.url) !== null),
    })),
  };
}

/**
 * Resolves the homepage thumbnail contract from an ordered fallback chain
 * of candidate media rows — the first non-null candidate wins. Both
 * VACCINATION and SPAY_NEUTER normalizers call this so the homepage never
 * has to know which internal field(s) a given campaign type stores its
 * images under; a `null` result means no usable image exists anywhere in
 * the chain and the frontend renders its branded placeholder.
 */
function resolveThumbnail(
  candidates: Array<{ id: string; url: string; altText: string | null } | null | undefined>,
  fallbackAlt: string,
): { url: string | null; alt: string | null } {
  for (const candidate of candidates) {
    if (candidate) return { url: candidate.url, alt: candidate.altText || fallbackAlt };
  }
  return { url: null, alt: null };
}

/** De-dupes and caps a list of real place names — used for both campaign
 * session venues and spay-offer participating clinics. Never fabricates a
 * location; returns an empty array when none are configured. */
function summarizeLocations(names: Array<string | null | undefined>, max = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= max) break;
  }
  return result;
}

interface StatusComputation {
  statusLabel: FeaturedCampaignStatusLabel;
  isOpenForAction: boolean;
  ctaLabel: string;
}

/** Computes a presentation-only status label/CTA from the same live
 * status + window fields already on the record — never a stored value, so
 * it can never disagree with the real status/dates. */
function computeCampaignStatus(
  kind: 'VACCINATION' | 'SPAY_NEUTER',
  rawStatus: string,
  windowOpensAt: Date | null,
  windowClosesAt: Date | null,
  now: Date,
): StatusComputation {
  const openLabel: FeaturedCampaignStatusLabel = kind === 'VACCINATION' ? 'Registration Open' : 'Booking Open';
  const openCta = kind === 'VACCINATION' ? 'Register Now' : 'Book Now';
  const terminalStatuses = ['completed', 'cancelled', 'paused'];

  if (terminalStatuses.includes(rawStatus)) {
    return {
      statusLabel: rawStatus === 'completed' ? 'Completed' : 'Registration Closed',
      isOpenForAction: false,
      ctaLabel: 'View Details',
    };
  }

  const windowOpen = (!windowOpensAt || windowOpensAt <= now) && (!windowClosesAt || windowClosesAt > now);
  if (rawStatus === 'registration_open' || (kind === 'SPAY_NEUTER' && rawStatus === 'published' && windowOpen)) {
    return { statusLabel: openLabel, isOpenForAction: true, ctaLabel: openCta };
  }
  if (windowOpensAt && windowOpensAt > now) {
    return { statusLabel: 'Upcoming', isOpenForAction: false, ctaLabel: 'View Details' };
  }
  if (windowClosesAt && windowClosesAt <= now) {
    return { statusLabel: 'Registration Closed', isOpenForAction: false, ctaLabel: 'View Details' };
  }
  return { statusLabel: 'Upcoming', isOpenForAction: false, ctaLabel: 'View Details' };
}

export function normalizeVaccinationCampaign(campaign: FeaturedCampaignRow): FeaturedCampaignDto {
  const price = toNumber(campaign.basePriceBdt);
  const pricing: FeaturedCampaignPricingDto = { currency: 'BDT', amountFrom: price, amountTo: price };
  const now = new Date();
  const { statusLabel, isOpenForAction, ctaLabel } = computeCampaignStatus(
    'VACCINATION',
    campaign.status,
    campaign.registrationOpenAt,
    campaign.registrationCloseAt,
    now,
  );

  // Fallback priority: 1) dedicated homepage thumbnail, 2) existing cover
  // image, 3) legacy role=thumbnail campaign media, 4) null (placeholder).
  const thumbnail = resolveThumbnail(
    [campaign.homepageThumbnailMedia, campaign.coverImage, campaign.media?.[0]?.mediaFile],
    campaign.title,
  );

  return {
    id: campaign.id,
    kind: 'VACCINATION',
    slug: campaign.slug,
    title: campaign.title,
    summary: campaign.description,
    status: campaign.status,
    statusLabel,
    isOpenForAction,
    startDate: toIso(campaign.startDate),
    endDate: toIso(campaign.endDate),
    registrationOrBookingOpensAt: toIso(campaign.registrationOpenAt),
    registrationOrBookingClosesAt: toIso(campaign.registrationCloseAt),
    pricing,
    coverImage: toMediaDto(campaign.coverImage),
    thumbnailUrl: thumbnail.url,
    thumbnailAlt: thumbnail.alt,
    locationSummary: summarizeLocations(campaign.sessions.map((s) => s.venue.name)),
    ctaHref: `/campaigns/${campaign.slug}`,
    ctaLabel,
  };
}

export function normalizeSpayOffer(offer: FeaturedSpayOfferRow): FeaturedCampaignDto {
  const neuterPrice = toNumber(offer.neuterTotalPriceBdt);
  const spayPrice = toNumber(offer.spayTotalPriceBdt);
  const pricing: FeaturedCampaignPricingDto = {
    currency: 'BDT',
    amountFrom: Math.min(neuterPrice, spayPrice),
    amountTo: Math.max(neuterPrice, spayPrice),
  };
  const now = new Date();
  const { statusLabel, isOpenForAction, ctaLabel } = computeCampaignStatus(
    'SPAY_NEUTER',
    offer.status,
    offer.bookingOpensAt,
    offer.bookingClosesAt,
    now,
  );

  // Fallback priority: 1) dedicated homepage thumbnail, 2) web image,
  // 3) mobile image, 4) null (placeholder).
  const thumbnail = resolveThumbnail(
    [offer.homepageThumbnailMedia, offer.webImage, offer.mobileImage],
    offer.title,
  );

  return {
    id: offer.id,
    kind: 'SPAY_NEUTER',
    slug: offer.slug,
    title: offer.title,
    summary: offer.summary ?? offer.description ?? null,
    status: offer.status,
    statusLabel,
    isOpenForAction,
    startDate: toIso(offer.startsAt),
    endDate: toIso(offer.endsAt),
    registrationOrBookingOpensAt: toIso(offer.bookingOpensAt),
    registrationOrBookingClosesAt: toIso(offer.bookingClosesAt),
    pricing,
    coverImage: toMediaDto(offer.webImage ?? offer.mobileImage),
    thumbnailUrl: thumbnail.url,
    thumbnailAlt: thumbnail.alt,
    locationSummary: summarizeLocations(offer.clinics.map((c) => c.clinicBranch.branchName)),
    // The Spay & Neuter detail route is /spay-neuter/[offerId] and expects
    // the offer's id, not its slug (confirmed against
    // app/spay-neuter/[offerId]/page.tsx's generateStaticParams + fetch —
    // unlike the Campaign detail route, which is slug-based). Using the
    // slug here 404s.
    ctaHref: `/spay-neuter/${offer.id}`,
    ctaLabel,
  };
}

export function normalizeProgram(program: {
  id: string;
  key: string;
  titleEn: string;
  descriptionEn: string | null;
  iconKey: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  iconMedia: { id: string; url: string; altText: string | null } | null;
}): HomepageProgramDto {
  return {
    id: program.id,
    key: program.key,
    title: program.titleEn,
    description: program.descriptionEn,
    iconKey: program.iconKey,
    iconMedia: toMediaDto(program.iconMedia),
    ctaLabel: program.ctaLabel,
    ctaHref: program.ctaHref,
  };
}

export function normalizeVideo(post: {
  id: string;
  slug: string;
  titleEn?: string | null;
  titleBn?: string | null;
  summaryEn?: string | null;
  summaryBn?: string | null;
  thumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  videoProvider?: string | null;
  durationSeconds?: number | null;
  publishedAt: Date | null;
  category?: { nameEn: string | null } | null;
}): HomepageVideoDto {
  return {
    id: post.id,
    slug: post.slug,
    title: post.titleEn || post.titleBn || '',
    description: post.summaryEn || post.summaryBn || null,
    category: post.category?.nameEn ?? null,
    thumbnailUrl: post.thumbnailUrl || post.coverImageUrl || null,
    videoProvider: post.videoProvider ?? null,
    durationSeconds: post.durationSeconds ?? null,
    publishedAt: toIso(post.publishedAt),
  };
}

export function normalizeAppShowcase(app: AppShowcaseRow): HomepageAppInfoDto {
  const platforms: HomepageAppPlatformLinkDto[] = app.platforms.map((p) => ({
    platform: p.platform,
    availability: p.availability,
    // Defensive: a store URL must never reach the frontend on a platform
    // that isn't LIVE, regardless of what the admin write path did — this
    // is the one guarantee this endpoint makes, not just a convention.
    storeUrl: p.availability === 'LIVE' ? p.storeUrl : null,
    qrCode: toMediaDto(p.qrCodeMedia),
  }));

  return {
    appKey: app.appKey,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    relationshipLabel: app.relationshipLabel,
    icon: toMediaDto(app.iconMedia),
    features: app.features.map((f) => f.label),
    screenshots: app.screenshots.map((s) => toMediaDto(s.mediaFile)).filter((m): m is PublicMediaDto => m !== null),
    platforms,
  };
}

export function normalizeClinic(branch: {
  id: string;
  slug: string | null;
  branchName: string;
  area: string | null;
  district: string | null;
  organization?: { logoMedia?: { id: string; url: string; altText: string | null } | null } | null;
}): HomepageClinicDto {
  return {
    id: branch.id,
    slug: branch.slug,
    name: branch.branchName,
    area: branch.area,
    district: branch.district,
    logo: toMediaDto(branch.organization?.logoMedia ?? null),
  };
}

export function normalizeDocument(doc: {
  id: string;
  key: string;
  titleEn: string;
  category: string;
  summary: string | null;
  version: string | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  fileMedia: { url: string } | null;
}): HomepageDocumentDto {
  return {
    id: doc.id,
    key: doc.key,
    title: doc.titleEn,
    category: doc.category,
    summary: doc.summary,
    url: doc.fileMedia?.url ?? doc.externalUrl ?? null,
    version: doc.version,
    publishedAt: toIso(doc.publishedAt),
  };
}

export function normalizeNews(news: {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  coverImage?: { url: string } | null;
}): HomepageNewsDto {
  return {
    id: news.id,
    slug: news.slug,
    title: news.title,
    excerpt: news.excerpt,
    coverImageUrl: news.coverImage?.url ?? null,
    publishedAt: toIso(news.publishedAt),
  };
}
