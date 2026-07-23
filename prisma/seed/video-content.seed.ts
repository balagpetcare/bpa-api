import { PrismaClient } from '@prisma/client';

import { SAMPLE_VIDEO_CONTENT } from './data/video-content.seed-data';

export type VideoContentSeedResult = Readonly<{
  skipped: boolean;
  reason?: string;
  attempted: number;
  upserted: number;
  published: number;
  draft: number;
}>;

function sampleContentEnabled() {
  return process.env.ENABLE_SAMPLE_VIDEO_CONTENT === 'true';
}

function productionOverrideEnabled() {
  return process.env.ALLOW_SAMPLE_VIDEO_CONTENT_IN_PRODUCTION === 'true';
}

export async function seedVideoContent(prisma: PrismaClient): Promise<VideoContentSeedResult> {
  if (!sampleContentEnabled()) {
    return {
      skipped: true,
      reason: 'ENABLE_SAMPLE_VIDEO_CONTENT is not true',
      attempted: 0,
      upserted: 0,
      published: 0,
      draft: 0,
    };
  }

  if (process.env.NODE_ENV === 'production' && !productionOverrideEnabled()) {
    throw new Error(
      'Sample video content seeding is blocked in production unless ALLOW_SAMPLE_VIDEO_CONTENT_IN_PRODUCTION=true',
    );
  }

  const seedAuthor = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!seedAuthor) {
    throw new Error('Sample video content seeding requires at least one existing user record');
  }

  let upserted = 0;
  let published = 0;
  let draft = 0;

  for (const item of SAMPLE_VIDEO_CONTENT) {
    const category = await prisma.contentCategory.findUnique({
      where: { slug: item.categorySlug },
      select: { id: true },
    });

    if (!category) {
      throw new Error(`Sample video content seeding could not resolve content category "${item.categorySlug}"`);
    }

    await prisma.contentPost.upsert({
      where: { slug: item.slug },
      update: {
        type: item.type,
        titleEn: item.titleEn,
        titleBn: item.titleBn,
        summaryEn: item.summaryEn,
        summaryBn: item.summaryBn,
        bodyEn: item.bodyEn,
        bodyBn: item.bodyBn,
        videoSourceType: item.videoSourceType,
        videoUrl: item.videoUrl,
        videoProvider: item.videoProvider,
        thumbnailUrl: item.thumbnailUrl,
        videoPosterUrl: item.videoPosterUrl,
        durationSeconds: item.durationSeconds,
        categoryId: category.id,
        tags: [...item.tags],
        status: item.status,
        showOnHomepage: item.showOnHomepage,
        isFeatured: item.isFeatured,
        isPinned: item.isPinned,
        homepagePriority: item.homepagePriority,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      },
      create: {
        type: item.type,
        titleEn: item.titleEn,
        titleBn: item.titleBn,
        slug: item.slug,
        summaryEn: item.summaryEn,
        summaryBn: item.summaryBn,
        bodyEn: item.bodyEn,
        bodyBn: item.bodyBn,
        videoSourceType: item.videoSourceType,
        videoUrl: item.videoUrl,
        videoProvider: item.videoProvider,
        thumbnailUrl: item.thumbnailUrl,
        videoPosterUrl: item.videoPosterUrl,
        durationSeconds: item.durationSeconds,
        categoryId: category.id,
        tags: [...item.tags],
        status: item.status,
        showOnHomepage: item.showOnHomepage,
        isFeatured: item.isFeatured,
        isPinned: item.isPinned,
        homepagePriority: item.homepagePriority,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        createdById: seedAuthor.id,
      },
    });

    upserted++;
    if (item.status === 'published') {
      published++;
    } else {
      draft++;
    }
  }

  return {
    skipped: false,
    attempted: SAMPLE_VIDEO_CONTENT.length,
    upserted,
    published,
    draft,
  };
}
