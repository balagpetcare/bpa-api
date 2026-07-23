jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

import { VIDEO_CATEGORIES, seedVideoCategories } from '../seed/video-categories.seed';

describe('video category seed', () => {
  it('uses unique slugs and verifies the entire seeded set', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue(
      VIDEO_CATEGORIES
        .map((item) => ({ slug: item.slug, nameEn: item.nameEn, nameBn: item.nameBn }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    );
    const groupBy = jest.fn().mockResolvedValue(
      VIDEO_CATEGORIES.map((item) => ({ slug: item.slug, _count: { slug: 1 } })),
    );

    const prisma = {
      contentCategory: {
        upsert,
        findMany,
        groupBy,
      },
    } as any;

    const result = await seedVideoCategories(prisma);

    expect(result.attempted).toBe(VIDEO_CATEGORIES.length);
    expect(upsert).toHaveBeenCalledTimes(VIDEO_CATEGORIES.length);
    expect(new Set(VIDEO_CATEGORIES.map((item) => item.slug)).size).toBe(VIDEO_CATEGORIES.length);
    expect(result.missingSlugs).toEqual([]);
    expect(result.duplicateSlugs).toEqual([]);
  });
});
