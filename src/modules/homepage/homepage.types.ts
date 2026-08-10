import { z } from 'zod';

// Single source of truth for section types — shared by both the list-query
// filter and the write schema so they can never drift apart. Extended for
// the institutional homepage rebuild's new sections (core services, digital
// ecosystem, Furtail community, video hub, clinic network, governance
// documents) alongside the original set.
const homepageSectionTypeValues = [
  'hero', 'stats', 'mission', 'campaigns', 'news', 'events', 'vision', 'committee', 'cta', 'partners', 'custom',
  'core_services', 'digital_ecosystem', 'furtail_community', 'video_hub', 'clinic_network', 'governance_documents',
] as const;
export const homepageSectionTypeSchema = z.enum(homepageSectionTypeValues);

// Normalise empty-string query params (e.g. locale="") to the default "en"
const localeSchema = z.string().trim().optional().transform((v) => v || 'en').pipe(z.string().min(2).max(10));
const nullableText = z.string().trim().optional().nullable();
const jsonRecordSchema = z.record(z.unknown()).optional().nullable();
const ctaTypeSchema = z.enum(['none', 'internal', 'external']).default('none');
const ctaTargetSchema = z.enum(['_self', '_blank']).default('_self');
const isoDateSchema = z.string().datetime().optional().nullable();

export const homepageQuerySchema = z.object({
  locale: localeSchema.optional(),
});

export const updateHomepageSchema = z.object({
  locale: localeSchema.optional(),
  title: nullableText,
  description: nullableText,
  settings: jsonRecordSchema,
});

export const sectionListQuerySchema = z.object({
  locale: localeSchema.optional(),
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  type: homepageSectionTypeSchema.optional(),
  isVisible: z.enum(['true', 'false']).optional(),
});

export const sectionWriteSchema = z.object({
  locale: localeSchema.optional(),
  type: homepageSectionTypeSchema,
  source: z.enum(['manual', 'automatic', 'static']).default('static'),
  title: nullableText,
  eyebrow: nullableText,
  subtitle: nullableText,
  body: nullableText,
  ctaType: ctaTypeSchema,
  ctaLabel: z.string().trim().max(80).optional().nullable(),
  ctaHref: z.string().trim().max(1000).optional().nullable(),
  ctaTarget: ctaTargetSchema,
  itemLimit: z.coerce.number().int().min(0).max(24).default(3),
  content: jsonRecordSchema,
  isVisible: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
});

export const updateSectionSchema = sectionWriteSchema.partial();

export const reorderSectionsSchema = z.object({
  locale: localeSchema.optional(),
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).min(1),
});

export const sectionItemWriteSchema = z.object({
  entityType: z.string().trim().max(60).optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  title: nullableText,
  subtitle: nullableText,
  body: nullableText,
  href: z.string().trim().max(1000).optional().nullable(),
  mediaId: z.string().uuid().optional().nullable(),
  metadata: jsonRecordSchema,
  isVisible: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const heroSlideListQuerySchema = z.object({
  locale: localeSchema.optional(),
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['draft', 'published', 'archived']).optional()),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().optional(),
});

export const heroSlideWriteSchema = z.object({
  locale: localeSchema.optional(),
  title: z.string().trim().min(1).max(120),
  badgeText: z.string().trim().max(40).optional().nullable(),
  eyebrow: z.string().trim().max(80).optional().nullable(),
  headline: z.string().trim().min(1).max(180),
  body: nullableText,
  campaignTag: z.string().trim().max(60).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  isActive: z.boolean().default(true),
  mediaType: z.enum(['image', 'video']).default('image'),
  overlayPosition: z.enum(['left', 'center', 'right']).default('left'),
  ctaType: ctaTypeSchema,
  ctaLabel: z.string().trim().max(80).optional().nullable(),
  ctaHref: z.string().trim().max(1000).optional().nullable(),
  ctaTarget: ctaTargetSchema,
  secondaryCtaType: ctaTypeSchema,
  secondaryCtaLabel: z.string().trim().max(80).optional().nullable(),
  secondaryCtaHref: z.string().trim().max(1000).optional().nullable(),
  secondaryCtaTarget: ctaTargetSchema,
  desktopImageId: z.string().uuid(),
  mobileImageId: z.string().uuid().optional().nullable(),
  videoId: z.string().uuid().optional().nullable(),
  stats: z.array(z.object({ label: z.string().max(60), value: z.string().max(60) })).max(3).optional().nullable(),
  countdownLabel: z.string().trim().max(80).optional().nullable(),
  countdownTargetAt: isoDateSchema,
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateHeroSlideSchema = heroSlideWriteSchema.partial();

export const partnerListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().optional(),
});

