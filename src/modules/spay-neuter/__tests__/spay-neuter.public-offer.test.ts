import { prisma } from '../../../database/prisma';
import { getPublicOffer, listPublicOffers, computeOfferLifecycleState, computeOfferBookable } from '../spay-neuter.availability.service';

// Regression test for a confirmed cross-repo contract-drift defect: before
// this endpoint existed, no owner-facing client (Flutter, public web) had
// any way to fetch a SpayOffer's real price/advance/policy text — the
// mobile app was falling back to an unrelated CampaignModel with zero real
// backing data. This suite locks in the fix: published-only, output-
// minimized (no admin/audit fields).

describe('getPublicOffer (public offer detail)', () => {
  const suffix = Date.now();
  const offerIds: string[] = [];

  afterAll(async () => {
    await prisma.spayOffer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.$disconnect();
  });

  async function makeOffer(status: 'draft' | 'published' | 'paused' | 'completed', overrides: Partial<{ deletedAt: Date | null }> = {}) {
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Public Offer Test',
        slug: `public-offer-test-${suffix}-${offerIds.length}`,
        summary: 'Affordable spay & neuter',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        eligibilityText: 'Any healthy pet',
        status,
        ...overrides,
      },
    });
    offerIds.push(offer.id);
    return offer;
  }

  it('returns full public-safe detail for a published offer', async () => {
    const offer = await makeOffer('published');
    const dto = await getPublicOffer(offer.id);

    expect(dto.id).toBe(offer.id);
    expect(dto.title).toBe('Public Offer Test');
    expect(Number(dto.neuterTotalPriceBdt)).toBe(2000);
    expect(Number(dto.spayTotalPriceBdt)).toBe(3500);
    expect(Number(dto.advanceBdt)).toBe(500);
    expect(dto.eligibilityText).toBe('Any healthy pet');
  });

  it('exposes a normalized serviceChoices array with server-computed remaining amounts', async () => {
    const offer = await makeOffer('published');
    const dto = await getPublicOffer(offer.id);

    expect(dto.serviceChoices).toHaveLength(2);
    const neuter = dto.serviceChoices.find((c) => c.code === 'NEUTER')!;
    const spay = dto.serviceChoices.find((c) => c.code === 'SPAY')!;
    expect(neuter).toMatchObject({ totalAmount: 2000, advanceAmount: 500, remainingAmount: 1500, durationMinutes: 20, enabled: true });
    expect(spay).toMatchObject({ totalAmount: 3500, advanceAmount: 500, remainingAmount: 3000, durationMinutes: 40, enabled: true });
  });

  it('does not leak admin/audit-only fields', async () => {
    const offer = await makeOffer('published');
    const dto = await getPublicOffer(offer.id);
    expect(dto).not.toHaveProperty('createdById');
    expect(dto).not.toHaveProperty('updatedById');
    expect(dto).not.toHaveProperty('deletedAt');
  });

  it('rejects a draft offer (not yet published) with 404, not a data leak', async () => {
    const offer = await makeOffer('draft');
    await expect(getPublicOffer(offer.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a paused offer with 404', async () => {
    const offer = await makeOffer('paused');
    await expect(getPublicOffer(offer.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a completed (closed-to-new-bookings) offer with 404', async () => {
    const offer = await makeOffer('completed');
    await expect(getPublicOffer(offer.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an unknown offer id with 404', async () => {
    await expect(getPublicOffer('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('includes lifecycle dates and a derived lifecycleState/bookable flag', async () => {
    const offer = await makeOffer('published', {
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 30 * 86_400_000),
    } as never);
    const dto = await getPublicOffer(offer.id);
    expect(dto.lifecycleState).toBe('active');
    expect(dto.bookable).toBe(true);
  });
});

describe('listPublicOffers', () => {
  const suffix = Date.now();
  const offerIds: string[] = [];

  afterAll(async () => {
    await prisma.spayOffer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.$disconnect();
  });

  async function makeOffer(overrides: Partial<{ status: string; startsAt: Date | null; endsAt: Date | null; deletedAt: Date | null }>) {
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'List Public Offer Test',
        slug: `list-public-offer-test-${suffix}-${offerIds.length}`,
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        status: 'published',
        ...overrides,
      } as never,
    });
    offerIds.push(offer.id);
    return offer;
  }

  it('lists a published, not-yet-ended offer', async () => {
    const offer = await makeOffer({ endsAt: new Date(Date.now() + 30 * 86_400_000) });
    const offers = await listPublicOffers();
    expect(offers.some((o) => o.id === offer.id)).toBe(true);
  });

  it('excludes a published offer whose endsAt has already passed', async () => {
    const offer = await makeOffer({ endsAt: new Date(Date.now() - 86_400_000) });
    const offers = await listPublicOffers();
    expect(offers.some((o) => o.id === offer.id)).toBe(false);
  });

  it('excludes a draft offer', async () => {
    const offer = await makeOffer({ status: 'draft' });
    const offers = await listPublicOffers();
    expect(offers.some((o) => o.id === offer.id)).toBe(false);
  });
});

describe('computeOfferLifecycleState / computeOfferBookable', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  it('is "closed" whenever status is not published, regardless of dates', () => {
    expect(computeOfferLifecycleState({ status: 'paused', startsAt: null, endsAt: null }, now)).toBe('closed');
    expect(computeOfferBookable({ status: 'paused', startsAt: null, endsAt: null, bookingOpensAt: null, bookingClosesAt: null }, now)).toBe(false);
  });

  it('is "scheduled" before startsAt and not bookable', () => {
    const startsAt = new Date('2026-07-01T00:00:00Z');
    expect(computeOfferLifecycleState({ status: 'published', startsAt, endsAt: null }, now)).toBe('scheduled');
    expect(computeOfferBookable({ status: 'published', startsAt, endsAt: null, bookingOpensAt: null, bookingClosesAt: null }, now)).toBe(false);
  });

  it('is "expired" after endsAt and not bookable', () => {
    const endsAt = new Date('2026-05-01T00:00:00Z');
    expect(computeOfferLifecycleState({ status: 'published', startsAt: null, endsAt }, now)).toBe('expired');
    expect(computeOfferBookable({ status: 'published', startsAt: null, endsAt, bookingOpensAt: null, bookingClosesAt: null }, now)).toBe(false);
  });

  it('is "active" and bookable within the window with no narrower booking dates', () => {
    const startsAt = new Date('2026-06-01T00:00:00Z');
    const endsAt = new Date('2026-06-30T00:00:00Z');
    expect(computeOfferLifecycleState({ status: 'published', startsAt, endsAt }, now)).toBe('active');
    expect(computeOfferBookable({ status: 'published', startsAt, endsAt, bookingOpensAt: null, bookingClosesAt: null }, now)).toBe(true);
  });

  it('is "active" but not bookable once bookingClosesAt has passed, even mid-service-period', () => {
    const startsAt = new Date('2026-06-01T00:00:00Z');
    const endsAt = new Date('2026-06-30T00:00:00Z');
    const bookingClosesAt = new Date('2026-06-10T00:00:00Z');
    expect(computeOfferLifecycleState({ status: 'published', startsAt, endsAt }, now)).toBe('active');
    expect(computeOfferBookable({ status: 'published', startsAt, endsAt, bookingOpensAt: null, bookingClosesAt }, now)).toBe(false);
  });
});

describe('getPublicOfferVideo (public one-video endpoint)', () => {
  const suffix = Date.now();
  const offerIds: string[] = [];

  afterAll(async () => {
    await prisma.spayOffer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.$disconnect();
  });

  async function makeOffer(status: 'draft' | 'published' | 'paused' | 'completed') {
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Public Offer Test',
        slug: `public-offer-vid-${suffix}-${offerIds.length}`,
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
        status,
      },
    });
    offerIds.push(offer.id);
    return offer;
  }

  it('returns 404 for an unpublished video on a published offer', async () => {
    const offer = await makeOffer('published');
    const video = await prisma.spayOfferVideo.create({
      data: { offerId: offer.id, videoId: 'dQw4w9WgXcQ', title: 'Unpub', isActive: false },
    });
    const { getPublicOfferVideo } = await import('../spay-neuter.availability.service');
    await expect(getPublicOfferVideo(offer.id, video.id)).rejects.toMatchObject({ name: 'AppError', statusCode: 404 });
  });

  it('returns 404 for a published video requested under the wrong offerId (cross-offer protection)', async () => {
    const offer1 = await makeOffer('published');
    const offer2 = await makeOffer('published');
    const video = await prisma.spayOfferVideo.create({
      data: { offerId: offer1.id, videoId: 'dQw4w9WgXcQ', title: 'Pub', isActive: true },
    });
    const { getPublicOfferVideo } = await import('../spay-neuter.availability.service');
    await expect(getPublicOfferVideo(offer2.id, video.id)).rejects.toMatchObject({ name: 'AppError', statusCode: 404 });
  });

  it('returns the video for a valid published request', async () => {
    const offer = await makeOffer('published');
    const video = await prisma.spayOfferVideo.create({
      data: { offerId: offer.id, videoId: 'dQw4w9WgXcQ', title: 'Pub', isActive: true, sortOrder: 5 },
    });
    const { getPublicOfferVideo } = await import('../spay-neuter.availability.service');
    const result = await getPublicOfferVideo(offer.id, video.id);
    expect(result.videoId).toBe('dQw4w9WgXcQ');
    expect(result.sortOrder).toBe(5);
  });
});
