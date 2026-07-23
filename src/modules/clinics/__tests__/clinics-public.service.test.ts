jest.mock('../clinics-public.repository', () => ({
  findPublishedBranches: jest.fn(),
  findPublishedBranchBySlug: jest.fn(),
  getDistinctFilterOptions: jest.fn(),
}));

jest.mock('../../../config', () => ({ config: { FRONTEND_URL: 'https://bpa.example.com' } }));

import * as repo from '../clinics-public.repository';
import { listPublicClinics, getPublicClinicBySlug } from '../clinics-public.service';
import type { PublicBranchRow } from '../clinics-public.repository';

const mockedFind = repo.findPublishedBranches as jest.Mock;
const mockedFindBySlug = repo.findPublishedBranchBySlug as jest.Mock;

function makeBranch(overrides: Record<string, any> = {}): PublicBranchRow {
  return {
    id: overrides.id ?? 'branch-1',
    organizationId: 'org-1',
    branchName: overrides.branchName ?? 'Alpha Clinic',
    slug: overrides.slug ?? 'alpha-clinic',
    address: null,
    area: null,
    cityCorporation: null,
    district: null,
    postalCode: null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    googleMapUrl: null,
    email: null,
    timezone: 'Asia/Dhaka',
    emergencyAvailability: 'UNKNOWN',
    open24Hours: overrides.open24Hours ?? 'UNKNOWN',
    appointmentRequired: 'UNKNOWN',
    accessibilityNotes: null,
    verificationStatus: 'UNKNOWN',
    lastVerifiedAt: null,
    published: true,
    importNotes: null,
    importKey: null,
    createdById: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: 'org-1',
      name: 'Alpha Organization',
      slug: 'alpha-organization',
      description: null,
      logoUrl: null,
      website: null,
      verificationStatus: 'UNKNOWN',
      claimedStatus: 'UNCLAIMED',
      published: true,
      featured: false,
      createdById: null,
      updatedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    phones: overrides.phones ?? [],
    socialLinks: [],
    openingHours: overrides.openingHours ?? [],
    closures: [],
    services: [],
    animalTypes: [],
    facilities: [],
    images: [],
    ...overrides,
  } as unknown as PublicBranchRow;
}

beforeEach(() => jest.clearAllMocks());

describe('listPublicClinics — pagination', () => {
  it('paginates deterministically and reports accurate meta', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ id: 'b1', branchName: 'Alpha' }),
      makeBranch({ id: 'b2', branchName: 'Bravo' }),
      makeBranch({ id: 'b3', branchName: 'Charlie' }),
    ]);

    const page1 = await listPublicClinics({ page: 1, limit: 2 } as any);
    expect(page1.items.map((i) => i.branchName)).toEqual(['Alpha', 'Bravo']);
    expect(page1.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2, hasNext: true, hasPrev: false });

    const page2 = await listPublicClinics({ page: 2, limit: 2 } as any);
    expect(page2.items.map((i) => i.branchName)).toEqual(['Charlie']);
    expect(page2.meta.hasNext).toBe(false);
    expect(page2.meta.hasPrev).toBe(true);
  });

  it('returns distinct, stable records across three consecutive pages of a larger dataset', async () => {
    // 55 branches — enough to prove pagination holds beyond a single "first
    // ~20-25 results" page, matching the "more than 50 clinics" scale this
    // is meant to guard against a regression to.
    const branches = Array.from({ length: 55 }, (_, i) =>
      makeBranch({ id: `id-${String(i).padStart(2, '0')}`, branchName: `Clinic ${String(i).padStart(2, '0')}` }),
    );
    mockedFind.mockResolvedValue(branches);

    const page1 = await listPublicClinics({ page: 1, limit: 20 } as any);
    const page2 = await listPublicClinics({ page: 2, limit: 20 } as any);
    const page3 = await listPublicClinics({ page: 3, limit: 20 } as any);

    expect(page1.items).toHaveLength(20);
    expect(page2.items).toHaveLength(20);
    expect(page3.items).toHaveLength(15);

    expect(page1.meta).toMatchObject({ page: 1, total: 55, totalPages: 3, hasNext: true, hasPrev: false });
    expect(page2.meta).toMatchObject({ page: 2, total: 55, totalPages: 3, hasNext: true, hasPrev: true });
    expect(page3.meta).toMatchObject({ page: 3, total: 55, totalPages: 3, hasNext: false, hasPrev: true });

    // No overlap and no gaps across the three pages.
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(55);
    expect(allIds).toEqual(branches.map((b) => b.id));
  });

  it('caps the effective page size at the validated max (50), never silently serving more', async () => {
    const branches = Array.from({ length: 60 }, (_, i) => makeBranch({ id: `id-${i}`, branchName: `Clinic ${i}` }));
    mockedFind.mockResolvedValue(branches);

    const page1 = await listPublicClinics({ page: 1, limit: 50 } as any);
    expect(page1.items).toHaveLength(50);
    expect(page1.meta.totalPages).toBe(2);
  });

  it('sorts alphabetically by branch name, then id, when no geo origin is given', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ id: 'b2', branchName: 'Zeta' }),
      makeBranch({ id: 'b1', branchName: 'Alpha' }),
    ]);

    const result = await listPublicClinics({} as any);

    expect(result.items.map((i) => i.branchName)).toEqual(['Alpha', 'Zeta']);
  });

  it('sortBy=recentlyVerified orders by lastVerifiedAt descending, with never-verified branches last', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ id: 'b1', branchName: 'Never Verified', lastVerifiedAt: null }),
      makeBranch({ id: 'b2', branchName: 'Verified Long Ago', lastVerifiedAt: new Date('2026-01-01') }),
      makeBranch({ id: 'b3', branchName: 'Verified Recently', lastVerifiedAt: new Date('2026-07-01') }),
    ]);

    const result = await listPublicClinics({ sortBy: 'recentlyVerified' } as any);

    expect(result.items.map((i) => i.branchName)).toEqual([
      'Verified Recently',
      'Verified Long Ago',
      'Never Verified',
    ]);
  });
});

