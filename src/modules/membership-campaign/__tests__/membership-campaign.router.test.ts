import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MembershipApplicationStatus, MembershipCampaignStatus } from '@prisma/client';
import app from '../../../app';
import { prisma } from '../../../database/prisma';
import { config } from '../../../config';
import {
  createMembershipApplication,
  createMembershipApplicationPayment,
  activateMembershipFromApplication,
  handleMembershipApplicationPaymentSuccess,
} from '../membership-campaign.service';
import { updatePaymentStatus } from '../../payments/payments.repository';

describe('Membership Campaign Router', () => {
  const createdIds: Record<string, string[]> = {
    campaigns: [],
    plans: [],
    applications: [],
    memberships: [],
    users: [],
  };

  let userWithMembershipId: string;
  let userWithMembershipToken: string;
  let userWithoutMembershipToken: string;
  let primaryTierId: string;

  function signCentralToken(sub: string) {
    if (!config.CENTRAL_AUTH_JWT_SECRET) {
      throw new Error('CENTRAL_AUTH_JWT_SECRET is required for membership router tests');
    }
    return jwt.sign(
      { sub, email: `${sub}@example.com`, roles: ['user'] },
      config.CENTRAL_AUTH_JWT_SECRET,
      {
        algorithm: config.CENTRAL_AUTH_JWT_ALGORITHM as jwt.Algorithm,
        issuer: config.CENTRAL_AUTH_JWT_ISSUER,
        audience: config.CENTRAL_AUTH_JWT_AUDIENCE,
        expiresIn: '1h',
      },
    );
  }

  async function createCampaignFixture(params: {
    slugPrefix: string;
    status: MembershipCampaignStatus;
    offerStartAt: Date | null;
    offerEndAt: Date | null;
    applicationStartAt: Date | null;
    applicationEndAt: Date | null;
    title: string;
    heroImageUrl?: string | null;
    mobileImageUrl?: string | null;
    thumbnailUrl?: string | null;
    regularPrice?: number;
    offerPrice?: number | null;
  }) {
    const campaign = await prisma.membershipCampaign.create({
      data: {
        slug: `${params.slugPrefix}-${Date.now()}`,
        titleEn: params.title,
        titleBn: `${params.title} BN`,
        shortDescriptionEn: `${params.title} summary`,
        shortDescriptionBn: `${params.title} summary bn`,
        heroImageUrl: params.heroImageUrl ?? null,
        mobileImageUrl: params.mobileImageUrl ?? null,
        thumbnailUrl: params.thumbnailUrl ?? null,
        status: params.status,
        offerStartAt: params.offerStartAt,
        offerEndAt: params.offerEndAt,
        applicationStartAt: params.applicationStartAt,
        applicationEndAt: params.applicationEndAt,
        publishedAt: new Date(),
        plans: {
          create: {
            tierId: primaryTierId,
            code: `${params.slugPrefix.toUpperCase()}-${Date.now()}`,
            nameEn: `${params.title} Plan`,
            nameBn: `${params.title} Plan BN`,
            regularPrice: params.regularPrice ?? 10000,
            offerPrice: params.offerPrice ?? 3000,
            regularPriceSnapshot: params.regularPrice ?? 10000,
            campaignPrice: params.offerPrice ?? 3000,
            minPetsSnapshot: 1,
            includedPetsSnapshot: 3,
            maxPetsSnapshot: 3,
            maxCoveredPets: 3,
            validityYears: 1,
            validityMonths: 12,
            validityMonthsSnapshot: 12,
            tierVersion: 1,
            maximumReplacementCount: 1,
            isActive: true,
          },
        },
      },
      include: { plans: true },
    });

    createdIds.campaigns.push(campaign.id);
    createdIds.plans.push(...campaign.plans.map((plan) => plan.id));
    return campaign;
  }

  async function createActivatedMembership(label: string, campaignId: string, planId: string) {
    const draft = await createMembershipApplication(
      userWithMembershipId,
      {
        campaignId,
        planId,
        applicantName: `${label} User`,
        applicantMobile: '01710000000',
        applicantEmail: 'member@example.com',
        applicantAddress: 'Dhaka',
      },
      {},
    );
    createdIds.applications.push(draft.id);

    await prisma.membershipApplication.update({
      where: { id: draft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });

    const paymentResult = await createMembershipApplicationPayment(userWithMembershipId, draft.id, { expectedAmount: 3000 }, {});
    await updatePaymentStatus(paymentResult.payment.id, 'success');
    await handleMembershipApplicationPaymentSuccess(paymentResult.payment.id);

    const membership = await activateMembershipFromApplication(draft.id, {}, {});
    createdIds.memberships.push(membership.id);
    return membership;
  }

  beforeAll(async () => {
    const primaryTier = await prisma.communityMembershipTier.findFirstOrThrow({ where: { slug: 'primary' } });
    primaryTierId = primaryTier.id;

    const userWithMembership = await prisma.user.create({
      data: {
        name: 'Router Membership User',
        email: `router-membership-${Date.now()}@example.com`,
        role: 'ADMIN',
      },
    });
    userWithMembershipId = userWithMembership.id;
    createdIds.users.push(userWithMembership.id);
    userWithMembershipToken = signCentralToken(userWithMembership.id);

    const userWithoutMembership = await prisma.user.create({
      data: {
        name: 'Router Empty User',
        email: `router-empty-${Date.now()}@example.com`,
        role: 'ADMIN',
      },
    });
    createdIds.users.push(userWithoutMembership.id);
    userWithoutMembershipToken = signCentralToken(userWithoutMembership.id);
  });

  afterEach(async () => {
    await prisma.membershipUpgrade.deleteMany({ where: { membershipId: { in: createdIds.memberships } } });
    await prisma.membershipServiceUsage.deleteMany({ where: { membershipId: { in: createdIds.memberships } } });
    await prisma.membershipPetReplacement.deleteMany({ where: { membershipId: { in: createdIds.memberships } } });
    await prisma.membershipCoveredPet.deleteMany({ where: { membershipId: { in: createdIds.memberships } } });
    await prisma.membership.deleteMany({ where: { id: { in: createdIds.memberships } } });
    await prisma.membershipApplication.deleteMany({ where: { id: { in: createdIds.applications } } });
    await prisma.membershipPlan.deleteMany({ where: { id: { in: createdIds.plans } } });
    await prisma.membershipCampaign.deleteMany({ where: { id: { in: createdIds.campaigns } } });
    createdIds.campaigns = [];
    createdIds.plans = [];
    createdIds.applications = [];
    createdIds.memberships = [];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
    await prisma.$disconnect();
  });

  it('returns the active campaigns envelope with lifecycle and pricing data', async () => {
    const activeCampaign = await createCampaignFixture({
      slugPrefix: 'router-active',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      title: 'Router Active Campaign',
      heroImageUrl: 'https://cdn.example.com/membership/hero.jpg',
      mobileImageUrl: 'https://cdn.example.com/membership/mobile.jpg',
      thumbnailUrl: 'https://cdn.example.com/membership/thumb.jpg',
      regularPrice: 10000,
      offerPrice: 3000,
    });

    const response = await request(app).get('/api/v1/membership/campaigns/active');
    const campaign = response.body.data.campaigns.find((item: { slug: string }) => item.slug === activeCampaign.slug);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(campaign).toBeDefined();
    expect(campaign).toMatchObject({
      title: 'Router Active Campaign',
      campaignStatus: 'application_open',
      applicationStatus: 'open',
      offerStatus: 'active',
      pricing: {
        regularPrice: 10000,
        offerPrice: 3000,
        effectivePrice: 3000,
        discountAmount: 7000,
        discountPercentage: 70,
        isOfferActive: true,
      },
      availablePlans: expect.any(Array),
    });
    expect(response.body.meta).toMatchObject({
      serverTime: expect.any(String),
      timezone: 'Asia/Dhaka',
    });
  });

  it('returns an empty active campaign list when nothing qualifies', async () => {
    const inactiveCampaign = await createCampaignFixture({
      slugPrefix: 'router-inactive',
      status: MembershipCampaignStatus.draft,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      title: 'Router Inactive Campaign',
    });

    const response = await request(app).get('/api/v1/membership/campaigns/active');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.campaigns.some((item: { slug: string }) => item.slug === inactiveCampaign.slug)).toBe(false);
  });

  it('falls back to regular price when the offer window has expired', async () => {
    await createCampaignFixture({
      slugPrefix: 'router-expired-offer',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() - 60 * 1000),
      applicationStartAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
      title: 'Router Expired Offer Campaign',
      regularPrice: 10000,
      offerPrice: 3000,
    });

    const response = await request(app).get('/api/v1/membership/campaigns/active');
    const campaign = response.body.data.campaigns.find((item: { title: string }) => item.title === 'Router Expired Offer Campaign');

    expect(campaign).toBeTruthy();
    expect(campaign.pricing).toMatchObject({
      regularPrice: 10000,
      offerPrice: 3000,
      effectivePrice: 10000,
      discountAmount: 0,
      discountPercentage: 0,
      isOfferActive: false,
    });
    expect(campaign.offerStatus).toBe('expired');
  });

  it('rejects application creation when the application window is closed', async () => {
    const closedCampaign = await createCampaignFixture({
      slugPrefix: 'router-closed',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() - 60 * 1000),
      title: 'Router Closed Campaign',
    });

    const response = await request(app)
      .post('/api/v1/membership/applications')
      .set('Authorization', `Bearer ${userWithMembershipToken}`)
      .send({
        campaignId: closedCampaign.id,
        planId: closedCampaign.plans[0].id,
        applicantName: 'Closed Window User',
        applicantMobile: '01700000099',
        applicantEmail: 'closed@example.com',
        applicantAddress: 'Dhaka',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MEMBERSHIP_APPLICATION_CLOSED');
  });

  it('returns an empty my-memberships list for an authenticated user with no memberships', async () => {
    const response = await request(app)
      .get('/api/v1/me/memberships')
      .set('Authorization', `Bearer ${userWithoutMembershipToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('returns one formatted membership for an authenticated user with a membership', async () => {
    const membershipCampaign = await createCampaignFixture({
      slugPrefix: 'router-membership',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
      title: 'Router Membership Campaign',
    });

    const membership = await createActivatedMembership('Router', membershipCampaign.id, membershipCampaign.plans[0].id);

    const response = await request(app)
      .get('/api/v1/me/memberships')
      .set('Authorization', `Bearer ${userWithMembershipToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: membership.id,
      membershipStatus: 'active',
      validity: {
        validFrom: expect.any(String),
        validUntil: expect.any(String),
      },
      currentCoveredPets: expect.any(Array),
      linkedPetHistory: expect.any(Array),
      upgradeOptions: expect.any(Array),
    });
  });

  it('returns multiple formatted memberships for an authenticated user with several memberships', async () => {
    const campaignA = await createCampaignFixture({
      slugPrefix: 'router-multi-a',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
      title: 'Router Multi Campaign A',
    });
    const campaignB = await createCampaignFixture({
      slugPrefix: 'router-multi-b',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
      title: 'Router Multi Campaign B',
    });

    await createActivatedMembership('Multi A', campaignA.id, campaignA.plans[0].id);
    await createActivatedMembership('Multi B', campaignB.id, campaignB.plans[0].id);

    const response = await request(app)
      .get('/api/v1/me/memberships')
      .set('Authorization', `Bearer ${userWithMembershipToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ total: 2 });
  });

  it('resolves a legacy non-UUID Central Auth id to its mapped local user and returns that user\'s memberships', async () => {
    // Simulates a Central Auth identity whose `sub` claim is not itself a
    // UUID (e.g. a cuid-style id), which must be resolved via
    // `centralAuthUserId` -> local `users.id` before it is ever used as a
    // Prisma `@db.Uuid` filter value. This is the exact class of id that
    // previously slipped past the requireLocalUser fast-path heuristic and
    // reached Prisma unresolved, causing the reported UUID decode failure.
    const legacyCentralAuthId = `cmrouterlegacy${Date.now()}xy`;
    const legacyUser = await prisma.user.create({
      data: {
        name: 'Legacy Central Auth User',
        email: `router-legacy-${Date.now()}@example.com`,
        role: 'ADMIN',
        centralAuthUserId: legacyCentralAuthId,
      },
    });
    createdIds.users.push(legacyUser.id);

    const legacyCampaign = await createCampaignFixture({
      slugPrefix: 'router-legacy',
      status: MembershipCampaignStatus.application_open,
      offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
      offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
      applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
      applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
      title: 'Router Legacy Campaign',
    });

    const draft = await createMembershipApplication(
      legacyUser.id,
      {
        campaignId: legacyCampaign.id,
        planId: legacyCampaign.plans[0].id,
        applicantName: 'Legacy User',
        applicantMobile: '01710000001',
        applicantEmail: 'legacy@example.com',
        applicantAddress: 'Dhaka',
      },
      {},
    );
    createdIds.applications.push(draft.id);
    await prisma.membershipApplication.update({
      where: { id: draft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });
    const paymentResult = await createMembershipApplicationPayment(legacyUser.id, draft.id, { expectedAmount: 3000 }, {});
    await updatePaymentStatus(paymentResult.payment.id, 'success');
    await handleMembershipApplicationPaymentSuccess(paymentResult.payment.id);
    const membership = await activateMembershipFromApplication(draft.id, {}, {});
    createdIds.memberships.push(membership.id);

    const legacyToken = signCentralToken(legacyCentralAuthId);
    const response = await request(app)
      .get('/api/v1/me/memberships')
      .set('Authorization', `Bearer ${legacyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(membership.id);
  });

  it('rejects invalid pagination query parameters', async () => {
    const response = await request(app)
      .get('/api/v1/me/memberships')
      .set('Authorization', `Bearer ${userWithMembershipToken}`)
      .query({ page: '0', limit: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.error).toHaveProperty('code');
  });

  it('rejects invalid membership ids with a safe error code', async () => {
    const response = await request(app)
      .get('/api/v1/me/memberships/not-a-uuid')
      .set('Authorization', `Bearer ${userWithMembershipToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MEMBERSHIP_INVALID_ID');
  });

  it('rejects unauthenticated requests to member endpoints', async () => {
    const response = await request(app).get('/api/v1/me/memberships');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
