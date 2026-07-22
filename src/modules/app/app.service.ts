import { CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AuthPayload } from '../../types';
import { APP_CONTROL_PAGE_KEYS } from '../app-control/app-control.types';

type AppRecord = {
  id: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  imageUrl: string | null;
  mobileImageUrl: string | null;
  ctaText: string | null;
  destinationType: string;
  destinationValue: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  targetAudience: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type AudienceContext = {
  isAuthenticated: boolean;
  userId: string | null;
  audiences: Set<string>;
};

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();
const PUBLIC_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.published,
  CampaignStatus.registration_open,
  CampaignStatus.registration_closed,
  CampaignStatus.completed,
];
const RESERVED_PAGE_KEYS = new Set<string>(APP_CONTROL_PAGE_KEYS);
const BPA_BRANDING_DEFAULTS = {
  appName: 'Bangladesh Pet Association',
  tagline: 'Care • Compassion • Community',
  primaryColor: '#0B7A2A',
  secondaryColor: '#0B7A2A',
  accentColor: '#F5B82E',
};
const DHAKA_TIMEZONE = 'Asia/Dhaka';

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached) return cached;
  return setCached(key, await fn());
}

function buildVisibilityWhere(now: Date) {
  return {
    isActive: true,
    status: 'published',
    OR: [
      { startsAt: null, endsAt: null },
      { startsAt: null, endsAt: { gt: now } },
      { startsAt: { lte: now }, endsAt: null },
      { startsAt: { lte: now }, endsAt: { gt: now } },
    ],
  };
}

