import jwt from "jsonwebtoken";
import request from "supertest";
import {
  MembershipApplicationStatus,
  MembershipCampaignStatus,
  MembershipRecordStatus,
  Prisma,
} from "@prisma/client";
import app from "../../../app";
import { prisma } from "../../../database/prisma";
import { config } from "../../../config";
import {
  approveMembershipReplacement,
  createMembershipApplication,
  createMembershipReplacementRequest,
  createMembershipApplicationPayment,
  createMembershipUpgrade,
  createMembershipUpgradePayment,
  createClinicServiceUsage,
  completeMembershipReplacement,
  getPublicCampaign,
  getMembershipUpgradeOptions,
  handleMembershipApplicationPaymentSuccess,
  handleMembershipUpgradePaymentFailure,
  handleMembershipUpgradePaymentSuccess,
  linkClinicCoveredPet,
  rejectMembershipReplacement,
  activateMembershipFromApplication,
  buildPricingObject,
} from "../membership-campaign.service";
import { updatePaymentStatus } from "../../payments/payments.repository";

describe("membership campaign backend module", () => {
  const createdIds: Record<string, string[]> = {
    campaigns: [],
    plans: [],
    applications: [],
    memberships: [],
    users: [],
    owners: [],
    pets: [],
    venues: [],
  };

  let userId: string;
  let userToken: string;
  let campaignId: string;
  let primaryPlanId: string;
  let premiumPlanId: string;
  let enterprisePlanId: string;
  let primaryTierId: string;
  let premiumTierId: string;
  let enterpriseTierId: string;
  let clinicId: string;
  let ownerPetIds: string[] = [];
  let wrongOwnerPetId: string;
  let benefitId: string;
  function signCentralToken(sub: string) {
    if (!config.CENTRAL_AUTH_JWT_SECRET) {
      throw new Error(
        "CENTRAL_AUTH_JWT_SECRET is required for membership tests",
      );
    }
    return jwt.sign(
      { sub, email: "member@example.com", roles: ["user"] },
      config.CENTRAL_AUTH_JWT_SECRET,
      {
        algorithm: config.CENTRAL_AUTH_JWT_ALGORITHM as jwt.Algorithm,
        issuer: config.CENTRAL_AUTH_JWT_ISSUER,
        audience: config.CENTRAL_AUTH_JWT_AUDIENCE,
        expiresIn: "1h",
      },
    );
  }

  function pricingPlanFixture() {
    return {
      regularPrice: new Prisma.Decimal(10000),
      offerPrice: new Prisma.Decimal(3000),
      regularPriceSnapshot: new Prisma.Decimal(10000),
      campaignPrice: new Prisma.Decimal(3000),
    };
  }

  beforeAll(async () => {
    const tiers = await prisma.communityMembershipTier.findMany({
      where: { slug: { in: ["primary", "premium", "enterprise"] } },
    });
    primaryTierId = tiers.find((tier) => tier.slug === "primary")!.id;
    premiumTierId = tiers.find((tier) => tier.slug === "premium")!.id;
    enterpriseTierId = tiers.find((tier) => tier.slug === "enterprise")!.id;

    const user = await prisma.user.create({
      data: {
        name: "Membership Test User",
        email: `membership-test-${Date.now()}@example.com`,
        role: "ADMIN",
      },
    });
    userId = user.id;
    createdIds.users.push(user.id);
    userToken = signCentralToken(user.id);

    const clinic = await prisma.venue.create({
      data: {
        name: `Membership Clinic ${Date.now()}`,
        address: "Dhaka",
        isActive: true,
      },
    });
    clinicId = clinic.id;
    createdIds.venues.push(clinic.id);

    const owner = await prisma.petOwner.create({
      data: {
        userId: user.id,
        ownerName: "Membership Test Owner",
        mobile: "01710000000",
        email: user.email!,
      },
    });
    createdIds.owners.push(owner.id);

    for (let i = 1; i <= 6; i += 1) {
      const pet = await prisma.pet.create({
        data: {
          ownerId: owner.id,
          name: `Owner Pet ${i}`,
          petType: "dog",
          gender: "male",
        },
      });
      ownerPetIds.push(pet.id);
      createdIds.pets.push(pet.id);
    }

    const otherOwner = await prisma.petOwner.create({
      data: {
        ownerName: "Wrong Owner",
        mobile: "01810000000",
      },
    });
    createdIds.owners.push(otherOwner.id);
    const wrongPet = await prisma.pet.create({
      data: {
        ownerId: otherOwner.id,
        name: "Wrong Owner Pet",
        petType: "cat",
        gender: "female",
      },
    });
    wrongOwnerPetId = wrongPet.id;
    createdIds.pets.push(wrongPet.id);

    const slug = `membership-test-${Date.now()}`;
    const campaign = await prisma.membershipCampaign.create({
      data: {
        slug,
        titleEn: "Membership Test Campaign",
        titleBn: "মেম্বারশিপ টেস্ট ক্যাম্পেইন",
        status: MembershipCampaignStatus.application_open,
        offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
        offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
        applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
        applicationEndAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });
    campaignId = campaign.id;
    createdIds.campaigns.push(campaign.id);

    const primary = await prisma.membershipPlan.create({
      data: {
        campaignId: campaign.id,
        tierId: primaryTierId,
        code: "PRIMARY-T",
        nameEn: "Primary Test",
        nameBn: "প্রাইমারি টেস্ট",
        regularPrice: 10000,
        offerPrice: 3000,
        regularPriceSnapshot: 10000,
        campaignPrice: 3000,
        minPetsSnapshot: 1,
        includedPetsSnapshot: 3,
        maxPetsSnapshot: 3,
        maxCoveredPets: 3,
        validityYears: 1,
        validityMonths: 12,
        validityMonthsSnapshot: 12,
        tierVersion: 1,
        maximumReplacementCount: 1,
      },
    });
    primaryPlanId = primary.id;
    createdIds.plans.push(primary.id);

    const premium = await prisma.membershipPlan.create({
      data: {
        campaignId: campaign.id,
        tierId: premiumTierId,
        code: "PREMIUM-T",
        nameEn: "Premium Test",
        nameBn: "প্রিমিয়াম টেস্ট",
        regularPrice: 15000,
        offerPrice: 5000,
        regularPriceSnapshot: 15000,
        campaignPrice: 5000,
        minPetsSnapshot: 1,
        includedPetsSnapshot: 10,
        maxPetsSnapshot: 10,
        maxCoveredPets: 10,
        validityYears: 1,
        validityMonths: 12,
        validityMonthsSnapshot: 12,
        tierVersion: 1,
        maximumReplacementCount: 2,
      },
    });
    premiumPlanId = premium.id;
    createdIds.plans.push(premium.id);

    const enterprise = await prisma.membershipPlan.create({
      data: {
        campaignId: campaign.id,
        tierId: enterpriseTierId,
        code: "ENTERPRISE-T",
        nameEn: "Enterprise Test",
        nameBn: "Enterprise Test",
        regularPrice: 25000,
        offerPrice: 12000,
        regularPriceSnapshot: 25000,
        campaignPrice: 12000,
        minPetsSnapshot: 1,
        includedPetsSnapshot: 20,
        maxPetsSnapshot: 20,
        maxCoveredPets: 20,
        validityYears: 1,
        validityMonths: 12,
        validityMonthsSnapshot: 12,
        tierVersion: 1,
        maximumReplacementCount: 3,
      },
    });
    enterprisePlanId = enterprise.id;
    createdIds.plans.push(enterprise.id);

    const benefit = await prisma.membershipBenefit.create({
      data: {
        campaignId: campaign.id,
        titleEn: "Clinic Consultation Benefit",
        titleBn: "ক্লিনিক কনসালটেশন বেনিফিট",
        plans: {
          create: [{ planId: primary.id }, { planId: premium.id }],
        },
      },
    });
    benefitId = benefit.id;
  });

  afterAll(async () => {
    await prisma.membershipUpgrade.deleteMany({
      where: { membershipId: { in: createdIds.memberships } },
    });
    await prisma.membershipServiceUsage.deleteMany({
      where: { membershipId: { in: createdIds.memberships } },
    });
    await prisma.membershipPetReplacement.deleteMany({
      where: { membershipId: { in: createdIds.memberships } },
    });
    await prisma.membershipCoveredPet.deleteMany({
      where: { membershipId: { in: createdIds.memberships } },
    });
    await prisma.membership.deleteMany({
      where: { id: { in: createdIds.memberships } },
    });
    await prisma.membershipApplication.deleteMany({
      where: { id: { in: createdIds.applications } },
    });
    await prisma.pet.deleteMany({ where: { id: { in: createdIds.pets } } });
    await prisma.petOwner.deleteMany({
      where: { id: { in: createdIds.owners } },
    });
    await prisma.venue.deleteMany({ where: { id: { in: createdIds.venues } } });
    await prisma.membershipPlan.deleteMany({
      where: { id: { in: createdIds.plans } },
    });
    await prisma.membershipCampaign.deleteMany({
      where: { id: { in: createdIds.campaigns } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
    await prisma.$disconnect();
  });

  async function createActivatedMembership(
    label: string,
    planId = primaryPlanId,
  ) {
    const selectedPlan = await prisma.membershipPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    const campaign = await prisma.membershipCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    const draft = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId,
        applicantName: `${label} User`,
        applicantMobile: "01710000000",
        applicantEmail: "member@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(draft.id);
    await prisma.membershipApplication.update({
      where: { id: draft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });
    const now = new Date();
    const offerActive = Boolean(
      selectedPlan.offerPrice &&
      (!campaign.offerStartAt || campaign.offerStartAt <= now) &&
      (!campaign.offerEndAt || campaign.offerEndAt >= now),
    );
    const expectedAmount = Number(
      offerActive ? selectedPlan.offerPrice : selectedPlan.regularPrice,
    );
    const paymentResult = await createMembershipApplicationPayment(
      userId,
      draft.id,
      { expectedAmount },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "success");
    await handleMembershipApplicationPaymentSuccess(paymentResult.payment.id);
    const membership = await activateMembershipFromApplication(
      draft.id,
      {},
      {},
    );
    createdIds.memberships.push(membership.id);
    return membership;
  }

  it("returns active discount pricing while offer is active", async () => {
    const detail = await getPublicCampaign(
      (
        await prisma.membershipCampaign.findUniqueOrThrow({
          where: { id: campaignId },
        })
      ).slug,
    );
    expect(detail.pricing.effectivePrice).toBe(3000);
    expect(detail.pricing.isOfferActive).toBe(true);
    expect(detail.pricing.discountAmount).toBe(7000);
  });

  it("returns upcoming pricing before the offer starts", () => {
    const pricing = buildPricingObject(
      {
        ...pricingPlanFixture(),
      },
      {
        offerStartAt: new Date("2026-07-15T09:00:00.000Z"),
        offerEndAt: new Date("2026-07-15T12:00:00.000Z"),
        applicationEndAt: new Date("2026-07-15T18:00:00.000Z"),
      },
      new Date("2026-07-15T08:59:59.999Z"),
    );

    expect(pricing.pricingStatus).toBe("upcoming");
    expect(pricing.effectivePrice).toBe(10000);
    expect(pricing.discountAmount).toBe(0);
    expect(pricing.offerPrice).toBe(3000);
  });

  it("keeps the offer active at the exact start boundary", () => {
    const boundary = new Date("2026-07-15T09:00:00.000Z");
    const pricing = buildPricingObject(
      {
        ...pricingPlanFixture(),
      },
      {
        offerStartAt: boundary,
        offerEndAt: new Date("2026-07-15T10:00:00.000Z"),
        applicationEndAt: new Date("2026-07-15T18:00:00.000Z"),
      },
      boundary,
    );

    expect(pricing.pricingStatus).toBe("offer_active");
    expect(pricing.effectivePrice).toBe(3000);
  });

  it("keeps the offer active at the exact end boundary", () => {
    const boundary = new Date("2026-07-16T09:00:00.000Z");
    const pricing = buildPricingObject(
      {
        ...pricingPlanFixture(),
      },
      {
        offerStartAt: new Date("2026-07-16T08:00:00.000Z"),
        offerEndAt: boundary,
        applicationEndAt: new Date("2026-07-16T18:00:00.000Z"),
      },
      boundary,
    );

    expect(pricing.pricingStatus).toBe("offer_active");
    expect(pricing.effectivePrice).toBe(3000);
  });

  it("falls back to regular price after offer expiry", async () => {
    const expiredCampaign = await prisma.membershipCampaign.create({
      data: {
        slug: `expired-membership-${Date.now()}`,
        titleEn: "Expired Offer Campaign",
        titleBn: "এক্সপায়ার্ড অফার",
        status: MembershipCampaignStatus.application_open,
        offerStartAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        offerEndAt: new Date(Date.now() - 60 * 1000),
        applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
        applicationEndAt: new Date(Date.now() + 60 * 60 * 1000),
        publishedAt: new Date(),
        plans: {
          create: {
            tierId: primaryTierId,
            code: `EXP-${Date.now()}`,
            nameEn: "Expired Plan",
            nameBn: "এক্সপায়ার্ড প্ল্যান",
            regularPrice: 10000,
            offerPrice: 3000,
            regularPriceSnapshot: 10000,
            campaignPrice: 3000,
            minPetsSnapshot: 1,
            includedPetsSnapshot: 3,
            maxPetsSnapshot: 3,
            maxCoveredPets: 3,
            validityYears: 1,
            validityMonths: 12,
            validityMonthsSnapshot: 12,
            tierVersion: 1,
          },
        },
      },
      include: { plans: true },
    });
    createdIds.campaigns.push(expiredCampaign.id);
    createdIds.plans.push(expiredCampaign.plans[0].id);

    const detail = await getPublicCampaign(expiredCampaign.slug);
    expect(detail.pricing.isOfferActive).toBe(false);
    expect(detail.pricing.effectivePrice).toBe(10000);
    expect(detail.pricing.discountAmount).toBe(0);
  });

  it("creates an application without any pet selection requirement", async () => {
    const created = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId: primaryPlanId,
        applicantName: "No Pet Selection User",
        applicantMobile: "01700000000",
        applicantEmail: "no-pets@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(created.id);
    expect(created.planId).toBe(primaryPlanId);
    expect((created as any).selectedPetIds).toBeUndefined();
  });

  it("recalculates payment price on the backend", async () => {
    const appDraft = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId: primaryPlanId,
        applicantName: "Price Recalc User",
        applicantMobile: "01700000001",
        applicantEmail: "price@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(appDraft.id);
    await prisma.membershipApplication.update({
      where: { id: appDraft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });

    await expect(
      createMembershipApplicationPayment(
        userId,
        appDraft.id,
        { expectedAmount: 9999 },
        {},
      ),
    ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
  });

  it("returns structured stale-price details after the offer expires", async () => {
    const appDraft = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId: primaryPlanId,
        applicantName: "Stale Price User",
        applicantMobile: "01700000002",
        applicantEmail: "stale@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(appDraft.id);
    await prisma.membershipApplication.update({
      where: { id: appDraft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });

    const originalCampaign = await prisma.membershipCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    try {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: { offerEndAt: new Date(Date.now() - 60 * 1000) },
      });

      await expect(
        createMembershipApplicationPayment(
          userId,
          appDraft.id,
          { expectedAmount: 3000 },
          {},
        ),
      ).rejects.toMatchObject({
        code: "PRICE_CHANGED",
        details: expect.objectContaining({
          effectivePrice: 10000,
          pricingStatus: "regular_price",
        }),
      });
    } finally {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: { offerEndAt: originalCampaign.offerEndAt },
      });
    }
  });

  it("reuses the same pending application payment while the lock is active", async () => {
    const appDraft = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId: primaryPlanId,
        applicantName: "Repeat Payment User",
        applicantMobile: "01700000003",
        applicantEmail: "repeat@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(appDraft.id);
    await prisma.membershipApplication.update({
      where: { id: appDraft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });

    const first = await createMembershipApplicationPayment(
      userId,
      appDraft.id,
      { expectedAmount: 3000 },
      {},
    );
    const second = await createMembershipApplicationPayment(
      userId,
      appDraft.id,
      { expectedAmount: 3000 },
      {},
    );

    expect(second.payment.id).toBe(first.payment.id);
    expect(second.application.paymentId).toBe(first.payment.id);
  });

  it("respects timezone-aware offer windows", () => {
    const now = new Date("2026-07-15T04:30:00.000Z");
    const pricing = buildPricingObject(
      {
        ...pricingPlanFixture(),
      },
      {
        offerStartAt: new Date("2026-07-15T09:00:00+06:00"),
        offerEndAt: new Date("2026-07-15T21:00:00+06:00"),
        applicationEndAt: new Date("2026-07-16T08:00:00+06:00"),
      },
      now,
    );

    expect(pricing.pricingStatus).toBe("offer_active");
    expect(pricing.effectivePrice).toBe(3000);
    expect(pricing.serverNow).toBe(now.toISOString());
  });

  it("keeps existing membership snapshots unchanged after campaign pricing changes", async () => {
    const membership = await createActivatedMembership("Snapshot Integrity");
    const before = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    const originalCampaign = await prisma.membershipCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    const originalPlan = await prisma.membershipPlan.findUniqueOrThrow({
      where: { id: primaryPlanId },
    });

    try {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: {
          offerEndAt: new Date(Date.now() - 60 * 1000),
        },
      });
      await prisma.membershipPlan.update({
        where: { id: primaryPlanId },
        data: {
          regularPrice: 22000,
          offerPrice: 9000,
          campaignPrice: 9000,
        },
      });

      const after = await prisma.membership.findUniqueOrThrow({
        where: { id: membership.id },
      });
      expect(Number(after.regularPriceSnapshot)).toBe(
        Number(before.regularPriceSnapshot),
      );
      expect(Number(after.paidPriceSnapshot)).toBe(
        Number(before.paidPriceSnapshot),
      );
      expect(after.maxCoveredPetsSnapshot).toBe(before.maxCoveredPetsSnapshot);
    } finally {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: {
          offerEndAt: originalCampaign.offerEndAt,
        },
      });
      await prisma.membershipPlan.update({
        where: { id: primaryPlanId },
        data: {
          regularPrice: originalPlan.regularPrice,
          offerPrice: originalPlan.offerPrice,
          campaignPrice: originalPlan.campaignPrice,
        },
      });
    }
  });

  it("rejects unavailable plans", async () => {
    const inactiveCampaign = await prisma.membershipCampaign.create({
      data: {
        slug: `membership-inactive-${Date.now()}`,
        titleEn: "Inactive Membership Campaign",
        titleBn: "Inactive Membership Campaign",
        status: MembershipCampaignStatus.application_open,
        offerStartAt: new Date(Date.now() - 60 * 60 * 1000),
        offerEndAt: new Date(Date.now() + 60 * 60 * 1000),
        applicationStartAt: new Date(Date.now() - 60 * 60 * 1000),
        applicationEndAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        publishedAt: new Date(),
      },
    });
    createdIds.campaigns.push(inactiveCampaign.id);

    const inactivePlan = await prisma.membershipPlan.create({
      data: {
        campaignId: inactiveCampaign.id,
        tierId: primaryTierId,
        code: `INACTIVE-${Date.now()}`,
        nameEn: "Inactive",
        nameBn: "ইনঅ্যাকটিভ",
        regularPrice: 1000,
        regularPriceSnapshot: 1000,
        campaignPrice: 1000,
        minPetsSnapshot: 1,
        includedPetsSnapshot: 1,
        maxPetsSnapshot: 1,
        maxCoveredPets: 1,
        validityYears: 1,
        validityMonths: 12,
        validityMonthsSnapshot: 12,
        tierVersion: 1,
        isActive: false,
      },
    });
    createdIds.plans.push(inactivePlan.id);

    await expect(
      createMembershipApplication(
        userId,
        {
          campaignId: inactiveCampaign.id,
          planId: inactivePlan.id,
          applicantName: "Inactive Plan User",
          applicantMobile: "01700000002",
          applicantEmail: "inactive@example.com",
          applicantAddress: "Dhaka",
        },
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_PLAN_NOT_AVAILABLE" });
  });

  it("blocks unauthorized access to me membership routes", async () => {
    const response = await request(app).get(
      "/api/v1/me/membership-applications",
    );
    expect(response.status).toBe(401);
  });

  it("activates a membership after payment success and admin activation", async () => {
    const appDraft = await createMembershipApplication(
      userId,
      {
        campaignId,
        planId: primaryPlanId,
        applicantName: "Activation User",
        applicantMobile: "01700000003",
        applicantEmail: "activation@example.com",
        applicantAddress: "Dhaka",
      },
      {},
    );
    createdIds.applications.push(appDraft.id);
    await prisma.membershipApplication.update({
      where: { id: appDraft.id },
      data: { status: MembershipApplicationStatus.submitted },
    });
    const paymentResult = await createMembershipApplicationPayment(
      userId,
      appDraft.id,
      { expectedAmount: 3000 },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "success");
    await handleMembershipApplicationPaymentSuccess(paymentResult.payment.id);

    const membership = await activateMembershipFromApplication(
      appDraft.id,
      {},
      {},
    );
    createdIds.memberships.push(membership.id);

    const persisted = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(persisted.membershipRecordStatus).toBe(
      MembershipRecordStatus.active,
    );
    expect(persisted.maxCoveredPetsSnapshot).toBe(3);
  });

  it("serves authenticated me membership endpoints", async () => {
    const response = await request(app)
      .get("/api/v1/me/membership-applications")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("links the first pet successfully at clinic", async () => {
    const membership = await createActivatedMembership("Clinic First Link");
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    expect(linked.slotNumber).toBe(1);
  });

  it("links the third Primary pet successfully", async () => {
    const membership = await createActivatedMembership("Clinic Third Link");
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[1] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );
    const third = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[3] },
      { clinicId },
      userId,
      {},
    );
    expect(third.slotNumber).toBe(3);
  });

  it("rejects the fourth Primary pet link", async () => {
    const membership = await createActivatedMembership("Clinic Fourth Reject");
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[1] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );
    await expect(
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[3] },
        { clinicId },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_PET_LIMIT_REACHED" });
  });

  it("rejects duplicate active pet linking", async () => {
    const membership = await createActivatedMembership(
      "Clinic Duplicate Reject",
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    await expect(
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[0] },
        { clinicId },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects linking a pet from the wrong owner", async () => {
    const membership = await createActivatedMembership("Wrong Owner Reject");
    await expect(
      linkClinicCoveredPet(
        membership.id,
        { petId: wrongOwnerPetId },
        { clinicId },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_PET_OWNER_MISMATCH" });
  });

  it("rejects pet linking for inactive membership", async () => {
    const membership = await createActivatedMembership("Inactive Membership");
    await prisma.membership.update({
      where: { id: membership.id },
      data: { membershipRecordStatus: MembershipRecordStatus.suspended },
    });
    await expect(
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[0] },
        { clinicId },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_ACTIVE" });
  });

  it("rejects pet linking for expired membership", async () => {
    const membership = await createActivatedMembership("Expired Membership");
    await prisma.membership.update({
      where: { id: membership.id },
      data: { validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    await expect(
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[0] },
        { clinicId },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_EXPIRED" });
  });

  it("serializes concurrent final-slot requests so only one succeeds", async () => {
    const membership = await createActivatedMembership("Concurrent Final Slot");
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[1] },
      { clinicId },
      userId,
      {},
    );

    const results = await Promise.allSettled([
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[4] },
        { clinicId },
        userId,
        {},
      ),
      linkClinicCoveredPet(
        membership.id,
        { petId: ownerPetIds[5] },
        { clinicId },
        userId,
        {},
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const activeCount = await prisma.membershipCoveredPet.count({
      where: { membershipId: membership.id, status: "ACTIVE" },
    });
    expect(activeCount).toBe(3);
  });

  it("rejects service usage for an uncovered pet", async () => {
    const membership = await createActivatedMembership(
      "Uncovered Pet Service Reject",
    );
    await expect(
      createClinicServiceUsage(
        membership.id,
        {
          clinicId,
          petId: ownerPetIds[0],
          benefitId,
          serviceCode: "CONSULT",
          serviceName: "Consultation",
          regularPrice: 500,
          discountAmount: 100,
          payableAmount: 400,
        },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_PET_NOT_COVERED" });
  });

  it("preserves permanent history after status change", async () => {
    const membership = await createActivatedMembership("History Preservation");
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    await prisma.membershipCoveredPet.update({
      where: { id: linked.id },
      data: { status: "DECEASED" },
    });
    const historyCount = await prisma.membershipCoveredPet.count({
      where: { membershipId: membership.id, petId: ownerPetIds[0] },
    });
    expect(historyCount).toBe(1);
  });

  it("approves and completes a replacement while preserving the old covered-pet record", async () => {
    const membership = await createActivatedMembership("Replacement Complete");
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    const request = await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: linked.id,
        reason: "DECEASED",
        notes: "Pet deceased",
        supportingDocumentUrl: "https://example.com/deceased-proof.pdf",
      },
      { userId },
      {},
    );

    const approved = await approveMembershipReplacement(
      request.id,
      { reviewNotes: "Approved by admin" },
      userId,
      {},
    );
    expect(approved.status).toBe("APPROVED");

    const completed = await completeMembershipReplacement(
      request.id,
      { newPetId: ownerPetIds[1], reviewNotes: "Completed" },
      userId,
      {},
    );
    expect(completed.status).toBe("COMPLETED");

    const oldCoveredPet = await prisma.membershipCoveredPet.findUniqueOrThrow({
      where: { id: linked.id },
    });
    const newCoveredPet = await prisma.membershipCoveredPet.findFirstOrThrow({
      where: {
        membershipId: membership.id,
        petId: ownerPetIds[1],
        isReplacement: true,
      },
    });
    expect(oldCoveredPet.status).toBe("DECEASED");
    expect(oldCoveredPet.replacedByCoveredPetId).toBe(newCoveredPet.id);
    expect(newCoveredPet.replacementOfCoveredPetId).toBe(oldCoveredPet.id);
    expect(newCoveredPet.slotNumber).toBe(oldCoveredPet.slotNumber);
  });

  it("rejects a replacement request and restores the original covered pet to active", async () => {
    const membership = await createActivatedMembership("Replacement Reject");
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );
    const request = await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: linked.id,
        reason: "PERMANENTLY_LOST",
        notes: "Lost permanently",
        supportingDocumentUrl: "https://example.com/lost-proof.pdf",
      },
      { staffId: userId },
      {},
    );

    const rejected = await rejectMembershipReplacement(
      request.id,
      { reviewNotes: "Not enough evidence" },
      userId,
      {},
    );
    expect(rejected.status).toBe("REJECTED");

    const restored = await prisma.membershipCoveredPet.findUniqueOrThrow({
      where: { id: linked.id },
    });
    expect(restored.status).toBe("ACTIVE");
  });

  it("enforces the plan replacement limit", async () => {
    const membership = await createActivatedMembership("Replacement Limit");
    const first = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    const firstRequest = await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: first.id,
        reason: "DECEASED",
        notes: "one",
        supportingDocumentUrl: "https://example.com/one.pdf",
      },
      { userId },
      {},
    );
    await approveMembershipReplacement(
      firstRequest.id,
      { reviewNotes: "ok" },
      userId,
      {},
    );
    await completeMembershipReplacement(
      firstRequest.id,
      { newPetId: ownerPetIds[1], reviewNotes: "done" },
      userId,
      {},
    );

    const second = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );
    await expect(
      createMembershipReplacementRequest(
        membership.id,
        {
          coveredPetId: second.id,
          reason: "DECEASED",
          notes: "two",
          supportingDocumentUrl: "https://example.com/two.pdf",
        },
        { userId },
        {},
      ),
    ).rejects.toMatchObject({ code: "PET_REPLACEMENT_LIMIT_REACHED" });
  });

  it("blocks duplicate pending replacement requests for the same covered pet", async () => {
    const membership = await createActivatedMembership(
      "Replacement Pending Duplicate",
    );
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[3] },
      { clinicId },
      userId,
      {},
    );
    await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: linked.id,
        reason: "DECEASED",
        notes: "first",
        supportingDocumentUrl: "https://example.com/first.pdf",
      },
      { userId },
      {},
    );
    await expect(
      createMembershipReplacementRequest(
        membership.id,
        {
          coveredPetId: linked.id,
          reason: "DECEASED",
          notes: "second",
          supportingDocumentUrl: "https://example.com/second.pdf",
        },
        { userId },
        {},
      ),
    ).rejects.toMatchObject({ code: "PET_REPLACEMENT_ALREADY_PENDING" });
  });

  it("does not auto-restore coverage when a lost pet returns after replacement completion", async () => {
    const membership = await createActivatedMembership("Returned Lost Pet");
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[4] },
      { clinicId },
      userId,
      {},
    );
    const request = await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: linked.id,
        reason: "PERMANENTLY_LOST",
        notes: "lost",
        supportingDocumentUrl: "https://example.com/lost.pdf",
      },
      { userId },
      {},
    );
    await approveMembershipReplacement(
      request.id,
      { reviewNotes: "approved" },
      userId,
      {},
    );
    await completeMembershipReplacement(
      request.id,
      { newPetId: ownerPetIds[5], reviewNotes: "done" },
      userId,
      {},
    );

    const oldCoveredPet = await prisma.membershipCoveredPet.findUniqueOrThrow({
      where: { id: linked.id },
    });
    expect(oldCoveredPet.status).toBe("LOST");

    const activeRows = await prisma.membershipCoveredPet.findMany({
      where: {
        membershipId: membership.id,
        petId: ownerPetIds[4],
        status: "ACTIVE",
      },
    });
    expect(activeRows).toHaveLength(0);
  });

  it("prevents completion before approval", async () => {
    const membership = await createActivatedMembership(
      "Replacement Not Approved",
    );
    const linked = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    const request = await createMembershipReplacementRequest(
      membership.id,
      {
        coveredPetId: linked.id,
        reason: "DECEASED",
        notes: "pending",
        supportingDocumentUrl: "https://example.com/pending.pdf",
      },
      { userId },
      {},
    );
    await expect(
      completeMembershipReplacement(
        request.id,
        { newPetId: ownerPetIds[1], reviewNotes: "nope" },
        userId,
        {},
      ),
    ).rejects.toMatchObject({ code: "PET_REPLACEMENT_NOT_APPROVED" });
  });

  it("returns upgrade options from Primary to Premium with backend pricing", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Options Primary",
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[1] },
      { clinicId },
      userId,
      {},
    );
    await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );

    const options = await getMembershipUpgradeOptions(userId, membership.id);
    expect(options.currentPlan.code).toBe("PRIMARY-T");
    expect(options.currentPlan.usedPetSlots).toBe(3);
    expect(options.availablePlans[0]).toMatchObject({
      code: "PREMIUM-T",
      maxCoveredPets: 10,
      effectivePrice: 5000,
      eligibleCredit: 3000,
      upgradePayable: 2000,
    });
  });

  it("completes a Primary to Premium upgrade and preserves existing covered pets", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Primary Premium",
    );
    const first = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[0] },
      { clinicId },
      userId,
      {},
    );
    const second = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[1] },
      { clinicId },
      userId,
      {},
    );
    const third = await linkClinicCoveredPet(
      membership.id,
      { petId: ownerPetIds[2] },
      { clinicId },
      userId,
      {},
    );

    const upgrade = await createMembershipUpgrade(
      userId,
      { membershipId: membership.id, toPlanId: premiumPlanId },
      {},
    );
    const paymentResult = await createMembershipUpgradePayment(
      userId,
      upgrade.id,
      { expectedAmount: 2000 },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "success");
    await handleMembershipUpgradePaymentSuccess(paymentResult.payment.id);

    const updatedMembership = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(updatedMembership.planId).toBe(premiumPlanId);
    expect(updatedMembership.maxCoveredPetsSnapshot).toBe(10);

    const coveredPets = await prisma.membershipCoveredPet.findMany({
      where: { membershipId: membership.id, status: "ACTIVE" },
      orderBy: { slotNumber: "asc" },
    });
    expect(coveredPets.map((item) => item.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(coveredPets.map((item) => item.slotNumber)).toEqual([1, 2, 3]);
  });

  it("completes a Premium to Enterprise upgrade", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Premium Enterprise",
      premiumPlanId,
    );
    const upgrade = await createMembershipUpgrade(
      userId,
      { membershipId: membership.id, toPlanId: enterprisePlanId },
      {},
    );
    const paymentResult = await createMembershipUpgradePayment(
      userId,
      upgrade.id,
      { expectedAmount: 7000 },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "success");
    await handleMembershipUpgradePaymentSuccess(paymentResult.payment.id);

    const updatedMembership = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(updatedMembership.planId).toBe(enterprisePlanId);
    expect(updatedMembership.maxCoveredPetsSnapshot).toBe(20);
    expect(Number(updatedMembership.paidPriceSnapshot)).toBe(12000);
  });

  it("uses regular target-plan pricing after the upgrade offer expires", async () => {
    const membership = await createActivatedMembership("Upgrade Expired Offer");
    const originalCampaign = await prisma.membershipCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    try {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: { offerEndAt: new Date(Date.now() - 60 * 1000) },
      });

      const options = await getMembershipUpgradeOptions(userId, membership.id);
      const premiumOption = options.availablePlans.find(
        (plan) => plan.code === "PREMIUM-T",
      );
      expect(premiumOption).toMatchObject({
        effectivePrice: 15000,
        eligibleCredit: 3000,
        upgradePayable: 12000,
      });

      const upgrade = await createMembershipUpgrade(
        userId,
        { membershipId: membership.id, toPlanId: premiumPlanId },
        {},
      );
      const paymentResult = await createMembershipUpgradePayment(
        userId,
        upgrade.id,
        { expectedAmount: 12000 },
        {},
      );
      expect(paymentResult.payment.amount).toBe(12000);
    } finally {
      await prisma.membershipCampaign.update({
        where: { id: campaignId },
        data: { offerEndAt: originalCampaign.offerEndAt },
      });
    }
  });

  it("rejects invalid downgrade requests", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Invalid Downgrade",
      premiumPlanId,
    );
    await expect(
      createMembershipUpgrade(
        userId,
        { membershipId: membership.id, toPlanId: primaryPlanId },
        {},
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_PLAN_NOT_AVAILABLE" });
  });

  it("treats repeated payment success callbacks idempotently", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Repeated Callback",
    );
    const upgrade = await createMembershipUpgrade(
      userId,
      { membershipId: membership.id, toPlanId: premiumPlanId },
      {},
    );
    const paymentResult = await createMembershipUpgradePayment(
      userId,
      upgrade.id,
      { expectedAmount: 2000 },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "success");

    await handleMembershipUpgradePaymentSuccess(paymentResult.payment.id);
    await handleMembershipUpgradePaymentSuccess(paymentResult.payment.id);

    const upgrades = await prisma.membershipUpgrade.findMany({
      where: { membershipId: membership.id },
    });
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].status).toBe("completed");
  });

  it("marks the upgrade failed when payment fails", async () => {
    const membership = await createActivatedMembership(
      "Upgrade Failed Payment",
    );
    const upgrade = await createMembershipUpgrade(
      userId,
      { membershipId: membership.id, toPlanId: premiumPlanId },
      {},
    );
    const paymentResult = await createMembershipUpgradePayment(
      userId,
      upgrade.id,
      { expectedAmount: 2000 },
      {},
    );
    await updatePaymentStatus(paymentResult.payment.id, "failed");
    await handleMembershipUpgradePaymentFailure(
      paymentResult.payment.id,
      "failed",
    );

    const failedUpgrade = await prisma.membershipUpgrade.findUniqueOrThrow({
      where: { id: upgrade.id },
    });
    const unchangedMembership = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(failedUpgrade.status).toBe("failed");
    expect(unchangedMembership.planId).toBe(primaryPlanId);
  });

  it("rejects concurrent upgrade attempts for the same membership", async () => {
    const membership = await createActivatedMembership("Upgrade Concurrent");
    const results = await Promise.allSettled([
      createMembershipUpgrade(
        userId,
        { membershipId: membership.id, toPlanId: premiumPlanId },
        {},
      ),
      createMembershipUpgrade(
        userId,
        { membershipId: membership.id, toPlanId: enterprisePlanId },
        {},
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const pendingCount = await prisma.membershipUpgrade.count({
      where: { membershipId: membership.id, status: "pending_payment" },
    });
    expect(pendingCount).toBe(1);
  });
});