export const partnerWriteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: nullableText,
  logoId: z.string().uuid().optional().nullable(),
  url: z.string().url().optional().nullable(),
  tier: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
});

export const updatePartnerSchema = partnerWriteSchema.partial();

export const footerLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(1000),
  target: ctaTargetSchema,
  sortOrder: z.coerce.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
});

export const footerGroupSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
  links: z.array(footerLinkSchema).default([]),
});

export const footerWriteSchema = z.object({
  locale: localeSchema.optional(),
  brandName: z.string().trim().max(160).optional().nullable(),
  brandText: nullableText,
  logoId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: nullableText,
  copyrightText: nullableText,
  socialLinks: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    href: z.string().url(),
  })).optional().nullable(),
  isActive: z.boolean().default(true),
  groups: z.array(footerGroupSchema).default([]),
});

export type HomepageQuery = z.infer<typeof homepageQuerySchema>;
export type UpdateHomepageDto = z.infer<typeof updateHomepageSchema>;
export type SectionListQuery = z.infer<typeof sectionListQuerySchema>;
export type SectionWriteDto = z.infer<typeof sectionWriteSchema>;
export type UpdateSectionDto = z.infer<typeof updateSectionSchema>;
export type ReorderSectionsDto = z.infer<typeof reorderSectionsSchema>;
export type SectionItemWriteDto = z.infer<typeof sectionItemWriteSchema>;
export type HeroSlideListQuery = z.infer<typeof heroSlideListQuerySchema>;
export type HeroSlideWriteDto = z.infer<typeof heroSlideWriteSchema>;
export type UpdateHeroSlideDto = z.infer<typeof updateHeroSlideSchema>;
export type PartnerListQuery = z.infer<typeof partnerListQuerySchema>;
export type PartnerWriteDto = z.infer<typeof partnerWriteSchema>;
export type UpdatePartnerDto = z.infer<typeof updatePartnerSchema>;
export type FooterWriteDto = z.infer<typeof footerWriteSchema>;

export interface HomeFeedVaccination {
  activeCampaignId: string | null;
  title: string | null;
  slug: string | null;
  status: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startDate: string | null;
  endDate: string | null;
  basePrice: number | null;
  allowedPetTypes: string[];
  venueCount: number;
  sessionCount: number;
  capacityTotal: number | null;
  capacityRemaining: number | null;
  ctaRouteHint: string | null;
}

export interface HomeFeedPetCensus {
  active: boolean;
  title: string | null;
  status: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  userEntryCount: number | null;
  userCompleted: boolean | null;
  ctaRouteHint: string | null;
}

export interface HomeFeedUserSummary {
  petCount: number;
  membershipStatus: string | null;
  membershipTier: string | null;
  pendingCensusCount: number;
  certificateCount: number;
  upcomingBookingCount: number;
}

export interface HomeFeedProgram {
  id: string;
  title: string;
  description: string | null;
  impactType: string;
}

export interface HomeFeedSession {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  capacity: number;
  bookedCount: number;
  remaining: number;
  campaignId: string;
  campaignTitle: string;
  campaignSlug: string;
}

export interface HomeFeedNotice {
  id: string;
  title: string;
  publishedAt: string;
  excerpt: string | null;
}

export interface HomeFeedResponse {
  vaccination: HomeFeedVaccination;
  petCensus: HomeFeedPetCensus;
  userSummary: HomeFeedUserSummary | null;
  activePrograms: HomeFeedProgram[];
  upcomingVaccinationSessions: HomeFeedSession[];
  notices: HomeFeedNotice[];
}