describe('listPublicClinics — distance', () => {
  it('computes distanceKm and sorts nearest-first when lat/lng are given', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ id: 'far', branchName: 'Far Clinic', latitude: 23.9, longitude: 90.5 }),
      makeBranch({ id: 'near', branchName: 'Near Clinic', latitude: 23.71, longitude: 90.41 }),
    ]);

    const result = await listPublicClinics({ latitude: 23.7, longitude: 90.4, sortBy: 'distance' } as any);

    expect(result.items.map((i) => i.branchName)).toEqual(['Near Clinic', 'Far Clinic']);
    expect(result.items[0].distanceKm).not.toBeNull();
    expect(result.items[0].distanceKm!).toBeLessThan(result.items[1].distanceKm!);
  });

  it('never claims a distance for a branch with unknown coordinates, but still returns it', async () => {
    mockedFind.mockResolvedValue([makeBranch({ id: 'no-coords', latitude: null, longitude: null })]);

    const result = await listPublicClinics({ latitude: 23.7, longitude: 90.4 } as any);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].distanceKm).toBeNull();
    expect(result.items[0].location).toBeNull();
  });

  it('excludes branches outside the radius but keeps unknown-coordinate branches', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ id: 'far', branchName: 'Far', latitude: 25.0, longitude: 92.0 }), // ~250km away
      makeBranch({ id: 'near', branchName: 'Near', latitude: 23.71, longitude: 90.41 }),
      makeBranch({ id: 'unknown', branchName: 'Unknown Location', latitude: null, longitude: null }),
    ]);

    const result = await listPublicClinics({ latitude: 23.7, longitude: 90.4, radiusKm: 20 } as any);

    const names = result.items.map((i) => i.branchName);
    expect(names).toContain('Near');
    expect(names).toContain('Unknown Location');
    expect(names).not.toContain('Far');
  });

  it('returns distanceKm: null for every item when no origin is supplied at all', async () => {
    mockedFind.mockResolvedValue([makeBranch({ latitude: 23.7, longitude: 90.4 })]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].distanceKm).toBeNull();
  });
});

describe('listPublicClinics — UNKNOWN vs false semantics', () => {
  it('open24Hours filter only matches branches explicitly marked YES, never UNKNOWN', async () => {
    mockedFind.mockResolvedValue([]);
    await listPublicClinics({ open24Hours: 'true' } as any);

    expect(mockedFind).toHaveBeenCalledWith(expect.objectContaining({ open24Hours: true }));
  });

  it('an UNKNOWN tri-state value is preserved verbatim in the DTO, not coerced to false', async () => {
    mockedFind.mockResolvedValue([makeBranch({ open24Hours: 'UNKNOWN' })]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].open24Hours).toBe('UNKNOWN');
    expect(result.items[0].open24Hours).not.toBe(false);
  });
});

describe('listPublicClinics — open now filter', () => {
  it('keeps only branches currently OPEN when openNow=true', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({
        id: 'always-open',
        branchName: 'Always Open',
        openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          opensAt: '00:00',
          closesAt: '23:59',
          isClosed: false,
        })),
      }),
      makeBranch({ id: 'no-hours', branchName: 'No Hours On File', openingHours: [] }),
    ]);

    const result = await listPublicClinics({ openNow: 'true' } as any);

    expect(result.items.map((i) => i.branchName)).toEqual(['Always Open']);
  });
});

describe('listPublicClinics — action links', () => {
  it('builds call/whatsapp/directions/share links from branch data, without inventing anything missing', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({
        slug: 'alpha-clinic-banani',
        phones: [
          { phoneNumber: '01711000000', isPrimary: true, whatsappAvailable: 'UNKNOWN', label: null, sortOrder: 0 },
          { phoneNumber: '01722000000', isPrimary: false, whatsappAvailable: 'YES', label: null, sortOrder: 1 },
        ],
      }),
    ]);

    const result = await listPublicClinics({} as any);
    const actions = result.items[0].actions;

    expect(actions.call).toBe('tel:01711000000');
    expect(actions.whatsapp).toBe('https://wa.me/8801722000000');
    expect(actions.share).toBe('https://bpa.example.com/clinics/alpha-clinic-banani');
    expect(actions.website).toBeNull();
  });

  it('never returns a whatsapp link when no phone is explicitly marked YES', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({ phones: [{ phoneNumber: '01711000000', isPrimary: true, whatsappAvailable: 'UNKNOWN', label: null, sortOrder: 0 }] }),
    ]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].actions.whatsapp).toBeNull();
  });

  it('returns a null call link when the branch has no phones at all', async () => {
    mockedFind.mockResolvedValue([makeBranch({ phones: [] })]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].actions.call).toBeNull();
  });
});