function computeCountdown(endsAt: Date | null | undefined, now = new Date()) {
  if (!endsAt) {
    return {
      daysLeft: null,
      hoursLeft: null,
      countdownLabel: null,
      isExpired: false,
    };
  }

  const diffMs = endsAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      daysLeft: 0,
      hoursLeft: 0,
      countdownLabel: 'Expired',
      isExpired: true,
    };
  }

  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = totalHours;
  const countdownLabel =
    daysLeft >= 1
      ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
      : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left`;

  return {
    daysLeft,
    hoursLeft,
    countdownLabel,
    isExpired: false,
  };
}

function matchesAudience(targetAudience: string, audience: AudienceContext) {
  if (!targetAudience || targetAudience === 'all') return true;
  if (targetAudience === 'user') return audience.isAuthenticated;
  return audience.audiences.has(targetAudience);
}

function isVisible(
  record: Pick<AppRecord, 'isActive' | 'status' | 'startsAt' | 'endsAt' | 'targetAudience'>,
  audience: AudienceContext,
  now = new Date(),
) {
  if (!record.isActive) return false;
  if (record.status !== 'published') return false;
  if (record.startsAt && record.startsAt > now) return false;
  if (record.endsAt && record.endsAt <= now) return false;
  if (!matchesAudience(record.targetAudience, audience)) return false;
  return true;
}

function toPublicContent(record: AppRecord) {
  return {
    id: record.id,
    title: record.title,
    subtitle: record.subtitle,
    description: record.description,
    imageUrl: record.imageUrl,
    mobileImageUrl: record.mobileImageUrl,
    ctaText: record.ctaText,
    destinationType: record.destinationType,
    destinationValue: record.destinationValue,
    sortOrder: record.sortOrder,
    targetAudience: record.targetAudience,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
  };
}

function toSectionTypeKey(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function toHomeSection(record: AppRecord) {
  const sectionType = toSectionTypeKey(record.title || record.subtitle);

  return {
    id: record.id,
    sectionType,
    title: record.subtitle || record.title,
    subtitle: record.description,
    label: record.subtitle || record.title,
    summary: record.description,
    imageUrl: record.imageUrl,
    mobileImageUrl: record.mobileImageUrl,
    ctaText: record.ctaText,
    destinationType: record.destinationType,
    destinationValue: record.destinationValue,
    sortOrder: record.sortOrder,
    targetAudience: record.targetAudience,
    enabled: true,
  };
}

async function buildAudienceContext(user?: AuthPayload | null): Promise<AudienceContext> {
  if (!user?.sub) {
    return {
      isAuthenticated: false,
      userId: null,
      audiences: new Set(['all', 'guest']),
    };
  }

  const now = new Date();
  const [member, donor, staffUser] = await Promise.all([
    prisma.member.findFirst({
      where: {
        userId: user.sub,
        memberships: { some: { status: 'active', expiresAt: { gte: now } } },
      },
      select: { id: true },
    }),
    prisma.donation.findFirst({
      where: {
        userId: user.sub,
        status: 'success',
      },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: user.sub },
      select: { role: true },
    }),
  ]);

  const audiences = new Set<string>(['all', 'user']);
  if (!member) audiences.add('guest');
  if (member) audiences.add('member');
  if (donor) audiences.add('donor');
  if ((user.roles ?? []).some((role) => role.toLowerCase().includes('volunteer'))) audiences.add('volunteer');
  if (staffUser?.role && ['ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(staffUser.role.toUpperCase())) {
    audiences.add('staff');
  }

  return {
    isAuthenticated: true,
    userId: user.sub,
    audiences,
  };
}

async function getVisibleEntity<T extends AppRecord>(
  delegate: { findMany: (args: Prisma.Args<any, 'findMany'>) => Promise<T[]> },
  audience: AudienceContext,
  extraWhere?: Record<string, unknown>,
) {
  const now = new Date();
  const rows = await delegate.findMany({
    where: {
      ...buildVisibilityWhere(now),
      ...(extraWhere ?? {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
  } as any);

  return rows.filter((row) => isVisible(row, audience, now));
}

async function getActiveCampaigns(audience: AudienceContext) {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: PUBLIC_CAMPAIGN_STATUSES },
      endDate: { gt: now },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    take: 8,
    include: {
      coverImage: { select: { url: true, altText: true } },
      sessions: {
        where: { isActive: true },
        orderBy: { sessionDate: 'asc' },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          capacity: true,
          bookedCount: true,
          isActive: true,
          venue: { select: { id: true, name: true, address: true } },
        },
      },
    },
  });

  return campaigns
    .map((campaign) => {
      const registrationClosesAt = campaign.registrationCloseAt ?? campaign.endDate ?? null;
      const countdown = computeCountdown(registrationClosesAt, now);
      const canRegister =
        campaign.status === CampaignStatus.registration_open &&
        (!campaign.registrationOpenAt || campaign.registrationOpenAt <= now) &&
        (!campaign.registrationCloseAt || campaign.registrationCloseAt > now);

      return {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        subtitle: campaign.campaignType,
        description: campaign.description,
        imageUrl: campaign.coverImage?.url ?? null,
        mobileImageUrl: campaign.coverImage?.url ?? null,
        ctaText: canRegister ? 'Register now' : 'View details',
        destinationType: 'CAMPAIGN',
        destinationValue: campaign.slug,
        sortOrder: 0,
        targetAudience: audience.isAuthenticated ? 'user' : 'guest',
        status: campaign.status,
        startsAt: campaign.startDate,
        endsAt: registrationClosesAt,
        badge: campaign.status,
        campaignType: campaign.campaignType,
        canRegister,
        nextSession: campaign.sessions[0]
          ? {
              id: campaign.sessions[0].id,
              sessionDate: campaign.sessions[0].sessionDate,
              startTime: campaign.sessions[0].startTime,
              endTime: campaign.sessions[0].endTime,
              capacity: campaign.sessions[0].capacity,
              bookedCount: campaign.sessions[0].bookedCount,
              venue: campaign.sessions[0].venue,
            }
          : null,
        ...countdown,
      };
    })
    .filter((campaign) => !campaign.isExpired);
}

function buildFallbackTheme() {
  return {
    primaryColor: BPA_BRANDING_DEFAULTS.primaryColor,
    secondaryColor: BPA_BRANDING_DEFAULTS.secondaryColor,
    accentColor: BPA_BRANDING_DEFAULTS.accentColor,
    fontFamily: null,
    logoUrl: null,
    imageUrl: null,
    title: BPA_BRANDING_DEFAULTS.appName,
    subtitle: BPA_BRANDING_DEFAULTS.tagline,
    searchPlaceholder: 'Search services, campaigns, offers',
    headerGreeting: BPA_BRANDING_DEFAULTS.appName,
  };
}

function normalizeThemeValue(row: {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  imageUrl?: string | null;
  fontFamily?: string | null;
  ctaText?: string | null;
}) {
  const fallback = buildFallbackTheme();
  const isSeedDefault =
    (row.title ?? '').trim().toLowerCase() === 'default app theme' ||
    (row.subtitle ?? '').trim().toLowerCase() === 'bpa default theme' ||
    (row.primaryColor ?? '').trim().toLowerCase() === '#1f6feb';

  return {
    primaryColor: !isSeedDefault && row.primaryColor ? row.primaryColor : fallback.primaryColor,
    secondaryColor: !isSeedDefault && row.secondaryColor ? row.secondaryColor : fallback.secondaryColor,
    accentColor: !isSeedDefault && row.accentColor ? row.accentColor : fallback.accentColor,
    fontFamily: row.fontFamily ?? fallback.fontFamily,
    logoUrl: row.logoUrl ?? fallback.logoUrl,
    imageUrl: row.imageUrl ?? fallback.imageUrl,
    title: !isSeedDefault && row.title ? row.title : fallback.title,
    subtitle: !isSeedDefault && row.subtitle ? row.subtitle : fallback.subtitle,
    searchPlaceholder: row.ctaText ?? fallback.searchPlaceholder,
    headerGreeting:
      !isSeedDefault && row.description ? row.description : fallback.headerGreeting,
  };
}

export async function getAppVersion() {
  return withCache('app:version', async () => {
    const now = new Date();
    const row = await prisma.appVersionSetting.findFirst({
      where: buildVisibilityWhere(now) as Prisma.AppVersionSettingWhereInput,
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });

    return {
      minimumVersion: row?.minimumVersion ?? '1.0.0',
      latestVersion: row?.latestVersion ?? '1.0.0',
      forceUpdate: row?.forceUpdate ?? false,
      releaseNotes: row?.releaseNotes ?? null,
      ctaText: row?.ctaText ?? 'Update app',
      destinationType: row?.destinationType ?? 'NONE',
      destinationValue: row?.destinationValue ?? null,
    };
  });
}

export async function getMaintenanceMode(userOrAudience?: AuthPayload | AudienceContext | null) {
  const audience =
    userOrAudience && 'audiences' in userOrAudience
      ? userOrAudience
      : await buildAudienceContext((userOrAudience as AuthPayload | null | undefined) ?? null);
  const audienceKey = [...audience.audiences].sort().join(',');
  return withCache(`app:maintenance:${audienceKey}`, async () => {
    const rows = await getVisibleEntity(prisma.appPageContent, audience, { destinationValue: 'maintenance_mode' });
    const row = rows[0];

    return {
      enabled: Boolean(row),
      page: row ? toPublicContent(row) : null,
    };
  });
}

async function getThemeBranding(audience: AudienceContext) {
  const audienceKey = [...audience.audiences].sort().join(',');
  return withCache(`app:theme:${audienceKey}`, async () => {
    const row = (await getVisibleEntity(prisma.appThemeSetting, audience))[0];
    if (!row) return buildFallbackTheme();
    return normalizeThemeValue(row);
  });
}

export async function getNavigation(user?: AuthPayload | null) {
  const audience = await buildAudienceContext(user);
  const audienceKey = [...audience.audiences].sort().join(',');
  return withCache(`app:navigation:${audienceKey}`, async () => {
    const rows = await getVisibleEntity(prisma.appNavigationItem, audience);
    return rows.map((row) => ({
      id: row.id,
      label: row.title,
      subtitle: row.subtitle,
      iconUrl: row.imageUrl,
      mobileIconUrl: row.mobileImageUrl,
      destinationType: row.destinationType,
      destinationValue: row.destinationValue,
      sortOrder: row.sortOrder,
      enabled: true,
    }));
  });
}

async function getPopupNotice(audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appPopupNotice, audience);
  return rows[0] ? toPublicContent(rows[0]) : null;
}

async function getPageContentByKey(key: string, audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appPageContent, audience, {
    destinationValue: key,
  });

  return {
    key,
    items: rows.map(toPublicContent),
  };
}

async function getHomeSections(audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appHomeSection, audience);
  return rows.map(toHomeSection);
}

async function getBanners(audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appBanner, audience);
  return rows.map(toPublicContent);
}

async function getQuickActions(audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appQuickAction, audience);
  return rows.map(toPublicContent);
}

async function getFeaturedServices(audience: AudienceContext) {
  const rows = await getVisibleEntity(prisma.appFeaturedService, audience);
  return rows.map(toPublicContent);
}

async function getOffers(audience: AudienceContext) {
  const now = new Date();
  const rows = await getVisibleEntity(prisma.appOffer, audience);
  return rows.map((row) => ({
    ...toPublicContent(row),
    badge: row.subtitle,
    ...computeCountdown(row.endsAt, now),
  }));
}

async function getTodayUpdates(audience: AudienceContext) {
  const contentPosts = await prisma.contentPost.findMany({
    where: {
      status: 'published',
      showOnHomepage: true,
    },
    orderBy: [
      { isPinned: 'desc' },
      { isFeatured: 'desc' },
      { homepagePriority: 'desc' },
      { publishedAt: { sort: 'desc', nulls: 'last' } as any },
    ],
    take: 12,
    select: {
      id: true,
      slug: true,
      titleEn: true,
      summaryEn: true,
      coverImageUrl: true,
      ctaLabelEn: true,
      ctaUrl: true,
      ctaType: true,
      publishedAt: true,
      homepagePriority: true,
      isPinned: true,
      isFeatured: true,
    },
  });

  if (contentPosts.length > 0) {
    return contentPosts.map((post, index) => ({
      id: post.id,
      title: post.titleEn,
      subtitle: post.isPinned ? 'Pinned update' : post.isFeatured ? 'Featured update' : 'Today update',
      description: post.summaryEn,
      imageUrl: post.coverImageUrl,
      mobileImageUrl: post.coverImageUrl,
      ctaText: post.ctaLabelEn ?? 'Read update',
      destinationType: post.ctaUrl ? 'EXTERNAL_URL' : 'INTERNAL_PAGE',
      destinationValue: post.ctaUrl ?? post.slug,
      sortOrder: index,
      targetAudience: 'all',
      startsAt: post.publishedAt,
      endsAt: null,
      publishedLabel: post.publishedAt?.toISOString() ?? null,
    }));
  }

  const rows = await getVisibleEntity(prisma.appPageContent, audience, {
    destinationValue: { not: 'maintenance_mode' },
  });

  return rows
    .filter((row) => !row.destinationValue || !RESERVED_PAGE_KEYS.has(row.destinationValue))
    .slice(0, 12)
    .map((row) => ({
      ...toPublicContent(row),
      publishedLabel: row.updatedAt.toISOString(),
    }));
}

export async function getBootstrapPayload(user?: AuthPayload | null) {
  const audience = await buildAudienceContext(user);
  const audienceKey = [...audience.audiences].sort().join(',');
  return withCache(`app:bootstrap:${audienceKey}`, async () => {
    const [version, maintenance, theme, navigation, popupNotice] = await Promise.all([
      getAppVersion(),
      getMaintenanceMode(audience),
      getThemeBranding(audience),
      getNavigation(user),
      getPopupNotice(audience),
    ]);

    return {
      version,
      maintenance,
      theme,
      navigation,
      popupNotice,
    };
  });
}

export async function getHomePayload(user?: AuthPayload | null) {
  const audience = await buildAudienceContext(user);
  const [branding, navigation, maintenance, sections, banners, quickActions, featuredServices, campaigns, offers, todayUpdates] =
    await Promise.all([
      getThemeBranding(audience),
      getNavigation(user),
      getMaintenanceMode(audience),
      getHomeSections(audience),
      getBanners(audience),
      getQuickActions(audience),
      getFeaturedServices(audience),
      getActiveCampaigns(audience),
      getOffers(audience),
      getTodayUpdates(audience),
    ]);

  const searchSection = sections.find((section) => section.sectionType === 'LATEST_UPDATES');

  return {
    branding: {
      logoUrl: branding.logoUrl,
      imageUrl: branding.imageUrl,
      appName: branding.title,
      tagline: branding.subtitle,
      headerGreeting: branding.headerGreeting,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      fontFamily: branding.fontFamily,
    },
    header: {
      title: branding.title,
      subtitle: branding.subtitle,
      logoUrl: branding.logoUrl,
    },
    search: {
      enabled: true,
      placeholder: branding.searchPlaceholder,
      destinationType: searchSection?.destinationType ?? 'NONE',
      destinationValue: searchSection?.destinationValue ?? null,
    },
    sections,
    banners,
    quickActions,
    featuredServices,
    campaignBlocks: campaigns,
    activeOffers: offers,
    todayUpdates,
    bottomNavigation: navigation,
    maintenance,
    visibility: {
      timezone: DHAKA_TIMEZONE,
      audience: [...audience.audiences],
      filteredOutDrafts: true,
      filteredOutInactive: true,
      filteredOutExpired: true,
      filteredOutFutureScheduled: true,
    },
  };
}

export async function getPagePayload(key: (typeof APP_CONTROL_PAGE_KEYS)[number], user?: AuthPayload | null) {
  const audience = await buildAudienceContext(user);
  return getPageContentByKey(key, audience);
}
