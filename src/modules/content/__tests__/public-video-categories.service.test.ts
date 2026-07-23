jest.mock('../content.repository', () => ({
  listCategories: jest.fn(),
  countPosts: jest.fn(),
}));

import * as repo from '../content.repository';
import { listPublicVideoCategories } from '../content.service';

describe('public video category visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes empty categories, draft-only categories, and categories with only published non-VIDEO posts', async () => {
    const categories = [
      { id: 'cat-empty', slug: 'empty', nameEn: 'Empty', nameBn: 'খালি', description: null },
      { id: 'cat-draft', slug: 'draft-video', nameEn: 'Draft', nameBn: 'ড্রাফট', description: null },
      { id: 'cat-post', slug: 'non-video', nameEn: 'Post', nameBn: 'পোস্ট', description: null },
      { id: 'cat-video', slug: 'published-video', nameEn: 'Video', nameBn: 'ভিডিও', description: null },
    ];

    (repo.listCategories as jest.Mock).mockResolvedValue(categories);
    (repo.countPosts as jest.Mock).mockImplementation(async (filters: any) => {
      if (filters.type !== 'VIDEO' || filters.status !== 'published' || !filters.publishedAtLte) {
        return 999;
      }

      switch (filters.categoryId) {
        case 'cat-empty':
          return 0;
        case 'cat-draft':
          return 0;
        case 'cat-post':
          return 0;
        case 'cat-video':
          return 2;
        default:
          return 0;
      }
    });

    const result = await listPublicVideoCategories();

    expect(result.map((item) => item.slug)).toEqual(['published-video']);
  });

  it('returns every category that has at least one published VIDEO post', async () => {
    const categories = [
      { id: 'cat-a', slug: 'pet-care-health', nameEn: 'A', nameBn: 'এ', description: null },
      { id: 'cat-b', slug: 'vaccination-prevention', nameEn: 'B', nameBn: 'বি', description: null },
      { id: 'cat-c', slug: 'emergency-first-aid', nameEn: 'C', nameBn: 'সি', description: null },
    ];

    (repo.listCategories as jest.Mock).mockResolvedValue(categories);
    (repo.countPosts as jest.Mock).mockImplementation(async (filters: any) => {
      if (filters.categoryId === 'cat-a') return 1;
      if (filters.categoryId === 'cat-b') return 3;
      if (filters.categoryId === 'cat-c') return 0;
      return 0;
    });

    const result = await listPublicVideoCategories();

    expect(result.map((item) => item.slug)).toEqual(['pet-care-health', 'vaccination-prevention']);
  });

  it('uses the repository as a single-category model, because content posts do not support multi-category assignment', async () => {
    const categories = [
      { id: 'cat-single', slug: 'single-category', nameEn: 'Single', nameBn: 'সিঙ্গেল', description: null },
      { id: 'cat-other', slug: 'other-category', nameEn: 'Other', nameBn: 'অন্য', description: null },
    ];

    (repo.listCategories as jest.Mock).mockResolvedValue(categories);
    (repo.countPosts as jest.Mock).mockImplementation(async (filters: any) => (filters.categoryId === 'cat-single' ? 1 : 0));

    const result = await listPublicVideoCategories();

    expect(result.map((item) => item.slug)).toEqual(['single-category']);
  });
});