describe('getPublicClinicBySlug', () => {
  it('throws a not-found AppError when no published branch matches the slug', async () => {
    mockedFindBySlug.mockResolvedValue(null);

    await expect(getPublicClinicBySlug('does-not-exist')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the DTO with distanceKm: null (detail view never computes distance)', async () => {
    mockedFindBySlug.mockResolvedValue(makeBranch({ latitude: 23.7, longitude: 90.4 }));

    const dto = await getPublicClinicBySlug('alpha-clinic');

    expect(dto.distanceKm).toBeNull();
    expect(dto.location).toEqual({ latitude: 23.7, longitude: 90.4 });
  });
});

describe('listPublicClinics — Media Library resolution for logo/cover/gallery', () => {
  it('prefers the Media Library asset URL over the legacy plain-URL field when both are set', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({
        organization: {
          id: 'org-1',
          name: 'Alpha Organization',
          slug: 'alpha-organization',
          logoUrl: 'https://legacy.example.com/logo.jpg',
          logoMedia: { url: 'https://cdn.example.com/media/logo.jpg' },
          coverImageUrl: 'https://legacy.example.com/cover.jpg',
          coverMedia: { url: 'https://cdn.example.com/media/cover.jpg' },
          website: null,
          featured: false,
        },
        images: [{ url: 'https://legacy.example.com/gallery-1.jpg', mediaFile: { url: 'https://cdn.example.com/media/gallery-1.jpg' }, isCover: true, altText: null }],
      }),
    ]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].organizationLogoUrl).toBe('https://cdn.example.com/media/logo.jpg');
    expect(result.items[0].organizationCoverUrl).toBe('https://cdn.example.com/media/cover.jpg');
    expect(result.items[0].images[0].url).toBe('https://cdn.example.com/media/gallery-1.jpg');
  });

  it('falls back to the legacy plain-URL field when no Media Library asset is selected', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({
        organization: {
          id: 'org-1',
          name: 'Alpha Organization',
          slug: 'alpha-organization',
          logoUrl: 'https://legacy.example.com/logo.jpg',
          logoMedia: null,
          coverImageUrl: null,
          coverMedia: null,
          website: null,
          featured: false,
        },
        images: [{ url: 'https://legacy.example.com/gallery-1.jpg', mediaFile: null, isCover: true, altText: null }],
      }),
    ]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].organizationLogoUrl).toBe('https://legacy.example.com/logo.jpg');
    expect(result.items[0].organizationCoverUrl).toBeNull();
    expect(result.items[0].images[0].url).toBe('https://legacy.example.com/gallery-1.jpg');
  });

  it('never exposes a raw media ID or storage path — only a resolved URL or null', async () => {
    mockedFind.mockResolvedValue([
      makeBranch({
        organization: {
          id: 'org-1',
          name: 'Alpha Organization',
          slug: 'alpha-organization',
          logoUrl: null,
          logoMedia: null,
          coverImageUrl: null,
          coverMedia: null,
          website: null,
          featured: false,
        },
      }),
    ]);

    const result = await listPublicClinics({} as any);

    expect(result.items[0].organizationLogoUrl).toBeNull();
    expect(result.items[0].organizationCoverUrl).toBeNull();
  });
});

describe('listPublicClinics — facility and appointment-required filters', () => {
  it('passes facilityType through to the repository so only CONFIRMED (available=YES) facilities match', async () => {
    mockedFind.mockResolvedValue([]);

    await listPublicClinics({ facilityType: 'SURGERY' } as any);

    expect(mockedFind).toHaveBeenCalledWith(expect.objectContaining({ facilityType: 'SURGERY' }));
  });

  it('passes appointmentRequired=true through as a boolean, derived from the "true" string flag', async () => {
    mockedFind.mockResolvedValue([]);

    await listPublicClinics({ appointmentRequired: 'true' } as any);

    expect(mockedFind).toHaveBeenCalledWith(expect.objectContaining({ appointmentRequired: true }));
  });

  it('does not send a facilityType/appointmentRequired filter when absent from the query', async () => {
    mockedFind.mockResolvedValue([]);

    await listPublicClinics({} as any);

    expect(mockedFind).toHaveBeenCalledWith(expect.objectContaining({ facilityType: undefined, appointmentRequired: false }));
  });

  it('passes organizationSlug through — used by the "other branches" section on a clinic detail page', async () => {
    mockedFind.mockResolvedValue([]);

    await listPublicClinics({ organizationSlug: 'alpha-organization' } as any);

    expect(mockedFind).toHaveBeenCalledWith(expect.objectContaining({ organizationSlug: 'alpha-organization' }));
  });
});
