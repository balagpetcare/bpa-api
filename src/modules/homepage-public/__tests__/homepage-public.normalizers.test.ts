import {
  normalizeAppShowcase,
  normalizeClinic,
  normalizeDocument,
  normalizeNews,
  normalizeProgram,
  normalizeSpayOffer,
  normalizeVaccinationCampaign,
  normalizeVideo,
} from '../homepage-public.normalizers';

describe('normalizeVaccinationCampaign', () => {
  it('normalizes a Campaign row into the shared FeaturedCampaignDto shape', () => {
    const dto = normalizeVaccinationCampaign({
      id: 'c1',
      slug: 'winter-vaccination-2026',
      title: 'Winter Vaccination Drive 2026',
      description: 'Free rabies vaccination for stray and owned pets.',
      status: 'registration_open',
      startDate: new Date('2026-01-10T00:00:00Z'),
      endDate: new Date('2026-01-20T00:00:00Z'),
      registrationOpenAt: new Date('2026-01-01T00:00:00Z'),
      registrationCloseAt: new Date('2026-01-15T00:00:00Z'),
      basePriceBdt: 250 as unknown as never,
      coverImage: { id: 'm1', url: 'https://cdn.example.com/cover.jpg', altText: 'Vaccination drive' },
      homepageThumbnailMedia: { id: 'ht1', url: 'https://cdn.example.com/homepage-thumb.jpg', altText: 'Homepage thumb' },
      media: [],
      sessions: [{ venue: { name: 'Gulshan Community Center' } }, { venue: { name: 'Dhanmondi Vet Camp' } }],
    } as any);

    expect(dto).toMatchObject({
      id: 'c1',
      kind: 'VACCINATION',
      slug: 'winter-vaccination-2026',
      title: 'Winter Vaccination Drive 2026',
      status: 'registration_open',
      statusLabel: 'Registration Open',
      isOpenForAction: true,
      ctaLabel: 'Register Now',
      pricing: { currency: 'BDT', amountFrom: 250, amountTo: 250 },
      coverImage: { id: 'm1', url: 'https://cdn.example.com/cover.jpg', altText: 'Vaccination drive' },
      // Dedicated homepage thumbnail wins over coverImage in the fallback chain.
      thumbnailUrl: 'https://cdn.example.com/homepage-thumb.jpg',
      thumbnailAlt: 'Homepage thumb',
      locationSummary: ['Gulshan Community Center', 'Dhanmondi Vet Camp'],
      ctaHref: '/campaigns/winter-vaccination-2026',
    });
    expect(dto.startDate).toBe('2026-01-10T00:00:00.000Z');
    expect(dto.registrationOrBookingClosesAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('never leaks a null coverImage as anything but null, and reports an empty location summary when no sessions exist', () => {
    const dto = normalizeVaccinationCampaign({
      id: 'c2',
      slug: 'no-image-campaign',
      title: 'No Image Campaign',
      description: null,
      status: 'published',
      startDate: new Date('2026-02-01T00:00:00Z'),
      endDate: new Date('2026-02-05T00:00:00Z'),
      registrationOpenAt: null,
      registrationCloseAt: null,
      basePriceBdt: 0 as unknown as never,
      coverImage: null,
      homepageThumbnailMedia: null,
      media: [],
      sessions: [],
    } as any);

    expect(dto.coverImage).toBeNull();
    expect(dto.registrationOrBookingOpensAt).toBeNull();
    expect(dto.locationSummary).toEqual([]);
    expect(dto.statusLabel).toBe('Upcoming');
    expect(dto.isOpenForAction).toBe(false);
    // No dedicated thumbnail, cover image, or legacy media anywhere in the
    // chain — must render as a clean null, never a broken image.
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.thumbnailAlt).toBeNull();
  });

  it('falls back to legacy role=thumbnail campaign media when there is no dedicated homepage thumbnail or cover image', () => {
    const dto = normalizeVaccinationCampaign({
      id: 'c4',
      slug: 'legacy-media-campaign',
      title: 'Legacy Media Campaign',
      description: null,
      status: 'published',
      startDate: new Date('2026-03-01T00:00:00Z'),
      endDate: new Date('2026-03-05T00:00:00Z'),
      registrationOpenAt: null,
      registrationCloseAt: null,
      basePriceBdt: 0 as unknown as never,
      coverImage: null,
      homepageThumbnailMedia: null,
      media: [{ mediaFile: { id: 'legacy1', url: 'https://cdn.example.com/legacy-thumb.jpg', altText: null } }],
      sessions: [],
    } as any);

    expect(dto.thumbnailUrl).toBe('https://cdn.example.com/legacy-thumb.jpg');
    // No altText on the legacy media row, so the campaign title is used instead.
    expect(dto.thumbnailAlt).toBe('Legacy Media Campaign');
  });

  it('labels a completed campaign as Completed and never open for action', () => {
    const dto = normalizeVaccinationCampaign({
      id: 'c3',
      slug: 'completed-campaign',
      title: 'Completed Campaign',
      description: null,
      status: 'completed',
      startDate: new Date('2025-01-01T00:00:00Z'),
      endDate: new Date('2025-01-05T00:00:00Z'),
      registrationOpenAt: null,
      registrationCloseAt: new Date('2025-01-04T00:00:00Z'),
      basePriceBdt: 0 as unknown as never,
      coverImage: null,
      homepageThumbnailMedia: null,
      media: [],
      sessions: [],
    } as any);

    expect(dto.statusLabel).toBe('Completed');
    expect(dto.isOpenForAction).toBe(false);
  });
});

describe('normalizeSpayOffer', () => {
  it('normalizes a SpayOffer row into the SAME FeaturedCampaignDto shape as a vaccination campaign', () => {
    const bookingOpensAt = new Date(Date.now() - 10 * 86_400_000);
    const bookingClosesAt = new Date(Date.now() + 20 * 86_400_000);
    const dto = normalizeSpayOffer({
      id: 's1',
      slug: 'free-spay-neuter-dhaka',
      title: 'Free Spay & Neuter — Dhaka',
      summary: 'Subsidized spay/neuter for owned pets.',
      description: 'Longer description.',
      status: 'published',
      startsAt: new Date(Date.now() - 5 * 86_400_000),
      endsAt: new Date(Date.now() + 30 * 86_400_000),
      bookingOpensAt,
      bookingClosesAt,
      neuterTotalPriceBdt: 1500 as unknown as never,
      spayTotalPriceBdt: 2000 as unknown as never,
      mobileImage: { id: 'm2', url: 'https://cdn.example.com/mobile.jpg', altText: null },
      webImage: { id: 'm3', url: 'https://cdn.example.com/web.jpg', altText: 'Web banner' },
      homepageThumbnailMedia: { id: 'ht2', url: 'https://cdn.example.com/homepage-thumb-spay.jpg', altText: 'Spay homepage thumb' },
      clinics: [
        { clinicBranch: { branchName: 'MewMew Pet Care — Banasree', area: 'Banasree', district: 'Dhaka' } },
        { clinicBranch: { branchName: 'MewMew Pet Care — Banasree', area: 'Banasree', district: 'Dhaka' } },
        { clinicBranch: { branchName: 'PetCare Uttara', area: 'Uttara', district: 'Dhaka' } },
      ],
    } as any);

    expect(dto).toMatchObject({
      id: 's1',
      kind: 'SPAY_NEUTER',
      slug: 'free-spay-neuter-dhaka',
      title: 'Free Spay & Neuter — Dhaka',
      status: 'published',
      // bookingOpensAt/bookingClosesAt both bracket "now" in this fixture, so
      // a published offer is genuinely open for booking.
      statusLabel: 'Booking Open',
      isOpenForAction: true,
      ctaLabel: 'Book Now',
      pricing: { currency: 'BDT', amountFrom: 1500, amountTo: 2000 },
      // The Spay & Neuter detail route is id-based (/spay-neuter/[offerId]),
      // unlike the slug-based Campaign detail route — verified against
      // bpa_web's app/spay-neuter/[offerId]/page.tsx.
      ctaHref: '/spay-neuter/s1',
    });
    // Prefers the web image when both are present (legacy coverImage field).
    expect(dto.coverImage).toMatchObject({ id: 'm3', url: 'https://cdn.example.com/web.jpg' });
    // Dedicated homepage thumbnail wins over web/mobile image in the new
    // normalized thumbnail contract.
    expect(dto.thumbnailUrl).toBe('https://cdn.example.com/homepage-thumb-spay.jpg');
    expect(dto.thumbnailAlt).toBe('Spay homepage thumb');
    // De-dupes repeated clinic names.
    expect(dto.locationSummary).toEqual(['MewMew Pet Care — Banasree', 'PetCare Uttara']);
    // Same field names as the vaccination-campaign DTO — this is the whole
    // point of the normalization.
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id', 'kind', 'slug', 'title', 'summary', 'status', 'statusLabel', 'isOpenForAction',
        'startDate', 'endDate', 'registrationOrBookingOpensAt', 'registrationOrBookingClosesAt',
        'pricing', 'coverImage', 'thumbnailUrl', 'thumbnailAlt', 'locationSummary', 'ctaHref', 'ctaLabel',
      ].sort(),
    );
  });

  it('falls back to the mobile image when no web image is set, and reports Upcoming before the booking window opens', () => {
    const future = new Date(Date.now() + 30 * 86_400_000);
    const dto = normalizeSpayOffer({
      id: 's2',
      slug: 'mobile-only-offer',
      title: 'Mobile Only Offer',
      summary: null,
      description: null,
      status: 'published',
      startsAt: null,
      endsAt: null,
      bookingOpensAt: future,
      bookingClosesAt: null,
      neuterTotalPriceBdt: 1000 as unknown as never,
      spayTotalPriceBdt: 1000 as unknown as never,
      mobileImage: { id: 'm4', url: 'https://cdn.example.com/mobile-only.jpg', altText: null },
      webImage: null,
      homepageThumbnailMedia: null,
      clinics: [],
    } as any);

    expect(dto.coverImage).toMatchObject({ id: 'm4' });
    expect(dto.pricing).toEqual({ currency: 'BDT', amountFrom: 1000, amountTo: 1000 });
    expect(dto.locationSummary).toEqual([]);
    expect(dto.statusLabel).toBe('Upcoming');
    expect(dto.isOpenForAction).toBe(false);
    // No dedicated homepage thumbnail set — falls through to the web-image
    // rung of the chain, which is also unset here, then mobile image.
    expect(dto.thumbnailUrl).toBe('https://cdn.example.com/mobile-only.jpg');
  });

  it('resolves thumbnailUrl/thumbnailAlt to null when no media exists anywhere in the fallback chain', () => {
    const dto = normalizeSpayOffer({
      id: 's3',
      slug: 'no-media-offer',
      title: 'No Media Offer',
      summary: null,
      description: null,
      status: 'published',
      startsAt: null,
      endsAt: null,
      bookingOpensAt: null,
      bookingClosesAt: null,
      neuterTotalPriceBdt: 1000 as unknown as never,
      spayTotalPriceBdt: 1000 as unknown as never,
      mobileImage: null,
      webImage: null,
      homepageThumbnailMedia: null,
      clinics: [],
    } as any);

    expect(dto.coverImage).toBeNull();
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.thumbnailAlt).toBeNull();
  });
});

