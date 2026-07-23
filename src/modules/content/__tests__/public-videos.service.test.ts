jest.mock('../content.repository', () => ({
  listPosts: jest.fn(),
  findPostBySlug: jest.fn(),
  incrementPostViews: jest.fn().mockResolvedValue(undefined),
  checkUserLiked: jest.fn().mockResolvedValue(false),
}));

import * as repo from '../content.repository';
import { getPostBySlug, listPublicVideos } from '../content.service';

describe('public video listing visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes draft videos, future-scheduled videos, and published non-VIDEO posts', async () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    (repo.listPosts as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'video-published',
          type: 'VIDEO',
          slug: 'video-published',
          titleEn: 'Published',
          titleBn: 'প্রকাশিত',
          status: 'published',
          publishedAt: new Date('2026-07-21T12:00:00.000Z'),
          category: { id: 'cat-1', nameEn: 'Cats', nameBn: 'ক্যাটস', slug: 'cats' },
          tags: [],
        },
        {
          id: 'video-future',
          type: 'VIDEO',
          slug: 'video-future',
          titleEn: 'Future',
          titleBn: 'ফিউচার',
          status: 'published',
          publishedAt: new Date('2026-07-23T12:00:00.000Z'),
          category: { id: 'cat-1', nameEn: 'Cats', nameBn: 'ক্যাটস', slug: 'cats' },
          tags: [],
        },
        {
          id: 'video-draft',
          type: 'VIDEO',
          slug: 'video-draft',
          titleEn: 'Draft',
          titleBn: 'ড্রাফট',
          status: 'draft',
          publishedAt: null,
          category: { id: 'cat-1', nameEn: 'Cats', nameBn: 'ক্যাটস', slug: 'cats' },
          tags: [],
        },
        {
          id: 'post-published',
          type: 'COMMUNITY_POST',
          slug: 'post-published',
          titleEn: 'Post',
          titleBn: 'পোস্ট',
          status: 'published',
          publishedAt: null,
          category: { id: 'cat-2', nameEn: 'Dogs', nameBn: 'ডগস', slug: 'dogs' },
          tags: [],
        },
      ],
      meta: { page: 1, limit: 20, total: 4, totalPages: 1 },
    });

    const result = await listPublicVideos({});

    expect(result.items.map((item) => item.slug)).toEqual(['video-published']);
    jest.useRealTimers();
  });

  it('returns every valid category slug for repeated single-category assignments in the listing', async () => {
    (repo.listPosts as jest.Mock).mockResolvedValue({
      items: [
        {
          id: 'video-a',
          type: 'VIDEO',
          slug: 'video-a',
          titleEn: 'Video A',
          titleBn: 'ভিডিও এ',
          status: 'published',
          publishedAt: null,
          category: { id: 'cat-a', nameEn: 'Care', nameBn: 'কেয়ার', slug: 'care' },
          tags: [],
        },
        {
          id: 'video-b',
          type: 'VIDEO',
          slug: 'video-b',
          titleEn: 'Video B',
          titleBn: 'ভিডিও বি',
          status: 'published',
          publishedAt: null,
          category: { id: 'cat-b', nameEn: 'Food', nameBn: 'ফুড', slug: 'food' },
          tags: [],
        },
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    const result = await listPublicVideos({});

    expect(result.items.map((item) => item.category?.slug)).toEqual(['care', 'food']);
  });
});

describe('public video detail visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides future-scheduled published videos until their publish time', async () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    (repo.findPostBySlug as jest.Mock).mockResolvedValue({
      id: 'video-future',
      type: 'VIDEO',
      slug: 'video-future',
      status: 'published',
      publishedAt: new Date('2026-07-23T12:00:00.000Z'),
    });

    await expect(getPostBySlug('video-future', true)).rejects.toMatchObject({
      statusCode: 404,
    });

    jest.useRealTimers();
  });
});
