import { z } from 'zod';

// Same normalisation pattern as the existing homepage module's
// `localeSchema` — empty-string query params default to "en".
const localeSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || 'en')
  .pipe(z.string().min(2).max(10));

export const publicHomepageQuerySchema = z.object({
  locale: localeSchema.optional(),
});

export type PublicHomepageQuery = z.infer<typeof publicHomepageQuerySchema>;

// ─── Shared value types ─────────────────────────────────────────

export interface PublicMediaDto {
  id: string;
  url: string;
  altText: string | null;
}

// ─── Featured Campaign (normalized union) ──────────────────────
// The web frontend renders vaccination campaigns and Spay & Neuter offers
// with a single card component, so both are normalized into this one shape
// here rather than the frontend needing to know the internal schema
// differences between `Campaign` and `SpayOffer`. Every field is read live
// from its source record at request time — nothing here is copied into a
// separate table, so prices/dates can never drift from the source of truth.

export type FeaturedCampaignKind = 'VACCINATION' | 'SPAY_NEUTER';

export interface FeaturedCampaignPricingDto {
  currency: 'BDT';
  amountFrom: number;
  amountTo: number;
}

// Human-readable, presentation-only summary of the raw `status` — computed
// server-side from the same live status/date fields, never a separate
// stored value, so it can never drift from the real status.
export type FeaturedCampaignStatusLabel =
  | 'Registration Open'
  | 'Booking Open'
  | 'Upcoming'
  | 'Registration Closed'
  | 'Completed';

export interface FeaturedCampaignDto {
  id: string;
  kind: FeaturedCampaignKind;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  statusLabel: FeaturedCampaignStatusLabel;
  isOpenForAction: boolean;
  startDate: string | null;
  endDate: string | null;
  registrationOrBookingOpensAt: string | null;
  registrationOrBookingClosesAt: string | null;
  pricing: FeaturedCampaignPricingDto | null;
  coverImage: PublicMediaDto | null;
  /**
   * Normalized homepage thumbnail contract — identical shape for both
   * VACCINATION and SPAY_NEUTER kinds regardless of which internal media
   * field(s) each source model has. Resolved server-side through a fallback
   * chain (dedicated homepage thumbnail → existing web/cover image → legacy
   * campaign media → null); the frontend never needs to know the difference
   * between a Campaign and a SpayOffer to render a card image.
   */
  thumbnailUrl: string | null;
  thumbnailAlt: string | null;
  /** Real venue/clinic names for this campaign — never a fabricated location. Empty array if none configured yet. */
  locationSummary: string[];
  ctaHref: string;
  ctaLabel: string;
}

// ─── Core BPA programs ──────────────────────────────────────────

export interface HomepageProgramDto {
  id: string;
  key: string;
  title: string;
  description: string | null;
  iconKey: string | null;
  iconMedia: PublicMediaDto | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

// ─── Featured videos ─────────────────────────────────────────────

export interface HomepageVideoDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnailUrl: string | null;
  videoProvider: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
}

// ─── App showcase (BPA / Furtail) ─────────────────────────────────
// `storeUrl` is present ONLY when `availability` is 'LIVE' — a
// COMING_SOON/BETA platform link is surfaced with `storeUrl: null` so the
// frontend can never render a working-looking store button for an app that
// isn't actually published yet (see AppShowcasePlatformLink in schema.prisma).

export interface HomepageAppPlatformLinkDto {
  platform: 'ANDROID' | 'IOS' | 'WEB';
  availability: 'LIVE' | 'COMING_SOON' | 'BETA';
  storeUrl: string | null;
  qrCode: PublicMediaDto | null;
}

export interface HomepageAppInfoDto {
  appKey: string;
  name: string;
  tagline: string | null;
  description: string | null;
  /** Admin-authored, configurable description of the BPA/app relationship — never inferred. Null if not configured. */
  relationshipLabel: string | null;
  icon: PublicMediaDto | null;
  features: string[];
  screenshots: PublicMediaDto[];
  platforms: HomepageAppPlatformLinkDto[];
}

export interface PlatformShowcaseDto {
  key: string; eyebrow: string | null; title: string; subtitle: string | null; description: string | null;
  layout: string; theme: string; logo: PublicMediaDto | null;
  items: Array<{ platformKey: string; brandKey: string; platformType: 'APP'|'WEBSITE'; name: string; badgeText: string|null; heading: string|null; subheading: string|null; description: string|null; featureBullets: string[]; ctaText: string|null; ctaUrl: string|null; layoutOverride: string|null; previewMode: 'RAW_IMAGE'|'DEVICE_FRAME'; featured: boolean; logo: PublicMediaDto|null; primaryPreview: PublicMediaDto|null; secondaryPreview: PublicMediaDto|null; links: Array<{type:'GOOGLE_PLAY'|'APP_STORE'|'WEBSITE'|'DETAILS'|'OTHER';label:string;url:string;qrEnabled:boolean;qrCaption:string|null;openInNewTab:boolean}> }>;
}

// ─── Impact statistics ───────────────────────────────────────────
// Every figure here is a real, live-computed count from its source table
// (never an estimate, never hardcoded) — see homepage-public.repository.ts
// `getImpactStatistics`. The whole response is wrapped in a short in-process
// cache (see homepage-public.service.ts) specifically so these counts are
// not recomputed on every request.

export interface HomepageStatsDto {
  animalsVaccinated: number;
  spayNeuterCompleted: number;
  activeMembers: number;
  partnerClinics: number;
  districtsReached: number;
  asOf: string;
}

// ─── Featured clinics ─────────────────────────────────────────────

export interface HomepageClinicDto {
  id: string;
  slug: string | null;
  name: string;
  area: string | null;
  district: string | null;
  logo: PublicMediaDto | null;
}

// ─── Public/governance documents ────────────────────────────────

export interface HomepageDocumentDto {
  id: string;
  key: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
  version: string | null;
  publishedAt: string | null;
}

// Query for the full public documents catalog (`GET /public/documents`) —
// distinct from the homepage teaser (`listPublicDocuments`, capped small).
export const publicDocumentsQuerySchema = z.object({
  category: z.enum(['LEGAL', 'GOVERNANCE', 'FINANCIAL', 'POLICY', 'OTHER']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export type PublicDocumentsQuery = z.infer<typeof publicDocumentsQuerySchema>;

// ─── News/resources ───────────────────────────────────────────────

export interface HomepageNewsDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
}

// ─── Top-level response ─────────────────────────────────────────

export interface PublicHomepageResponseDto {
  locale: string;
  generatedAt: string;
  featuredCampaigns: FeaturedCampaignDto[];
  programs: HomepageProgramDto[];
  featuredVideos: HomepageVideoDto[];
  apps: HomepageAppInfoDto[];
  platformShowcases: PlatformShowcaseDto[];
  stats: HomepageStatsDto;
  featuredClinics: HomepageClinicDto[];
  documents: HomepageDocumentDto[];
  news: HomepageNewsDto[];
}