describe('normalizeProgram', () => {
  it('maps a BpaProgram row to the public DTO, resolving the icon via the central media system', () => {
    const dto = normalizeProgram({
      id: 'p1',
      key: 'vaccination',
      titleEn: 'Vaccination',
      descriptionEn: 'Free/low-cost vaccination for pets and strays.',
      iconKey: 'syringe',
      ctaLabel: 'Learn more',
      ctaHref: '/campaigns',
      iconMedia: { id: 'm5', url: 'https://cdn.example.com/icon.svg', altText: 'Syringe icon' },
    });

    expect(dto).toEqual({
      id: 'p1',
      key: 'vaccination',
      title: 'Vaccination',
      description: 'Free/low-cost vaccination for pets and strays.',
      iconKey: 'syringe',
      iconMedia: { id: 'm5', url: 'https://cdn.example.com/icon.svg', altText: 'Syringe icon' },
      ctaLabel: 'Learn more',
      ctaHref: '/campaigns',
    });
  });
});

describe('normalizeVideo', () => {
  it('prefers thumbnailUrl over coverImageUrl and titleEn over titleBn', () => {
    const dto = normalizeVideo({
      id: 'v1',
      slug: 'rescue-story',
      titleEn: 'A Rescue Story',
      titleBn: 'একটি উদ্ধার গল্প',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      videoProvider: 'youtube',
      durationSeconds: 95,
      publishedAt: new Date('2026-01-05T00:00:00Z'),
    });

    expect(dto.title).toBe('A Rescue Story');
    expect(dto.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(dto.publishedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('falls back to titleBn and coverImageUrl when the English/thumbnail fields are empty', () => {
    const dto = normalizeVideo({
      id: 'v2',
      slug: 'no-english',
      titleEn: '',
      titleBn: 'শিরোনাম',
      thumbnailUrl: null,
      coverImageUrl: 'https://cdn.example.com/cover-only.jpg',
      videoProvider: null,
      durationSeconds: null,
      publishedAt: null,
    });

    expect(dto.title).toBe('শিরোনাম');
    expect(dto.thumbnailUrl).toBe('https://cdn.example.com/cover-only.jpg');
    expect(dto.publishedAt).toBeNull();
  });

  it('surfaces category name and English/Bengali summary fallback for the Learning Hub card', () => {
    const withCategory = normalizeVideo({
      id: 'v3',
      slug: 'vaccination-explainer',
      titleEn: 'Why Vaccination Matters',
      titleBn: null,
      summaryEn: 'A short explainer on core vaccines for cats and dogs.',
      summaryBn: null,
      thumbnailUrl: 'https://cdn.example.com/vax-thumb.jpg',
      coverImageUrl: null,
      videoProvider: 'youtube',
      durationSeconds: 187,
      publishedAt: new Date('2026-02-01T00:00:00Z'),
      category: { nameEn: 'Health Education' },
    });

    expect(withCategory.category).toBe('Health Education');
    expect(withCategory.description).toBe('A short explainer on core vaccines for cats and dogs.');
    expect(withCategory.durationSeconds).toBe(187);

    const withoutCategory = normalizeVideo({
      id: 'v4',
      slug: 'no-category',
      titleEn: 'Untitled',
      titleBn: null,
      summaryEn: null,
      summaryBn: 'বাংলা সারাংশ',
      thumbnailUrl: null,
      coverImageUrl: null,
      videoProvider: null,
      durationSeconds: null,
      publishedAt: null,
      category: null,
    });

    expect(withoutCategory.category).toBeNull();
    expect(withoutCategory.description).toBe('বাংলা সারাংশ');
  });
});

describe('normalizeAppShowcase', () => {
  it('normalizes a fully-configured LIVE app with features, screenshots, and per-platform links', () => {
    const dto = normalizeAppShowcase({
      appKey: 'bpa',
      name: 'BPA App',
      tagline: 'Your national pet welfare companion',
      description: 'Manage campaigns, memberships, and pets in one place.',
      relationshipLabel: 'Official BPA app',
      iconMedia: { id: 'm6', url: 'https://cdn.example.com/bpa-icon.png', altText: null },
      features: [{ label: 'Campaign registration' }, { label: 'Spay & Neuter booking' }, { label: 'Find Clinic' }],
      screenshots: [
        { mediaFile: { id: 'sc1', url: 'https://cdn.example.com/bpa-shot-1.png', altText: null } },
        { mediaFile: { id: 'sc2', url: 'https://cdn.example.com/bpa-shot-2.png', altText: null } },
      ],
      platforms: [
        {
          platform: 'ANDROID',
          availability: 'LIVE',
          storeUrl: 'https://play.google.com/store/apps/details?id=bpa',
          qrCodeMedia: { id: 'qr1', url: 'https://cdn.example.com/bpa-qr.png', altText: null },
        },
        { platform: 'IOS', availability: 'COMING_SOON', storeUrl: null, qrCodeMedia: null },
      ],
    } as any);

    expect(dto.appKey).toBe('bpa');
    expect(dto.relationshipLabel).toBe('Official BPA app');
    expect(dto.features).toEqual(['Campaign registration', 'Spay & Neuter booking', 'Find Clinic']);
    expect(dto.screenshots).toEqual([
      { id: 'sc1', url: 'https://cdn.example.com/bpa-shot-1.png', altText: null },
      { id: 'sc2', url: 'https://cdn.example.com/bpa-shot-2.png', altText: null },
    ]);
    expect(dto.platforms).toEqual([
      {
        platform: 'ANDROID',
        availability: 'LIVE',
        storeUrl: 'https://play.google.com/store/apps/details?id=bpa',
        qrCode: { id: 'qr1', url: 'https://cdn.example.com/bpa-qr.png', altText: null },
      },
      { platform: 'IOS', availability: 'COMING_SOON', storeUrl: null, qrCode: null },
    ]);
  });

  it('never surfaces a storeUrl for a non-LIVE platform even if one is somehow present on the row', () => {
    // Defensive case: the write layer should never allow this, but the
    // normalizer must not trust it either.
    const dto = normalizeAppShowcase({
      appKey: 'furtail',
      name: 'Furtail',
      tagline: null,
      description: null,
      relationshipLabel: null,
      iconMedia: null,
      features: [],
      screenshots: [],
      platforms: [
        { platform: 'ANDROID', availability: 'COMING_SOON', storeUrl: 'https://play.google.com/store/apps/details?id=furtail-leaked', qrCodeMedia: null },
      ],
    } as any);

    expect(dto.platforms[0].storeUrl).toBeNull();
    expect(dto.relationshipLabel).toBeNull();
  });
});

describe('normalizeClinic', () => {
  it('resolves the logo through the organization relation via the central media system', () => {
    const dto = normalizeClinic({
      id: 'cl1',
      slug: 'mewmew-pet-care-banasree',
      branchName: 'MewMew Pet Care — Banasree',
      area: 'Banasree',
      district: 'Dhaka',
      organization: { logoMedia: { id: 'm7', url: 'https://cdn.example.com/org-logo.png', altText: 'MewMew logo' } },
    });

    expect(dto.logo).toEqual({ id: 'm7', url: 'https://cdn.example.com/org-logo.png', altText: 'MewMew logo' });
  });

  it('returns a null logo when the organization has none', () => {
    const dto = normalizeClinic({
      id: 'cl2',
      slug: null,
      branchName: 'No Logo Clinic',
      area: null,
      district: null,
      organization: null,
    });

    expect(dto.logo).toBeNull();
    expect(dto.slug).toBeNull();
  });
});

describe('normalizeDocument', () => {
  it('prefers the central-media file URL over a raw externalUrl', () => {
    const dto = normalizeDocument({
      id: 'd1',
      key: 'privacy-policy',
      titleEn: 'Privacy Policy',
      category: 'LEGAL',
      summary: null,
      version: '1.2',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      externalUrl: 'https://example.com/should-not-win.pdf',
      fileMedia: { url: 'https://cdn.example.com/privacy-policy.pdf' },
    });

    expect(dto.url).toBe('https://cdn.example.com/privacy-policy.pdf');
  });

  it('falls back to externalUrl when no media file is attached', () => {
    const dto = normalizeDocument({
      id: 'd2',
      key: 'annual-report-2026',
      titleEn: 'Annual Report 2026',
      category: 'GOVERNANCE',
      summary: 'Yearly transparency report.',
      version: null,
      publishedAt: null,
      externalUrl: 'https://example.com/annual-report.pdf',
      fileMedia: null,
    });

    expect(dto.url).toBe('https://example.com/annual-report.pdf');
  });
});

describe('normalizeNews', () => {
  it('maps a News row to the public summary DTO', () => {
    const dto = normalizeNews({
      id: 'n1',
      slug: 'bpa-launches-new-clinic',
      title: 'BPA Launches New Partner Clinic',
      excerpt: 'A new partner clinic opens in Dhaka.',
      publishedAt: new Date('2026-01-02T00:00:00Z'),
      coverImage: { url: 'https://cdn.example.com/news-cover.jpg' },
    });

    expect(dto).toMatchObject({
      id: 'n1',
      slug: 'bpa-launches-new-clinic',
      title: 'BPA Launches New Partner Clinic',
      coverImageUrl: 'https://cdn.example.com/news-cover.jpg',
    });
  });
});
