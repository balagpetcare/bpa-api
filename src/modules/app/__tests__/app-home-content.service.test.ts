jest.mock('../../../database/prisma', () => ({
  prisma: {
    contentPost: { findMany: jest.fn() },
    appTutorialGuide: { findMany: jest.fn() },
    partnerClinic: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../database/prisma';
import { getCareVideos, getTutorialsGuides, getPartnerClinics } from '../app-home-content.service';

const mockedContentPostFindMany = prisma.contentPost.findMany as jest.Mock;
const mockedTutorialGuideFindMany = prisma.appTutorialGuide.findMany as jest.Mock;
const mockedPartnerClinicFindMany = prisma.partnerClinic.findMany as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('getCareVideos', () => {
  it('returns published homepage videos mapped to the mobile DTO shape', async () => {
    mockedContentPostFindMany.mockResolvedValue([
      {
        id: 'v1',
        titleEn: 'How to trim nails',
        summaryEn: 'Quick guide',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        videoPosterUrl: null,
        coverImageUrl: null,
        videoFileUrl: null,
        videoUrl: 'https://youtube.com/watch?v=abc',
        videoSourceType: 'youtube',
        durationSeconds: 120,
        homepagePriority: 5,
        publishedAt: new Date('2026-01-01'),
        category: { slug: 'grooming', nameEn: 'Grooming' },
      },
    ]);

    const result = await getCareVideos({ limit: 10 });

    expect(result).toEqual([
      {
        id: 'v1',
        title: 'How to trim nails',
        shortDescription: 'Quick guide',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        videoUrl: null,
        youtubeUrl: 'https://youtube.com/watch?v=abc',
        durationSeconds: 120,
        category: 'grooming',
        sortOrder: 5,
        publishedAt: new Date('2026-01-01'),
      },
    ]);
  });

  it('only queries type=VIDEO, status=published, showOnHomepage=true (excludes drafts and non-homepage videos)', async () => {
    mockedContentPostFindMany.mockResolvedValue([]);
    await getCareVideos({});

    const args = mockedContentPostFindMany.mock.calls[0][0];
    expect(args.where.type).toBe('VIDEO');
    expect(args.where.status).toBe('published');
    expect(args.where.showOnHomepage).toBe(true);
  });

  it('drops invalid/malformed video and thumbnail URLs instead of surfacing them', async () => {
    mockedContentPostFindMany.mockResolvedValue([
      {
        id: 'v2',
        titleEn: 'Bad urls',
        summaryEn: null,
        thumbnailUrl: 'not-a-url',
        videoPosterUrl: null,
        coverImageUrl: null,
        videoFileUrl: 'javascript:alert(1)',
        videoUrl: null,
        videoSourceType: 'file',
        durationSeconds: null,
        homepagePriority: 0,
        publishedAt: null,
        category: null,
      },
    ]);

    const [result] = await getCareVideos({});
    expect(result.thumbnailUrl).toBeNull();
    expect(result.videoUrl).toBeNull();
  });

  it('applies category filter by slug and respects the limit/ordering contract', async () => {
    mockedContentPostFindMany.mockResolvedValue([]);
    await getCareVideos({ limit: 3, category: 'grooming' });

    const args = mockedContentPostFindMany.mock.calls[0][0];
    expect(args.where.category).toEqual({ slug: 'grooming' });
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([
      { isPinned: 'desc' },
      { isFeatured: 'desc' },
      { homepagePriority: 'desc' },
      { publishedAt: { sort: 'desc', nulls: 'last' } },
    ]);
  });
});

describe('getTutorialsGuides', () => {
  const baseRow = {
    id: 't1',
    title: 'Vaccination basics',
    subtitle: 'What every owner should know',
    description: null,
    imageUrl: 'https://cdn.example.com/icon.png',
    mobileImageUrl: null,
    contentType: 'GUIDE',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 1,
    publishedAt: new Date('2026-01-01'),
    startsAt: null,
    endsAt: null,
  };

  it('maps destinationType/destinationValue and content fields for an active published guide', async () => {
    mockedTutorialGuideFindMany.mockResolvedValue([baseRow]);
    const [result] = await getTutorialsGuides({});

    expect(result).toMatchObject({
      id: 't1',
      title: 'Vaccination basics',
      shortDescription: 'What every owner should know',
      thumbnailUrl: 'https://cdn.example.com/icon.png',
      contentType: 'GUIDE',
      destinationType: 'INTERNAL_PAGE',
      destinationValue: 'campaign_blocks',
      sortOrder: 1,
    });
  });

  it('queries only isActive=true, status=published (drafts excluded)', async () => {
    mockedTutorialGuideFindMany.mockResolvedValue([]);
    await getTutorialsGuides({});

    const args = mockedTutorialGuideFindMany.mock.calls[0][0];
    expect(args.where.isActive).toBe(true);
    expect(args.where.status).toBe('published');
  });

  it('filters by language when provided', async () => {
    mockedTutorialGuideFindMany.mockResolvedValue([]);
    await getTutorialsGuides({ language: 'bn' });

    const args = mockedTutorialGuideFindMany.mock.calls[0][0];
    expect(args.where.language).toBe('bn');
  });

  it('filters by category when provided', async () => {
    mockedTutorialGuideFindMany.mockResolvedValue([]);
    await getTutorialsGuides({ category: 'vaccination' });

    const args = mockedTutorialGuideFindMany.mock.calls[0][0];
    expect(args.where.category).toBe('vaccination');
  });

  it('excludes rows outside their startsAt/endsAt scheduling window even if status=published', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24);
    mockedTutorialGuideFindMany.mockResolvedValue([
      { ...baseRow, id: 't2', startsAt: future, endsAt: null },
    ]);

    const result = await getTutorialsGuides({});
    expect(result).toHaveLength(0);
  });

  it('orders by sortOrder ascending then publishedAt descending', async () => {
    mockedTutorialGuideFindMany.mockResolvedValue([]);
    await getTutorialsGuides({});

    const args = mockedTutorialGuideFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { publishedAt: 'desc' }]);
  });
});

