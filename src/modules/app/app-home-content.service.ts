import { prisma } from '../../database/prisma';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

/** Only http(s) URLs are surfaced to mobile clients; anything else is dropped. */
function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return value;
  } catch {
    return null;
  }
}

function isActiveWindow(startsAt: Date | null, endsAt: Date | null, now: Date) {
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

// ─── Care Videos (reuses ContentPost where type = VIDEO) ──────────────────

export async function getCareVideos(params: { limit?: unknown; category?: string }) {
  const limit = clampLimit(params.limit);
  const now = new Date();

  const where: Record<string, unknown> = {
    type: 'VIDEO',
    status: 'published',
    showOnHomepage: true,
    OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  };

  if (params.category) {
    where.category = { slug: params.category };
  }

  const rows = await prisma.contentPost.findMany({
    where: where as any,
    include: { category: { select: { id: true, slug: true, nameEn: true, nameBn: true } } },
    orderBy: [
      { isPinned: 'desc' },
      { isFeatured: 'desc' },
      { homepagePriority: 'desc' },
      { publishedAt: { sort: 'desc', nulls: 'last' } as any },
    ],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.titleEn,
    shortDescription: row.summaryEn ?? null,
    thumbnailUrl: safeUrl(row.thumbnailUrl) ?? safeUrl(row.videoPosterUrl) ?? safeUrl(row.coverImageUrl),
    videoUrl: safeUrl(row.videoFileUrl),
    youtubeUrl: row.videoSourceType === 'youtube' ? safeUrl(row.videoUrl) : null,
    durationSeconds: row.durationSeconds ?? null,
    category: row.category?.slug ?? null,
    sortOrder: row.homepagePriority,
    publishedAt: row.publishedAt,
  }));
}

// ─── Tutorials & Guides (AppTutorialGuide) ─────────────────────────────────

export async function getTutorialsGuides(params: { limit?: unknown; language?: string; category?: string }) {
  const limit = clampLimit(params.limit);
  const now = new Date();

  const where: Record<string, unknown> = {
    isActive: true,
    status: 'published',
    OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  };
  if (params.language) where.language = params.language;
  if (params.category) where.category = params.category;

  const rows = await prisma.appTutorialGuide.findMany({
    where: where as any,
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    take: limit * 3, // over-fetch to allow for startsAt/endsAt window filtering below
  });

  const visible = rows.filter((row) => isActiveWindow(row.startsAt, row.endsAt, now)).slice(0, limit);

  return visible.map((row) => ({
    id: row.id,
    title: row.title,
    shortDescription: row.subtitle ?? row.description ?? null,
    thumbnailUrl: safeUrl(row.imageUrl) ?? safeUrl(row.mobileImageUrl),
    contentType: row.contentType,
    destinationType: row.destinationType,
    destinationValue: row.destinationValue,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
  }));
}

// ─── Partner Clinics ────────────────────────────────────────────────────────

export async function getPartnerClinics(params: {
  limit?: unknown;
  divisionId?: string;
  districtId?: string;
}) {
  const limit = clampLimit(params.limit);

  const where: Record<string, unknown> = {
    isActive: true,
    status: 'published',
  };
  if (params.divisionId) where.divisionId = params.divisionId;
  if (params.districtId) where.districtId = params.districtId;

  const rows = await prisma.partnerClinic.findMany({
    where: where as any,
    include: {
      division: { select: { name: true } },
      district: { select: { name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: safeUrl(row.logoUrl),
    shortDescription: row.shortDescription ?? null,
    phone: row.showPhonePublicly ? row.phone ?? null : null,
    address: row.address ?? null,
    division: row.division?.name ?? null,
    district: row.district?.name ?? null,
    area: row.area ?? null,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    rating: row.rating !== null ? Number(row.rating) : null,
    reviewCount: row.reviewCount ?? null,
    isVerified: row.isVerified,
    sortOrder: row.sortOrder,
  }));
}