describe('getPartnerClinics', () => {
  const baseRow = {
    id: 'c1',
    name: 'Dhaka Pet Clinic',
    logoUrl: 'https://cdn.example.com/logo.png',
    shortDescription: 'Full-service vet clinic',
    phone: '01700000000',
    showPhonePublicly: true,
    address: '123 Road',
    area: 'Gulshan',
    latitude: 23.78,
    longitude: 90.41,
    rating: 4.5,
    reviewCount: 12,
    isVerified: true,
    sortOrder: 0,
    division: { name: 'Dhaka' },
    district: { name: 'Dhaka' },
  };

  it('returns an active published clinic with all real fields mapped', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([baseRow]);
    const [result] = await getPartnerClinics({});

    expect(result).toMatchObject({
      id: 'c1',
      name: 'Dhaka Pet Clinic',
      phone: '01700000000',
      division: 'Dhaka',
      district: 'Dhaka',
      area: 'Gulshan',
      rating: 4.5,
      reviewCount: 12,
      isVerified: true,
    });
  });

  it('hides phone number when showPhonePublicly is false', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([{ ...baseRow, showPhonePublicly: false }]);
    const [result] = await getPartnerClinics({});
    expect(result.phone).toBeNull();
  });

  it('never invents rating/reviewCount/verification — nulls pass through untouched', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([
      { ...baseRow, rating: null, reviewCount: null, isVerified: false, latitude: null, longitude: null },
    ]);
    const [result] = await getPartnerClinics({});
    expect(result.rating).toBeNull();
    expect(result.reviewCount).toBeNull();
    expect(result.isVerified).toBe(false);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it('queries only isActive=true and status=published by default (excludes inactive/private clinics)', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([]);
    await getPartnerClinics({});

    const args = mockedPartnerClinicFindMany.mock.calls[0][0];
    expect(args.where.isActive).toBe(true);
    expect(args.where.status).toBe('published');
  });

  it('filters by divisionId and districtId when provided', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([]);
    await getPartnerClinics({ divisionId: 'div-1', districtId: 'dist-1' });

    const args = mockedPartnerClinicFindMany.mock.calls[0][0];
    expect(args.where.divisionId).toBe('div-1');
    expect(args.where.districtId).toBe('dist-1');
  });

  it('orders by sortOrder ascending then name ascending, respecting limit', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([]);
    await getPartnerClinics({ limit: 5 });

    const args = mockedPartnerClinicFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
    expect(args.take).toBe(5);
  });

  it('returns an empty array when the table has no rows (not an error)', async () => {
    mockedPartnerClinicFindMany.mockResolvedValue([]);
    const result = await getPartnerClinics({});
    expect(result).toEqual([]);
  });

  it('propagates database errors (e.g. missing-table P2021) instead of swallowing them as an empty list', async () => {
    const dbError = new Error('The table `public.partner_clinics` does not exist in the current database.');
    mockedPartnerClinicFindMany.mockRejectedValue(dbError);

    await expect(getPartnerClinics({})).rejects.toThrow(dbError);
  });
});
