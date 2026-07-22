import {
  AuditAction,
  MembershipApplicationStatus,
  MembershipCampaignStatus,
  MembershipCoveredPetStatus,
  MembershipMediaRole,
  MembershipPetReplacementStatus,
  MembershipRecordStatus,
  MembershipUpgradeRecordStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../database/prisma";
import { AppError } from "../../utils/AppError";
import {
  auditCreate,
  auditDelete,
  auditUpdate,
  writeAuditLog,
  type AuditContext,
} from "../../utils/audit";
import { createPayment } from "../payments/payments.repository";
import {
  generateMerchantTxnId,
  initializeEpsPayment,
  isEPSConfigured,
} from "../../services/eps.service";
import { config } from "../../config";
import * as repo from "./membership-campaign.repository";
import type {
  AdminMembershipActivationDto,
  AdminMembershipApplicationReviewDto,
  AdminMembershipStatusDto,
  CancelMembershipDto,
  MembershipRenewalApplyDto,
  CreateMembershipApplicationDto,
  CreateMembershipBenefitDto,
  CreateMembershipCampaignDto,
  CreateMembershipDocumentDto,
  CreateMembershipFaqDto,
  CreateMembershipMediaDto,
  CreateMembershipPaymentDto,
  CreateMembershipPlanDto,
  ClinicCreatePetDto,
  ClinicLinkCoveredPetDto,
  ClinicMembershipContextQuery,
  ClinicMembershipLookupQuery,
  ClinicServiceUsageDto,
  CompleteMembershipReplacementDto,
  CreateMembershipReplacementDto,
  MembershipApplicationListQuery,
  MembershipCampaignListQuery,
  MembershipChildListQuery,
  MembershipCoveredPetListQuery,
  MembershipListQuery,
  MembershipReplacementListQuery,
  MembershipServiceUsageListQuery,
  MembershipUpgradePaymentDto,
  RejectMembershipReplacementDto,
  MembershipReplacementReviewDto,
  MembershipUpgradeCreateDto,
  MembershipUpgradeListQuery,
  MembershipUpgradeReviewDto,
  ApproveMembershipReplacementDto,
  SubmitMembershipApplicationDto,
  UpdateMembershipApplicationDto,
  UpdateMembershipBenefitDto,
  UpdateMembershipCampaignDto,
  UpdateMembershipDocumentDto,
  UpdateMembershipFaqDto,
  UpdateMembershipMediaDto,
  UpdateMembershipPlanDto,
} from "./membership-campaign.types";
import {
  PetGender,
  PetType,
  MembershipServiceUsageStatus,
} from "@prisma/client";

const DHAKA_TIMEZONE = "Asia/Dhaka";
const MEMBERSHIP_PAYMENT_PURPOSE = "membership_campaign_application";
const MEMBERSHIP_UPGRADE_PAYMENT_PURPOSE = "membership_campaign_upgrade";
const MEMBERSHIP_PAYMENT_LOCK_SECONDS = 15 * 60;

function nowInBusinessClock(now = new Date()) {
  return now;
}

function asNullableDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

async function findMediaFileByUrl(url?: string | null) {
  if (!url) return null;
  return prisma.mediaFile.findFirst({ where: { url } });
}

function isValidMediaFile(media: {
  mimeType: string;
  sizeBytes: Prisma.Decimal | number | string | bigint | null;
}) {
  const sizeBytes = Number(media.sizeBytes ?? 0);
  return sizeBytes > 0 && Boolean(media.mimeType);
}

async function assertCampaignMediaIsRenderable(campaign: {
  heroImageUrl: string | null;
  mobileImageUrl: string | null;
  thumbnailUrl: string | null;
}) {
  const mediaTargets: Array<{
    label: string;
    url: string | null;
    expectedMimePrefix: string;
  }> = [
    {
      label: "hero image",
      url: campaign.heroImageUrl,
      expectedMimePrefix: "image/",
    },
    {
      label: "mobile image",
      url: campaign.mobileImageUrl,
      expectedMimePrefix: "image/",
    },
    {
      label: "thumbnail",
      url: campaign.thumbnailUrl,
      expectedMimePrefix: "image/",
    },
  ];

  for (const target of mediaTargets) {
    if (!target.url) {
      throw AppError.badRequest(
        `Publishing requires a valid ${target.label}.`,
        "MEMBERSHIP_CAMPAIGN_MEDIA_INVALID",
      );
    }

    const media = await findMediaFileByUrl(target.url);
    if (
      !media ||
      !isValidMediaFile(media) ||
      !media.mimeType.startsWith(target.expectedMimePrefix)
    ) {
      throw AppError.badRequest(
        `Publishing requires a valid ${target.label}.`,
        "MEMBERSHIP_CAMPAIGN_MEDIA_INVALID",
      );
    }
  }
}

function assertCampaignPublishDates(
  campaign: {
    applicationStartAt: Date | null;
    applicationEndAt: Date | null;
  },
  now = nowInBusinessClock(),
) {
  if (!campaign.applicationStartAt || !campaign.applicationEndAt) {
    throw AppError.badRequest(
      "Publishing requires valid application start and end dates.",
      "MEMBERSHIP_CAMPAIGN_INVALID_DATES",
    );
  }
  if (campaign.applicationEndAt <= campaign.applicationStartAt) {
    throw AppError.badRequest(
      "Application end must be after application start.",
      "MEMBERSHIP_CAMPAIGN_INVALID_DATES",
    );
  }
  if (campaign.applicationEndAt < now) {
    throw AppError.badRequest(
      "Application dates are expired. Archive the campaign or edit the dates before publishing.",
      "MEMBERSHIP_CAMPAIGN_APPLICATION_EXPIRED",
    );
  }
}

async function assertCampaignPublishable(campaign: {
  slug: string;
  titleEn: string;
  titleBn: string;
  heroImageUrl: string | null;
  mobileImageUrl: string | null;
  thumbnailUrl: string | null;
  applicationStartAt: Date | null;
  applicationEndAt: Date | null;
  plans: Array<{
    isActive: boolean | null;
    code: string;
    tierId?: string | null;
    tier?: { isActive: boolean; status?: string | null } | null;
    regularPrice?: Prisma.Decimal | null;
    offerPrice?: Prisma.Decimal | null;
    regularPriceSnapshot?: Prisma.Decimal | null;
    campaignPrice?: Prisma.Decimal | null;
    minPetsSnapshot?: number | null;
    includedPetsSnapshot?: number | null;
    maxPetsSnapshot?: number | null;
    maxCoveredPets?: number | null;
    validityYears?: number | null;
    validityMonths?: number | null;
    validityMonthsSnapshot?: number | null;
    allowPriceIncrease?: boolean | null;
  }>;
}) {
  const hasRequiredIdentity = Boolean(
    campaign.titleEn.trim() && campaign.titleBn.trim() && campaign.slug.trim(),
  );
  if (!hasRequiredIdentity) {
    throw AppError.badRequest(
      "Publishing requires campaign title, slug, and bilingual identity fields.",
      "MEMBERSHIP_CAMPAIGN_INCOMPLETE",
    );
  }

  const hasValidActivePlan = campaign.plans.some((plan) => {
    if (plan.isActive !== true) return false;
    if (!plan.code || plan.code.trim() === "") return false;
    if (!plan.tierId) return false;
    if (
      !plan.tier ||
      plan.tier.isActive !== true ||
      plan.tier.status === "inactive" ||
      plan.tier.status === "archived"
    )
      return false;
    const regularPrice = getPlanRegularPrice(plan);
    if (isNaN(regularPrice) || regularPrice <= 0) return false;
    const campaignPrice = getPlanCampaignPrice(plan);
    const minCoveredPets = getPlanMinPets(plan);
    const includedPets = getPlanIncludedPets(plan);
    const maxCoveredPets = getPlanMaxPets(plan);
    if (isNaN(maxCoveredPets) || maxCoveredPets <= 0) return false;
    if (minCoveredPets > includedPets || includedPets > maxCoveredPets)
      return false;
    if (getPlanValidityMonths(plan) <= 0) return false;
    if (campaignPrice < 0) return false;
    if (!plan.allowPriceIncrease && campaignPrice > regularPrice) return false;
    return true;
  });

  if (!hasValidActivePlan) {
    throw AppError.badRequest(
      "Publishing requires at least one valid active plan.",
      "MEMBERSHIP_CAMPAIGN_NO_ACTIVE_PLAN",
    );
  }

  await assertCampaignMediaIsRenderable(campaign);
  assertCampaignPublishDates(campaign);
}

async function assertMembershipMediaFile(
  mediaFileId: string,
  role: MembershipMediaRole,
) {
  const media = await prisma.mediaFile.findUnique({
    where: { id: mediaFileId },
  });
  if (!media || !isValidMediaFile(media)) {
    throw AppError.badRequest(
      "Selected media file is invalid or missing.",
      "MEMBERSHIP_MEDIA_INVALID",
    );
  }

  const isVideoRole = role === MembershipMediaRole.video_poster;
  const isVideoMime = media.mimeType.startsWith("video/");
  const isImageMime = media.mimeType.startsWith("image/");

  if (isVideoRole && !isVideoMime) {
    throw AppError.badRequest(
      "Video roles require a valid video file.",
      "MEMBERSHIP_MEDIA_INVALID",
    );
  }

  if (!isVideoRole && !isImageMime) {
    throw AppError.badRequest(
      "Image roles require a valid image file.",
      "MEMBERSHIP_MEDIA_INVALID",
    );
  }
}

async function assertMembershipDocumentFile(mediaFileId: string) {
  const media = await prisma.mediaFile.findUnique({
    where: { id: mediaFileId },
  });
  if (!media || !isValidMediaFile(media)) {
    throw AppError.badRequest(
      "Selected document file is invalid or missing.",
      "MEMBERSHIP_DOCUMENT_INVALID",
    );
  }

  if (
    !media.mimeType.startsWith("application/") &&
    !media.mimeType.startsWith("text/")
  ) {
    throw AppError.badRequest(
      "Documents require a valid document file.",
      "MEMBERSHIP_DOCUMENT_INVALID",
    );
  }
}

function asNullableDay(value?: string): Date | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

function toMoney(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value == null) return null;
  return Number(value);
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

function percentage(discountAmount: number, regularPrice: number) {
  if (!regularPrice || regularPrice <= 0) return 0;
  return Math.round((discountAmount / regularPrice) * 100);
}

type MembershipPricingStatus =
  "upcoming" | "offer_active" | "regular_price" | "unavailable";

type MembershipPricingQuote = {
  regularPrice: number;
  offerPrice: number | null;
  effectivePrice: number;
  discountAmount: number;
  discountPercentage: number;
  pricingStatus: MembershipPricingStatus;
  isOfferActive: boolean;
  offerEndsAt: string | null;
  offerStartsAt: string | null;
  applicationEndsAt: string | null;
  serverNow: string;
  serverTime: string;
  remainingOfferTimeMs: number;
};

type ApplicationPricingSnapshotState = {
  pricingStatusSnapshot: MembershipPricingStatus | null;
  offerDeadlineSnapshot: string | null;
  applicationDeadlineSnapshot: string | null;
  serverNow: string | null;
};

type ApplicationNotesState = {
  freeText: string | null;
  documentUrls: string[];
  reviewNotes: string | null;
  pricingSnapshot: ApplicationPricingSnapshotState | null;
};

function normalizeApplicationNotes(notes: string | null | undefined) {
  if (!notes) {
    return {
      freeText: null as string | null,
      documentUrls: [] as string[],
      reviewNotes: null as string | null,
      pricingSnapshot: null as ApplicationPricingSnapshotState | null,
    };
  }
  try {
    const parsed = JSON.parse(notes) as {
      freeText?: string | null;
      documentUrls?: string[];
      reviewNotes?: string | null;
      legacyText?: string | null;
      pricingSnapshot?: Partial<ApplicationPricingSnapshotState> | null;
    };
    const pricingSnapshot =
      parsed.pricingSnapshot && typeof parsed.pricingSnapshot === "object"
        ? {
            pricingStatusSnapshot:
              parsed.pricingSnapshot.pricingStatusSnapshot === "upcoming" ||
              parsed.pricingSnapshot.pricingStatusSnapshot === "offer_active" ||
              parsed.pricingSnapshot.pricingStatusSnapshot ===
                "regular_price" ||
              parsed.pricingSnapshot.pricingStatusSnapshot === "unavailable"
                ? parsed.pricingSnapshot.pricingStatusSnapshot
                : null,
            offerDeadlineSnapshot:
              parsed.pricingSnapshot.offerDeadlineSnapshot ?? null,
            applicationDeadlineSnapshot:
              parsed.pricingSnapshot.applicationDeadlineSnapshot ?? null,
            serverNow: parsed.pricingSnapshot.serverNow ?? null,
          }
        : null;
    return {
      freeText: parsed.freeText ?? parsed.legacyText ?? null,
      documentUrls: Array.isArray(parsed.documentUrls)
        ? parsed.documentUrls
        : [],
      reviewNotes: parsed.reviewNotes ?? null,
      pricingSnapshot,
    };
  } catch {
    return {
      freeText: notes,
      documentUrls: [],
      reviewNotes: null,
      pricingSnapshot: null,
    };
  }
}

function serializeApplicationNotes(input: ApplicationNotesState) {
  return JSON.stringify({
    freeText: input.freeText ?? null,
    documentUrls: input.documentUrls ?? [],
    reviewNotes: input.reviewNotes ?? null,
    pricingSnapshot: input.pricingSnapshot ?? null,
  });
}

function buildApplicationPricingSnapshot(
  pricing: MembershipPricingQuote,
): ApplicationPricingSnapshotState {
  return {
    pricingStatusSnapshot: pricing.pricingStatus,
    offerDeadlineSnapshot: pricing.offerEndsAt,
    applicationDeadlineSnapshot: pricing.applicationEndsAt,
    serverNow: pricing.serverNow,
  };
}

function buildApplicationNotesState(
  input: {
    freeText?: string | null;
    documentUrls?: string[];
    reviewNotes?: string | null;
  },
  pricing: MembershipPricingQuote,
): ApplicationNotesState {
  return {
    freeText: input.freeText ?? null,
    documentUrls: input.documentUrls ?? [],
    reviewNotes: input.reviewNotes ?? null,
    pricingSnapshot: buildApplicationPricingSnapshot(pricing),
  };
}

export function buildPricingObject(
  plan: {
    regularPrice?: Prisma.Decimal | null;
    offerPrice?: Prisma.Decimal | null;
    regularPriceSnapshot?: Prisma.Decimal | null;
    campaignPrice?: Prisma.Decimal | null;
  },
  campaign: {
    offerStartAt: Date | null;
    offerEndAt: Date | null;
    applicationEndAt?: Date | null;
  },
  now = nowInBusinessClock(),
): MembershipPricingQuote {
  const regularPrice =
    toMoney(plan.regularPriceSnapshot ?? plan.regularPrice) ?? 0;
  const offerPrice = toMoney(plan.campaignPrice ?? plan.offerPrice);
  const hasPromotionalOffer = Boolean(
    offerPrice != null && offerPrice < regularPrice,
  );
  const startsInFuture = Boolean(
    campaign.offerStartAt && campaign.offerStartAt > now,
  );
  const ended = Boolean(campaign.offerEndAt && campaign.offerEndAt < now);

  let pricingStatus: MembershipPricingStatus = "regular_price";
  if (regularPrice <= 0) {
    pricingStatus = "unavailable";
  } else if (hasPromotionalOffer && startsInFuture) {
    pricingStatus = "upcoming";
  } else if (hasPromotionalOffer && !ended) {
    pricingStatus = "offer_active";
  }

  const potentialDiscountAmount =
    hasPromotionalOffer && offerPrice != null
      ? roundPrice(regularPrice - offerPrice)
      : 0;
  const effectivePrice =
    pricingStatus === "offer_active" && offerPrice != null
      ? offerPrice
      : regularPrice;
  const serverNow = now.toISOString();
  const discountAmount =
    pricingStatus === "offer_active" ? potentialDiscountAmount : 0;
  return {
    regularPrice,
    offerPrice,
    effectivePrice,
    discountAmount,
    discountPercentage:
      discountAmount > 0 ? percentage(discountAmount, regularPrice) : 0,
    pricingStatus,
    isOfferActive: pricingStatus === "offer_active",
    offerEndsAt: campaign.offerEndAt?.toISOString() ?? null,
    offerStartsAt: campaign.offerStartAt?.toISOString() ?? null,
    applicationEndsAt: campaign.applicationEndAt?.toISOString() ?? null,
    serverNow,
    serverTime: serverNow,
    remainingOfferTimeMs:
      pricingStatus === "offer_active" &&
      campaign.offerEndAt &&
      campaign.offerEndAt > now
        ? campaign.offerEndAt.getTime() - now.getTime()
        : 0,
  };
}

function buildPriceChangedDetails(
  pricing: MembershipPricingQuote,
  expectedAmount?: number | null,
) {
  return {
    expectedAmount: expectedAmount == null ? null : roundPrice(expectedAmount),
    regularPrice: pricing.regularPrice,
    offerPrice: pricing.offerPrice,
    effectivePrice: pricing.effectivePrice,
    discountAmount: pricing.discountAmount,
    discountPercentage: pricing.discountPercentage,
    pricingStatus: pricing.pricingStatus,
    offerStartsAt: pricing.offerStartsAt,
    offerEndsAt: pricing.offerEndsAt,
    applicationEndsAt: pricing.applicationEndsAt,
    serverNow: pricing.serverNow,
  };
}

function throwPriceChanged(
  pricing: MembershipPricingQuote,
  expectedAmount?: number | null,
) {
  throw AppError.badRequest(
    "Membership price changed. Please review the updated amount.",
    "PRICE_CHANGED",
    buildPriceChangedDetails(pricing, expectedAmount),
  );
}

function assertPricingMatchesExpectedAmount(
  pricing: MembershipPricingQuote,
  expectedAmount?: number | null,
) {
  if (expectedAmount === undefined || expectedAmount === null) return;
  if (roundPrice(expectedAmount) !== roundPrice(pricing.effectivePrice)) {
    throwPriceChanged(pricing, expectedAmount);
  }
}

function getPlanRegularPrice(plan: {
  regularPrice?: Prisma.Decimal | null;
  regularPriceSnapshot?: Prisma.Decimal | null;
}) {
  return toMoney(plan.regularPriceSnapshot ?? plan.regularPrice) ?? 0;
}

function getPlanCampaignPrice(plan: {
  regularPrice?: Prisma.Decimal | null;
  offerPrice?: Prisma.Decimal | null;
  regularPriceSnapshot?: Prisma.Decimal | null;
  campaignPrice?: Prisma.Decimal | null;
}) {
  const regularPrice = getPlanRegularPrice(plan);
  return toMoney(plan.campaignPrice ?? plan.offerPrice) ?? regularPrice;
}

function getPlanMinPets(plan: { minPetsSnapshot?: number | null }) {
  return plan.minPetsSnapshot ?? 1;
}

function getPlanIncludedPets(plan: {
  includedPetsSnapshot?: number | null;
  maxPetsSnapshot?: number | null;
  maxCoveredPets?: number | null;
}) {
  return (
    plan.includedPetsSnapshot ??
    plan.maxPetsSnapshot ??
    plan.maxCoveredPets ??
    1
  );
}

function getPlanMaxPets(plan: {
  maxPetsSnapshot?: number | null;
  maxCoveredPets?: number | null;
}) {
  return plan.maxPetsSnapshot ?? plan.maxCoveredPets ?? 1;
}

function getPlanValidityMonths(plan: {
  validityMonthsSnapshot?: number | null;
  validityMonths?: number | null;
  validityYears?: number | null;
}) {
  if (plan.validityMonthsSnapshot != null) return plan.validityMonthsSnapshot;
  if (plan.validityMonths != null) return plan.validityMonths;
  if (plan.validityYears != null) return plan.validityYears * 12;
  return 12;
}

function getPlanValidityYears(plan: {
  validityYears?: number | null;
  validityMonthsSnapshot?: number | null;
  validityMonths?: number | null;
}) {
  if (plan.validityYears != null) return plan.validityYears;
  const months = getPlanValidityMonths(plan);
  return months % 12 === 0 ? months / 12 : null;
}

function getBenefitsSnapshotFromValue(
  value: Prisma.JsonValue | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (
        item &&
        typeof item === "object" &&
        "titleEn" in item &&
        typeof item.titleEn === "string"
      )
        return item.titleEn.trim();
      return "";
    })
    .filter(Boolean);
}

function deriveCampaignBenefitSnapshot(
  campaignBenefits:
    | Array<{
        titleEn: string;
        plans: Array<{ planId: string }>;
      }>
    | undefined,
  planId: string,
) {
  return (campaignBenefits ?? [])
    .filter((benefit) =>
      benefit.plans.some((mapping) => mapping.planId === planId),
    )
    .map((benefit) => benefit.titleEn);
}

function buildPlanBenefitSnapshot(
  plan: {
    id: string;
    benefitsSnapshot?: Prisma.JsonValue | null;
  },
  campaignBenefits?: Array<{
    titleEn: string;
    plans: Array<{ planId: string }>;
  }>,
) {
  const explicitSnapshot = getBenefitsSnapshotFromValue(plan.benefitsSnapshot);
  if (explicitSnapshot.length > 0) return explicitSnapshot;
  return deriveCampaignBenefitSnapshot(campaignBenefits, plan.id);
}

function buildApplicationSnapshotData(
  plan: {
    id: string;
    tierId: string;
    code: string;
    nameEn: string;
    nameBn: string | null;
    regularPrice?: Prisma.Decimal | null;
    offerPrice?: Prisma.Decimal | null;
    regularPriceSnapshot?: Prisma.Decimal | null;
    campaignPrice?: Prisma.Decimal | null;
    minPetsSnapshot?: number | null;
    includedPetsSnapshot?: number | null;
    maxPetsSnapshot?: number | null;
    maxCoveredPets?: number | null;
    validityYears?: number | null;
    validityMonths?: number | null;
    validityMonthsSnapshot?: number | null;
    benefitsSnapshot?: Prisma.JsonValue | null;
    tierVersion?: number | null;
    maximumReplacementCount: number;
    replacementRequiresApproval: boolean;
    replacementFee: Prisma.Decimal | null;
    tier?: {
      code: string | null;
      nameEn: string;
      nameBn: string;
      version: number;
    } | null;
    campaign?: {
      benefits: Array<{ titleEn: string; plans: Array<{ planId: string }> }>;
    } | null;
  },
  pricing: MembershipPricingQuote,
) {
  const benefitsSnapshot = buildPlanBenefitSnapshot(
    plan,
    plan.campaign?.benefits,
  );
  return {
    regularPriceSnapshot: new Prisma.Decimal(getPlanRegularPrice(plan)),
    offerPriceSnapshot: new Prisma.Decimal(getPlanCampaignPrice(plan)),
    finalPriceSnapshot: new Prisma.Decimal(pricing.effectivePrice),
    tierIdSnapshot: plan.tierId,
    tierCodeSnapshot: plan.tier?.code ?? plan.code,
    tierNameEnSnapshot: plan.tier?.nameEn ?? plan.nameEn,
    tierNameBnSnapshot: plan.tier?.nameBn ?? plan.nameBn,
    tierVersionSnapshot: plan.tier?.version ?? plan.tierVersion ?? 1,
    minCoveredPetsSnapshot: getPlanMinPets(plan),
    includedPetsSnapshot: getPlanIncludedPets(plan),
    maxCoveredPetsSnapshot: getPlanMaxPets(plan),
    validityYearsSnapshot: getPlanValidityYears(plan),
    validityMonthsSnapshot: getPlanValidityMonths(plan),
    benefitsSnapshot,
    maximumReplacementCountSnapshot: plan.maximumReplacementCount,
    replacementRequiresApprovalSnapshot: plan.replacementRequiresApproval,
    replacementFeeSnapshot: plan.replacementFee,
  };
}

function ensureCampaignReadable(
  campaign: Awaited<ReturnType<typeof repo.getCampaignBySlug>>,
) {
  if (!campaign)
    throw AppError.notFound(
      "Membership campaign",
      "MEMBERSHIP_CAMPAIGN_NOT_FOUND",
    );
  return campaign;
}

function resolveCampaignMediaUrl(
  campaign: {
    heroImageUrl: string | null;
    mobileImageUrl: string | null;
    thumbnailUrl: string | null;
    mediaItems?: Array<{
      role: MembershipMediaRole;
      mediaFile: { url: string | null };
    }>;
  },
  target: "hero" | "mobile_banner" | "thumbnail",
) {
  const directMap = {
    hero: campaign.heroImageUrl,
    mobile_banner: campaign.mobileImageUrl,
    thumbnail: campaign.thumbnailUrl,
  } as const;
  if (directMap[target]) return directMap[target];
  return (
    campaign.mediaItems?.find((media) => media.role === target)?.mediaFile
      .url ?? null
  );
}

function getCampaignApplicationStatus(
  campaign: {
    status: MembershipCampaignStatus;
    applicationStartAt: Date | null;
    applicationEndAt: Date | null;
  },
  now = nowInBusinessClock(),
) {
  const publicationAllowed =
    campaign.status === "application_open" || campaign.status === "published";
  if (!publicationAllowed) {
    if (campaign.applicationStartAt && campaign.applicationStartAt > now)
      return "upcoming";
    return "closed";
  }
  if (campaign.applicationStartAt && campaign.applicationStartAt > now)
    return "upcoming";
  if (campaign.applicationEndAt && campaign.applicationEndAt < now)
    return "closed";
  return "open";
}

function getCampaignOfferStatus(
  campaign: {
    offerStartAt: Date | null;
    offerEndAt: Date | null;
  },
  pricing: {
    offerPrice: number | null;
    pricingStatus: MembershipPricingStatus;
  },
  now = nowInBusinessClock(),
) {
  if (!pricing.offerPrice || pricing.offerPrice <= 0) return "inactive";
  if (pricing.pricingStatus === "upcoming") return "upcoming";
  if (pricing.pricingStatus === "offer_active") return "active";
  if (
    pricing.pricingStatus === "regular_price" &&
    campaign.offerEndAt &&
    campaign.offerEndAt < now
  ) {
    return "expired";
  }
  return "inactive";
}

function isCampaignApplicationWindowOpen(
  campaign: {
    applicationStartAt: Date | null;
    applicationEndAt: Date | null;
    status: MembershipCampaignStatus;
  },
  now = nowInBusinessClock(),
) {
  const started =
    !campaign.applicationStartAt || campaign.applicationStartAt <= now;
  const notEnded =
    !campaign.applicationEndAt || campaign.applicationEndAt >= now;
  const statusAllowed =
    campaign.status === "application_open" || campaign.status === "published";
  return started && notEnded && statusAllowed;
}

function assertCampaignActiveForApplication(
  campaign: {
    status: MembershipCampaignStatus;
    applicationStartAt: Date | null;
    applicationEndAt: Date | null;
  },
  now = nowInBusinessClock(),
) {
  if (!isCampaignApplicationWindowOpen(campaign, now)) {
    throw AppError.badRequest(
      "Membership applications are closed",
      "MEMBERSHIP_APPLICATION_CLOSED",
    );
  }
}

function generateApplicationNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BPA-MA-${stamp}-${rand}`;
}

function generateMembershipNumber() {
  return `BPA-M-${Date.now().toString().slice(-10)}`;
}

function generateCardNumber() {
  return `BPACARD${Date.now().toString().slice(-8)}`;
}

function generateMembershipMerchantTxnId(prefix: "A" | "U") {
  const base = generateMerchantTxnId()
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${base}${suffix}`.slice(0, 40);
}

function buildMembershipQrToken(membership: {
  id: string;
  membershipNumber: string | null;
  cardNumber: string | null;
}) {
  return `membership:${membership.membershipNumber ?? membership.cardNumber ?? membership.id}`;
}

function appendReplacementNotes(
  existing: string | null | undefined,
  next: string | null | undefined,
  prefix: string,
) {
  const parts = [
    existing?.trim(),
    next?.trim() ? `${prefix}${next.trim()}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function addValidity(
  validFrom: Date,
  years: number | null,
  months: number | null,
) {
  const validUntil = new Date(validFrom);
  if (years && years > 0)
    validUntil.setUTCFullYear(validUntil.getUTCFullYear() + years);
  if (months && months > 0)
    validUntil.setUTCMonth(validUntil.getUTCMonth() + months);
  return validUntil;
}

async function getActiveClinicOrThrow(clinicId: string) {
  const clinic = await prisma.venue.findUnique({ where: { id: clinicId } });
  if (!clinic || !clinic.isActive) {
    throw AppError.badRequest(
      "Clinic is not authorized for membership servicing",
      "CLINIC_NOT_AUTHORIZED",
    );
  }
  return clinic;
}

function assertMembershipActiveState(
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>,
) {
  if (membership.membershipRecordStatus !== MembershipRecordStatus.active) {
    throw AppError.badRequest(
      "Membership is not active",
      "MEMBERSHIP_NOT_ACTIVE",
    );
  }
  const expiry = membership.validUntil ?? membership.expiresAt;
  if (expiry && expiry < new Date()) {
    throw AppError.badRequest("Membership has expired", "MEMBERSHIP_EXPIRED");
  }
}

async function resolveMembershipOwner(
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>,
) {
  const mobileCandidates = [
    membership.application?.applicantMobile,
    membership.user?.phone,
  ].filter((value): value is string => Boolean(value));
  const emailCandidates = [
    membership.application?.applicantEmail,
    membership.user?.email,
  ].filter((value): value is string => Boolean(value));

  const owners = await prisma.petOwner.findMany({
    where: {
      OR: [
        ...(membership.userId ? [{ userId: membership.userId }] : []),
        ...mobileCandidates.map((mobile) => ({ mobile })),
        ...emailCandidates.map((email) => ({ email })),
      ],
    },
    include: {
      pets: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ userId: "desc" }, { createdAt: "asc" }],
  });

  const direct = membership.userId
    ? owners.find((owner) => owner.userId === membership.userId)
    : null;
  const owner = direct ?? owners[0] ?? null;
  if (!owner) {
    throw AppError.notFound("Membership owner pets");
  }
  return owner;
}

function buildMembershipLimitPayload(
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>,
  currentPetCount: number,
) {
  return {
    code: "MEMBERSHIP_PET_LIMIT_REACHED",
    message:
      "Membership pet limit reached. Upgrade is required to add another covered pet.",
    currentPlan: membership.planCodeSnapshot ?? membership.plan?.code ?? null,
    currentPetCount,
    maxCoveredPets: membership.maxCoveredPetsSnapshot ?? 0,
    upgradeAvailable: Boolean(
      membership.membershipCampaign?.plans?.some(
        (plan) =>
          plan.isActive &&
          plan.maxCoveredPets > (membership.maxCoveredPetsSnapshot ?? 0),
      ),
    ),
  };
}

function buildClinicMembershipSummary(
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>,
) {
  const activeCoveredPets = membership.coveredPets.filter(
    (pet) =>
      pet.status === MembershipCoveredPetStatus.ACTIVE ||
      pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
  );
  return {
    id: membership.id,
    membershipNumber: membership.membershipNumber,
    cardNumber: membership.cardNumber,
    qrToken: buildMembershipQrToken(membership),
    status: membership.membershipRecordStatus,
    validFrom:
      membership.validFrom?.toISOString() ??
      membership.startsAt?.toISOString() ??
      null,
    validUntil:
      membership.validUntil?.toISOString() ??
      membership.expiresAt?.toISOString() ??
      null,
    maxCoveredPets: membership.maxCoveredPetsSnapshot ?? 0,
    activeCoveredPetCount: activeCoveredPets.length,
    remainingPetSlots: Math.max(
      0,
      (membership.maxCoveredPetsSnapshot ?? 0) - activeCoveredPets.length,
    ),
    replacementPendingCount: membership.coveredPets.filter(
      (pet) => pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
    ).length,
    upgradeRequired:
      activeCoveredPets.length >= (membership.maxCoveredPetsSnapshot ?? 0),
    owner: {
      userId: membership.userId,
      applicantName:
        membership.application?.applicantName ?? membership.user?.name ?? null,
      mobile:
        membership.application?.applicantMobile ??
        membership.user?.phone ??
        null,
      email:
        membership.application?.applicantEmail ??
        membership.user?.email ??
        null,
    },
  };
}

function mapPetType(value: string): PetType {
  const normalized = value.toLowerCase();
  if (normalized === "dog") return PetType.dog;
  if (normalized === "cat") return PetType.cat;
  if (normalized === "bird") return PetType.bird;
  if (normalized === "rabbit") return PetType.rabbit;
  return PetType.other;
}

function mapPetGender(value: string): PetGender {
  const normalized = value.toLowerCase();
  if (normalized === "male") return PetGender.male;
  if (normalized === "female") return PetGender.female;
  return PetGender.unknown;
}

async function getCampaignPlanForApplication(
  campaignId: string,
  planId: string,
) {
  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, campaignId, isActive: true },
    include: {
      tier: true,
      campaign: {
        include: {
          benefits: {
            where: { isActive: true },
            include: { plans: true },
          },
        },
      },
    },
  });
  if (!plan) {
    throw AppError.badRequest(
      "Selected membership plan is not available",
      "MEMBERSHIP_PLAN_NOT_AVAILABLE",
    );
  }
  if (
    !plan.tier.isActive ||
    plan.tier.status === "inactive" ||
    plan.tier.status === "archived"
  ) {
    throw AppError.badRequest(
      "Selected membership tier is not available",
      "MEMBERSHIP_TIER_NOT_AVAILABLE",
    );
  }
  return plan;
}

async function getApplicationOwnedByUser(
  applicationId: string,
  userId: string,
) {
  const application = await repo.getMembershipApplicationById(applicationId);
  if (!application || application.userId !== userId) {
    throw AppError.notFound("Membership application", "MEMBERSHIP_NOT_FOUND");
  }
  return application;
}

async function getMembershipOwnedByUser(membershipId: string, userId: string) {
  const membership = await repo.getMembershipById(membershipId);
  if (!membership || membership.userId !== userId) {
    throw AppError.notFound("Membership", "MEMBERSHIP_NOT_FOUND");
  }
  return membership;
}

function formatActiveCampaignSummary(
  campaign: Awaited<ReturnType<typeof repo.listActiveCampaigns>>[number],
  now = nowInBusinessClock(),
) {
  const availablePlans = campaign.plans.map((plan) => {
    const pricing = buildPricingObject(plan, campaign, now);
    return {
      id: plan.id,
      tierId: plan.tierId,
      code: plan.code,
      nameEn: plan.nameEn,
      nameBn: plan.nameBn,
      regularPriceSnapshot: pricing.regularPrice,
      campaignPrice: getPlanCampaignPrice(plan),
      minPetsSnapshot: getPlanMinPets(plan),
      includedPetsSnapshot: getPlanIncludedPets(plan),
      maxPetsSnapshot: getPlanMaxPets(plan),
      maxCoveredPets: getPlanMaxPets(plan),
      validityYears: getPlanValidityYears(plan),
      validityMonths: getPlanValidityMonths(plan),
      benefitsSnapshot: buildPlanBenefitSnapshot(plan, campaign.benefits),
      tierVersion: plan.tierVersion,
      tier: plan.tier
        ? {
            id: plan.tier.id,
            code: plan.tier.code,
            slug: plan.tier.slug,
            nameEn: plan.tier.nameEn,
            nameBn: plan.tier.nameBn,
            version: plan.tier.version,
            status: plan.tier.status,
          }
        : null,
      regularPrice: pricing.regularPrice,
      offerPrice: pricing.offerPrice,
      effectivePrice: pricing.effectivePrice,
      discountAmount: pricing.discountAmount,
      discountPercentage: pricing.discountPercentage,
      isOfferActive: pricing.isOfferActive,
      pricingStatus: pricing.pricingStatus,
      offerEndsAt: pricing.offerEndsAt,
      applicationEndsAt: pricing.applicationEndsAt,
      serverNow: pricing.serverNow,
    };
  });
  const primaryPricing = availablePlans[0]
    ? {
        regularPrice: availablePlans[0].regularPrice,
        offerPrice: availablePlans[0].offerPrice,
        effectivePrice: availablePlans[0].effectivePrice,
        discountAmount: availablePlans[0].discountAmount,
        discountPercentage: availablePlans[0].discountPercentage,
        isOfferActive: availablePlans[0].isOfferActive,
        pricingStatus: availablePlans[0].pricingStatus,
        offerEndsAt: availablePlans[0].offerEndsAt,
        offerStartsAt: campaign.offerStartAt?.toISOString() ?? null,
        applicationEndsAt: availablePlans[0].applicationEndsAt,
        serverNow: availablePlans[0].serverNow,
        serverTime: availablePlans[0].serverNow,
        remainingOfferTimeMs:
          campaign.offerEndAt &&
          campaign.offerEndAt > now &&
          availablePlans[0].pricingStatus === "offer_active"
            ? campaign.offerEndAt.getTime() - now.getTime()
            : 0,
      }
    : {
        regularPrice: null,
        offerPrice: null,
        effectivePrice: null,
        discountAmount: 0,
        discountPercentage: 0,
        isOfferActive: false,
        pricingStatus: "unavailable" as MembershipPricingStatus,
        offerEndsAt: campaign.offerEndAt?.toISOString() ?? null,
        offerStartsAt: campaign.offerStartAt?.toISOString() ?? null,
        applicationEndsAt: campaign.applicationEndAt?.toISOString() ?? null,
        serverNow: now.toISOString(),
        serverTime: now.toISOString(),
        remainingOfferTimeMs: 0,
      };

  return {
    id: campaign.id,
    slug: campaign.slug,
    titleEn: campaign.titleEn,
    titleBn: campaign.titleBn,
    title: campaign.titleEn,
    shortDescriptionEn: campaign.shortDescriptionEn,
    shortDescriptionBn: campaign.shortDescriptionBn,
    shortDescription: campaign.shortDescriptionEn,
    heroImageUrl: resolveCampaignMediaUrl(campaign, "hero"),
    mobileImageUrl: resolveCampaignMediaUrl(campaign, "mobile_banner"),
    thumbnailUrl: resolveCampaignMediaUrl(campaign, "thumbnail"),
    status: campaign.status,
    campaignStatus: campaign.status,
    applicationStatus: getCampaignApplicationStatus(campaign, now),
    offerStatus: getCampaignOfferStatus(campaign, primaryPricing, now),
    offerStartAt: campaign.offerStartAt?.toISOString() ?? null,
    offerEndAt: campaign.offerEndAt?.toISOString() ?? null,
    applicationStartAt: campaign.applicationStartAt?.toISOString() ?? null,
    applicationEndAt: campaign.applicationEndAt?.toISOString() ?? null,
    pricing: primaryPricing,
    availablePlans,
    applicationAvailability: {
      isOpen: isCampaignApplicationWindowOpen(campaign, now),
      startsAt: campaign.applicationStartAt?.toISOString() ?? null,
      endsAt: campaign.applicationEndAt?.toISOString() ?? null,
      timezone: DHAKA_TIMEZONE,
    },
    serverTime: now.toISOString(),
    remainingOfferTimeMs: primaryPricing.remainingOfferTimeMs,
  };
}

function formatCampaignDetail(
  campaign: NonNullable<Awaited<ReturnType<typeof repo.getCampaignBySlug>>>,
) {
  const serverTime = nowInBusinessClock();
  const plans = campaign.plans.map((plan) => {
    const pricing = buildPricingObject(plan, campaign, serverTime);
    return {
      id: plan.id,
      campaignId: plan.campaignId,
      tierId: plan.tierId,
      code: plan.code,
      nameEn: plan.nameEn,
      nameBn: plan.nameBn,
      regularPriceSnapshot: pricing.regularPrice,
      campaignPrice: getPlanCampaignPrice(plan),
      minPetsSnapshot: getPlanMinPets(plan),
      includedPetsSnapshot: getPlanIncludedPets(plan),
      maxPetsSnapshot: getPlanMaxPets(plan),
      validityMonthsSnapshot: getPlanValidityMonths(plan),
      benefitsSnapshot: buildPlanBenefitSnapshot(plan, campaign.benefits),
      tierVersion: plan.tierVersion,
      allowPriceIncrease: plan.allowPriceIncrease,
      tier: plan.tier
        ? {
            id: plan.tier.id,
            code: plan.tier.code,
            slug: plan.tier.slug,
            nameEn: plan.tier.nameEn,
            nameBn: plan.tier.nameBn,
            launchPrice: toMoney(plan.tier.launchPriceBdt),
            regularPrice: toMoney(plan.tier.regularPriceBdt),
            minPets: plan.tier.petLimitMin,
            includedPets: plan.tier.includedPets,
            maxPets: plan.tier.petLimitMax,
            validityMonths: plan.tier.validityMonths,
            version: plan.tier.version,
            status: plan.tier.status,
          }
        : null,
      regularPrice: toMoney(plan.regularPrice),
      offerPrice: toMoney(plan.offerPrice),
      maxCoveredPets: getPlanMaxPets(plan),
      validityYears: getPlanValidityYears(plan),
      validityMonths: getPlanValidityMonths(plan),
      maximumReplacementCount: plan.maximumReplacementCount,
      replacementRequiresApproval: plan.replacementRequiresApproval,
      replacementFee: toMoney(plan.replacementFee),
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      pricing,
    };
  });

  const primaryPlanPricing = plans[0]?.pricing ?? {
    regularPrice: null,
    offerPrice: null,
    effectivePrice: null,
    discountAmount: 0,
    discountPercentage: 0,
    isOfferActive: false,
    pricingStatus: "unavailable" as MembershipPricingStatus,
    offerEndsAt: campaign.offerEndAt?.toISOString() ?? null,
    offerStartsAt: campaign.offerStartAt?.toISOString() ?? null,
    applicationEndsAt: campaign.applicationEndAt?.toISOString() ?? null,
    serverNow: serverTime.toISOString(),
    serverTime: serverTime.toISOString(),
    remainingOfferTimeMs: 0,
  };

  const effectivePlan = plans[0]?.pricing ?? {
    regularPrice: null,
    offerPrice: null,
    effectivePrice: null,
    discountAmount: 0,
    discountPercentage: 0,
    isOfferActive: false,
    pricingStatus: "unavailable" as MembershipPricingStatus,
    offerEndsAt: campaign.offerEndAt?.toISOString() ?? null,
    offerStartsAt: campaign.offerStartAt?.toISOString() ?? null,
    applicationEndsAt: campaign.applicationEndAt?.toISOString() ?? null,
    serverNow: serverTime.toISOString(),
    serverTime: serverTime.toISOString(),
    remainingOfferTimeMs: 0,
  };

  return {
    id: campaign.id,
    slug: campaign.slug,
    campaignStatus: campaign.status,
    applicationStatus: getCampaignApplicationStatus(campaign, serverTime),
    offerStatus: getCampaignOfferStatus(
      campaign,
      primaryPlanPricing,
      serverTime,
    ),
    heroImageUrl: resolveCampaignMediaUrl(campaign, "hero"),
    mobileImageUrl: resolveCampaignMediaUrl(campaign, "mobile_banner"),
    thumbnailUrl: resolveCampaignMediaUrl(campaign, "thumbnail"),
    shortDescription: campaign.shortDescriptionEn,
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      titleEn: campaign.titleEn,
      titleBn: campaign.titleBn,
      shortDescriptionEn: campaign.shortDescriptionEn,
      shortDescriptionBn: campaign.shortDescriptionBn,
      descriptionEn: campaign.descriptionEn,
      descriptionBn: campaign.descriptionBn,
      heroImageUrl: resolveCampaignMediaUrl(campaign, "hero"),
      mobileImageUrl: resolveCampaignMediaUrl(campaign, "mobile_banner"),
      thumbnailUrl: resolveCampaignMediaUrl(campaign, "thumbnail"),
      status: campaign.status,
      offerStartAt: campaign.offerStartAt?.toISOString() ?? null,
      offerEndAt: campaign.offerEndAt?.toISOString() ?? null,
      applicationStartAt: campaign.applicationStartAt?.toISOString() ?? null,
      applicationEndAt: campaign.applicationEndAt?.toISOString() ?? null,
      publishedAt: campaign.publishedAt?.toISOString() ?? null,
      eligibility: {
        en: campaign.eligibilityContentEn,
        bn: campaign.eligibilityContentBn,
      },
      howItWorks: {
        en: campaign.howItWorksContentEn,
        bn: campaign.howItWorksContentBn,
      },
      terms: {
        en: campaign.termsContentEn,
        bn: campaign.termsContentBn,
      },
      refundPolicy: {
        en: campaign.refundPolicyEn,
        bn: campaign.refundPolicyBn,
      },
      organizerSupport: {
        organizerNameEn: campaign.organizerNameEn,
        organizerNameBn: campaign.organizerNameBn,
        supportPhone: campaign.supportPhone,
        supportEmail: campaign.supportEmail,
        supportWhatsapp: campaign.supportWhatsapp,
        supportAddress: campaign.supportAddress,
      },
    },
    currentStatus: campaign.status,
    applicationAvailability: {
      isOpen: isCampaignApplicationWindowOpen(campaign, serverTime),
      startsAt: campaign.applicationStartAt?.toISOString() ?? null,
      endsAt: campaign.applicationEndAt?.toISOString() ?? null,
      timezone: DHAKA_TIMEZONE,
    },
    pricing: effectivePlan,
    availablePlans: plans,
    offerStartAt: campaign.offerStartAt?.toISOString() ?? null,
    offerEndAt: campaign.offerEndAt?.toISOString() ?? null,
    serverTime: serverTime.toISOString(),
    remainingOfferTimeMs: effectivePlan.remainingOfferTimeMs,
    plans,
    benefits: campaign.benefits.map((benefit) => ({
      id: benefit.id,
      code: benefit.code,
      titleEn: benefit.titleEn,
      titleBn: benefit.titleBn,
      descriptionEn: benefit.descriptionEn,
      descriptionBn: benefit.descriptionBn,
      icon: benefit.icon,
      sortOrder: benefit.sortOrder,
      planIds: benefit.plans.map((mapping) => mapping.planId),
    })),
    galleryImages: campaign.mediaItems
      .filter(
        (media) =>
          media.role === MembershipMediaRole.gallery ||
          media.role === MembershipMediaRole.hero ||
          media.role === MembershipMediaRole.mobile_banner ||
          media.role === MembershipMediaRole.thumbnail,
      )
      .map((media) => ({
        id: media.id,
        role: media.role,
        titleEn: media.titleEn,
        titleBn: media.titleBn,
        altText: media.altText,
        url: media.mediaFile.url,
        mimeType: media.mediaFile.mimeType,
      })),
    videos: campaign.mediaItems
      .filter(
        (media) =>
          media.mediaFile.mimeType?.startsWith("video/") ||
          media.role === MembershipMediaRole.video_poster,
      )
      .map((media) => ({
        id: media.id,
        role: media.role,
        titleEn: media.titleEn,
        titleBn: media.titleBn,
        url: media.mediaFile.url,
        mimeType: media.mediaFile.mimeType,
      })),
    documents: campaign.documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      code: document.code,
      titleEn: document.titleEn,
      titleBn: document.titleBn,
      descriptionEn: document.descriptionEn,
      descriptionBn: document.descriptionBn,
      fileUrl: document.fileUrl ?? document.mediaFile?.url ?? null,
    })),
    faqs: campaign.faqs.map((faq) => ({
      id: faq.id,
      questionEn: faq.questionEn,
      questionBn: faq.questionBn,
      answerEn: faq.answerEn,
      answerBn: faq.answerBn,
    })),
  };
}

function formatApplication(
  application: NonNullable<
    Awaited<ReturnType<typeof repo.getMembershipApplicationById>>
  >,
) {
  const noteState = normalizeApplicationNotes(application.notes);
  return {
    id: application.id,
    campaignId: application.campaignId,
    planId: application.planId,
    userId: application.userId,
    paymentId: application.paymentId,
    applicationNumber: application.applicationNumber,
    applicantName: application.applicantName,
    applicantMobile: application.applicantMobile,
    applicantEmail: application.applicantEmail,
    applicantAddress: application.applicantAddress,
    regularPriceSnapshot: toMoney(application.regularPriceSnapshot),
    offerPriceSnapshot: toMoney(application.offerPriceSnapshot),
    finalPriceSnapshot: toMoney(application.finalPriceSnapshot),
    tierIdSnapshot: application.tierIdSnapshot,
    tierCodeSnapshot: application.tierCodeSnapshot,
    tierNameEnSnapshot: application.tierNameEnSnapshot,
    tierNameBnSnapshot: application.tierNameBnSnapshot,
    tierVersionSnapshot: application.tierVersionSnapshot,
    minCoveredPetsSnapshot: application.minCoveredPetsSnapshot,
    includedPetsSnapshot: application.includedPetsSnapshot,
    maxCoveredPetsSnapshot: application.maxCoveredPetsSnapshot,
    validityYearsSnapshot: application.validityYearsSnapshot,
    validityMonthsSnapshot: application.validityMonthsSnapshot,
    benefitsSnapshot: getBenefitsSnapshotFromValue(
      application.benefitsSnapshot,
    ),
    maximumReplacementCountSnapshot:
      application.maximumReplacementCountSnapshot,
    replacementRequiresApprovalSnapshot:
      application.replacementRequiresApprovalSnapshot,
    replacementFeeSnapshot: toMoney(application.replacementFeeSnapshot),
    status: application.status,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    approvedAt: application.approvedAt?.toISOString() ?? null,
    rejectedAt: application.rejectedAt?.toISOString() ?? null,
    expiresAt: application.expiresAt?.toISOString() ?? null,
    notes: noteState.freeText,
    reviewNotes: noteState.reviewNotes,
    documentUrls: noteState.documentUrls,
    pricingStatusSnapshot:
      noteState.pricingSnapshot?.pricingStatusSnapshot ?? null,
    offerDeadlineSnapshot:
      noteState.pricingSnapshot?.offerDeadlineSnapshot ?? null,
    applicationDeadlineSnapshot:
      noteState.pricingSnapshot?.applicationDeadlineSnapshot ?? null,
    pricingSnapshotServerNow: noteState.pricingSnapshot?.serverNow ?? null,
    campaign: application.campaign
      ? {
          id: application.campaign.id,
          slug: application.campaign.slug,
          titleEn: application.campaign.titleEn,
          titleBn: application.campaign.titleBn,
          status: application.campaign.status,
        }
      : null,
    plan: application.plan
      ? {
          id: application.plan.id,
          tierId: application.plan.tierId,
          code: application.plan.code,
          nameEn: application.plan.nameEn,
          nameBn: application.plan.nameBn,
          regularPriceSnapshot: getPlanRegularPrice(application.plan),
          campaignPrice: getPlanCampaignPrice(application.plan),
          minPetsSnapshot: getPlanMinPets(application.plan),
          includedPetsSnapshot: getPlanIncludedPets(application.plan),
          maxPetsSnapshot: getPlanMaxPets(application.plan),
          maxCoveredPets: getPlanMaxPets(application.plan),
          validityYears: getPlanValidityYears(application.plan),
          validityMonths: getPlanValidityMonths(application.plan),
          benefitsSnapshot: buildPlanBenefitSnapshot(application.plan),
          tierVersion: application.plan.tierVersion,
          tier: application.plan.tier
            ? {
                id: application.plan.tier.id,
                code: application.plan.tier.code,
                slug: application.plan.tier.slug,
                nameEn: application.plan.tier.nameEn,
                nameBn: application.plan.tier.nameBn,
                version: application.plan.tier.version,
                status: application.plan.tier.status,
              }
            : null,
        }
      : null,
    payment: application.payment
      ? {
          id: application.payment.id,
          status: application.payment.status,
          amount: toMoney(application.payment.amount),
          currency: application.payment.currency,
          merchantTxnId: application.payment.merchantTxnId,
        }
      : null,
    membershipId: application.membership?.id ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function formatMembershipDetail(
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>,
) {
  const activeCoveredPets = membership.coveredPets.filter(
    (pet) =>
      pet.status === MembershipCoveredPetStatus.ACTIVE ||
      pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
  );
  const benefitTitles = getBenefitsSnapshotFromValue(
    membership.benefitsSnapshot,
  );
  const effectiveBenefitTitles =
    benefitTitles.length > 0
      ? benefitTitles
      : membership.plan
        ? buildPlanBenefitSnapshot(
            membership.plan,
            membership.membershipCampaign?.benefits,
          )
        : [];
  const remainingSlots = Math.max(
    0,
    (membership.maxCoveredPetsSnapshot ?? 0) - activeCoveredPets.length,
  );
  const upgradeOptions =
    membership.membershipCampaign?.plans
      ?.filter(
        (plan) =>
          plan.id !== membership.planId &&
          getPlanMaxPets(plan) > (membership.maxCoveredPetsSnapshot ?? 0) &&
          plan.isActive,
      )
      .map((plan) => ({
        id: plan.id,
        code: plan.code,
        nameEn: plan.nameEn,
        nameBn: plan.nameBn,
        maxCoveredPets: getPlanMaxPets(plan),
        regularPrice: getPlanRegularPrice(plan),
        offerPrice: getPlanCampaignPrice(plan),
      })) ?? [];

  return {
    id: membership.id,
    membershipNumber: membership.membershipNumber,
    cardNumber: membership.cardNumber,
    membershipStatus: membership.membershipRecordStatus ?? membership.status,
    qrVerificationData: {
      membershipId: membership.id,
      membershipNumber: membership.membershipNumber,
      cardNumber: membership.cardNumber,
      verifyPath: `/api/v1/me/memberships/${membership.id}`,
    },
    validity: {
      validFrom:
        membership.validFrom?.toISOString() ??
        membership.startsAt?.toISOString() ??
        null,
      validUntil:
        membership.validUntil?.toISOString() ??
        membership.expiresAt?.toISOString() ??
        null,
      activatedAt: membership.activatedAt?.toISOString() ?? null,
    },
    plan: membership.plan
      ? {
          id: membership.plan.id,
          tierId: membership.plan.tierId,
          code: membership.plan.code,
          nameEn: membership.plan.nameEn,
          nameBn: membership.plan.nameBn,
          regularPriceSnapshot: getPlanRegularPrice(membership.plan),
          campaignPrice: getPlanCampaignPrice(membership.plan),
          regularPrice: getPlanRegularPrice(membership.plan),
          offerPrice: getPlanCampaignPrice(membership.plan),
          minPetsSnapshot: getPlanMinPets(membership.plan),
          includedPetsSnapshot: getPlanIncludedPets(membership.plan),
          maxPetsSnapshot: getPlanMaxPets(membership.plan),
          maxCoveredPets: getPlanMaxPets(membership.plan),
          validityYears: getPlanValidityYears(membership.plan),
          validityMonths: getPlanValidityMonths(membership.plan),
          benefitsSnapshot: buildPlanBenefitSnapshot(
            membership.plan,
            membership.membershipCampaign?.benefits,
          ),
          tierVersion: membership.plan.tierVersion,
          tier: membership.plan.tier
            ? {
                id: membership.plan.tier.id,
                code: membership.plan.tier.code,
                slug: membership.plan.tier.slug,
                nameEn: membership.plan.tier.nameEn,
                nameBn: membership.plan.tier.nameBn,
                version: membership.plan.tier.version,
                status: membership.plan.tier.status,
              }
            : null,
        }
      : {
          id: membership.planId,
          tierId: membership.tierIdSnapshot,
          tierCodeSnapshot: membership.tierCodeSnapshot,
          tierNameEnSnapshot: membership.tierNameEnSnapshot,
          tierNameBnSnapshot: membership.tierNameBnSnapshot,
          code: membership.planCodeSnapshot,
          nameEn: membership.planNameSnapshot,
          nameBn: membership.planNameSnapshot,
          regularPrice: membership.regularPriceSnapshot
            ? Number(membership.regularPriceSnapshot)
            : null,
          offerPrice: membership.paidPriceSnapshot
            ? Number(membership.paidPriceSnapshot)
            : null,
          minPetsSnapshot: membership.minCoveredPetsSnapshot,
          includedPetsSnapshot: membership.includedPetsSnapshot,
          maxPetsSnapshot: membership.maxCoveredPetsSnapshot,
          maxCoveredPets: membership.maxCoveredPetsSnapshot,
          validityYears: null,
          validityMonths: membership.validityMonthsSnapshot,
          benefitsSnapshot: getBenefitsSnapshotFromValue(
            membership.benefitsSnapshot,
          ),
          tierVersion: membership.tierVersionSnapshot,
        },
    maximumCoveredPets: membership.maxCoveredPetsSnapshot,
    currentCoveredPets: activeCoveredPets.map((coveredPet) => ({
      id: coveredPet.id,
      petId: coveredPet.petId,
      slotNumber: coveredPet.slotNumber,
      status: coveredPet.status,
      linkedAt: coveredPet.linkedAt.toISOString(),
      pet: coveredPet.pet,
    })),
    remainingSlots,
    replacementAllowance: {
      maximumReplacementCount: membership.maximumReplacementCountSnapshot,
      usedReplacementCount: membership.coveredPets.filter(
        (pet) => pet.isReplacement,
      ).length,
    },
    linkedPetHistory: membership.coveredPets.map((coveredPet) => ({
      id: coveredPet.id,
      petId: coveredPet.petId,
      slotNumber: coveredPet.slotNumber,
      status: coveredPet.status,
      linkedAt: coveredPet.linkedAt.toISOString(),
      linkedAtClinic: coveredPet.linkedAtClinic
        ? {
            id: coveredPet.linkedAtClinic.id,
            name: coveredPet.linkedAtClinic.name,
          }
        : null,
      replacementOfCoveredPetId: coveredPet.replacementOfCoveredPetId,
      replacedByCoveredPetId: coveredPet.replacedByCoveredPetId,
      isReplacement: coveredPet.isReplacement,
      pet: coveredPet.pet,
    })),
    benefits: effectiveBenefitTitles.map((titleEn, index) => ({
      id: `${membership.id}-benefit-${index}`,
      titleEn,
      titleBn: null,
      descriptionEn: null,
      descriptionBn: null,
      icon: null,
    })),
    serviceUsageHistory: membership.serviceUsages.map((usage) => ({
      id: usage.id,
      serviceDate: usage.serviceDate.toISOString(),
      serviceCode: usage.serviceCode,
      serviceName: usage.serviceName,
      status: usage.status,
      clinic: usage.clinic
        ? { id: usage.clinic.id, name: usage.clinic.name }
        : null,
      pet: usage.pet,
    })),
    upgradeOptions,
  };
}

function formatMembershipUpgrade(upgrade: {
  id: string;
  membershipId: string;
  fromPlanId: string;
  toPlanId: string;
  paymentId: string | null;
  requestedByUserId: string | null;
  reviewedByAdminId: string | null;
  regularPriceSnapshot: Prisma.Decimal | null;
  paidPriceSnapshot: Prisma.Decimal;
  upgradePriceSnapshot: Prisma.Decimal;
  maxCoveredPetsSnapshotBefore: number;
  maxCoveredPetsSnapshotAfter: number;
  status: MembershipUpgradeRecordStatus;
  requestedAt: Date;
  reviewedAt: Date | null;
  completedAt: Date | null;
  reviewNotes: string | null;
  membership?: {
    id: string;
    membershipNumber: string | null;
    cardNumber: string | null;
  } | null;
  fromPlan?: {
    id: string;
    code: string;
    nameEn: string;
    nameBn: string | null;
    maxCoveredPets: number;
  } | null;
  toPlan?: {
    id: string;
    code: string;
    nameEn: string;
    nameBn: string | null;
    maxCoveredPets: number;
  } | null;
  payment?: {
    id: string;
    status: string;
    amount: Prisma.Decimal;
    currency: string;
    merchantTxnId: string | null;
  } | null;
}) {
  return {
    id: upgrade.id,
    membershipId: upgrade.membershipId,
    paymentId: upgrade.paymentId,
    status: upgrade.status,
    requestedAt: upgrade.requestedAt.toISOString(),
    reviewedAt: upgrade.reviewedAt?.toISOString() ?? null,
    completedAt: upgrade.completedAt?.toISOString() ?? null,
    reviewNotes: upgrade.reviewNotes,
    pricing: {
      regularPrice: toMoney(upgrade.regularPriceSnapshot),
      targetPlanPrice: toMoney(upgrade.paidPriceSnapshot),
      upgradePayable: toMoney(upgrade.upgradePriceSnapshot),
      eligibleCredit: Math.max(
        0,
        roundPrice(
          (toMoney(upgrade.paidPriceSnapshot) ?? 0) -
            (toMoney(upgrade.upgradePriceSnapshot) ?? 0),
        ),
      ),
    },
    entitlement: {
      beforeMaxCoveredPets: upgrade.maxCoveredPetsSnapshotBefore,
      afterMaxCoveredPets: upgrade.maxCoveredPetsSnapshotAfter,
    },
    membership: upgrade.membership
      ? {
          id: upgrade.membership.id,
          membershipNumber: upgrade.membership.membershipNumber,
          cardNumber: upgrade.membership.cardNumber,
        }
      : null,
    fromPlan: upgrade.fromPlan
      ? {
          id: upgrade.fromPlan.id,
          code: upgrade.fromPlan.code,
          nameEn: upgrade.fromPlan.nameEn,
          nameBn: upgrade.fromPlan.nameBn,
          maxCoveredPets: upgrade.fromPlan.maxCoveredPets,
        }
      : null,
    toPlan: upgrade.toPlan
      ? {
          id: upgrade.toPlan.id,
          code: upgrade.toPlan.code,
          nameEn: upgrade.toPlan.nameEn,
          nameBn: upgrade.toPlan.nameBn,
          maxCoveredPets: upgrade.toPlan.maxCoveredPets,
        }
      : null,
    payment: upgrade.payment
      ? {
          id: upgrade.payment.id,
          status: upgrade.payment.status,
          amount: toMoney(upgrade.payment.amount),
          currency: upgrade.payment.currency,
          merchantTxnId: upgrade.payment.merchantTxnId,
        }
      : null,
  };
}

async function getMembershipUpgradeOwnedByUser(
  upgradeId: string,
  userId: string,
) {
  const upgrade = await prisma.membershipUpgrade.findUnique({
    where: { id: upgradeId },
    include: {
      membership: true,
      fromPlan: true,
      toPlan: true,
      payment: true,
    },
  });
  if (!upgrade || upgrade.membership.userId !== userId) {
    throw AppError.notFound("Membership upgrade");
  }
  return upgrade;
}

function buildUpgradeQuoteForPlan(params: {
  membership: NonNullable<Awaited<ReturnType<typeof repo.getMembershipById>>>;
  campaign: NonNullable<Awaited<ReturnType<typeof repo.getCampaignBySlug>>>;
  plan: {
    id: string;
    code: string;
    nameEn: string;
    nameBn: string | null;
    regularPrice?: Prisma.Decimal | null;
    offerPrice?: Prisma.Decimal | null;
    regularPriceSnapshot?: Prisma.Decimal | null;
    campaignPrice?: Prisma.Decimal | null;
    maxCoveredPets?: number | null;
    maxPetsSnapshot?: number | null;
  };
}) {
  const pricing = buildPricingObject(params.plan, params.campaign);
  const eligibleCredit = Math.max(
    0,
    roundPrice(toMoney(params.membership.paidPriceSnapshot) ?? 0),
  );
  const upgradePayable = Math.max(
    0,
    roundPrice(pricing.effectivePrice - eligibleCredit),
  );
  return {
    id: params.plan.id,
    code: params.plan.code,
    nameEn: params.plan.nameEn,
    nameBn: params.plan.nameBn,
    maxCoveredPets: getPlanMaxPets(params.plan),
    regularPrice: pricing.regularPrice,
    offerPrice: pricing.offerPrice,
    effectivePrice: pricing.effectivePrice,
    eligibleCredit,
    upgradePayable,
    isOfferActive: pricing.isOfferActive,
    pricingStatus: pricing.pricingStatus,
    offerEndsAt: pricing.offerEndsAt,
    applicationEndsAt: pricing.applicationEndsAt,
    serverNow: pricing.serverNow,
    serverTime: pricing.serverTime,
  };
}

export async function listActiveCampaignSummaries() {
  const serverTime = nowInBusinessClock();
  const campaigns = await repo.listActiveCampaigns(serverTime);
  return {
    campaigns: campaigns.map((campaign) =>
      formatActiveCampaignSummary(campaign, serverTime),
    ),
    serverTime: serverTime.toISOString(),
  };
}

export async function getPublicCampaign(slug: string) {
  const campaign = ensureCampaignReadable(await repo.getCampaignBySlug(slug));
  return formatCampaignDetail(campaign);
}

export async function createMembershipApplication(
  userId: string,
  dto: CreateMembershipApplicationDto,
  ctx: AuditContext,
) {
  const campaign = ensureCampaignReadable(
    await repo.getCampaignById(dto.campaignId),
  );
  assertCampaignActiveForApplication(campaign);
  const plan = await getCampaignPlanForApplication(dto.campaignId, dto.planId);
  const pricing = buildPricingObject(plan, campaign);
  assertPricingMatchesExpectedAmount(pricing, dto.expectedAmount);

  const created = await prisma.membershipApplication.create({
    data: {
      campaignId: dto.campaignId,
      planId: dto.planId,
      userId,
      applicationNumber: generateApplicationNumber(),
      applicantName: dto.applicantName,
      applicantMobile: dto.applicantMobile,
      applicantEmail: dto.applicantEmail,
      applicantAddress: dto.applicantAddress,
      ...buildApplicationSnapshotData(plan, pricing),
      status: MembershipApplicationStatus.draft,
      notes: serializeApplicationNotes(
        buildApplicationNotesState(
          {
            freeText: dto.notes ?? null,
            documentUrls: dto.documentUrls ?? [],
          },
          pricing,
        ),
      ),
    },
    include: repo.membershipApplicationInclude,
  });
  await auditCreate(
    "membership_application",
    created.id,
    {
      applicationNumber: created.applicationNumber,
      userId,
      planId: dto.planId,
    },
    ctx,
  );
  return formatApplication(created);
}

export async function updateMembershipApplication(
  userId: string,
  id: string,
  dto: UpdateMembershipApplicationDto,
  ctx: AuditContext,
) {
  const application = await getApplicationOwnedByUser(id, userId);
  if (!(
    application.status === MembershipApplicationStatus.draft ||
    application.status === MembershipApplicationStatus.submitted
  )) {
    throw AppError.badRequest(
      "Membership application is not editable",
      "MEMBERSHIP_APPLICATION_NOT_EDITABLE",
    );
  }
  const nextCampaignId = application.campaignId;
  const nextPlanId = dto.planId ?? application.planId;
  const campaign = ensureCampaignReadable(
    await repo.getCampaignById(nextCampaignId),
  );
  assertCampaignActiveForApplication(campaign);
  const noteState = normalizeApplicationNotes(application.notes);
  const planChanged = nextPlanId !== application.planId;
  const plan =
    planChanged || dto.expectedAmount !== undefined
      ? await getCampaignPlanForApplication(nextCampaignId, nextPlanId)
      : null;
  const pricing = plan ? buildPricingObject(plan, campaign) : null;
  if (pricing) {
    assertPricingMatchesExpectedAmount(pricing, dto.expectedAmount);
  }

  const updated = await prisma.membershipApplication.update({
    where: { id },
    data: {
      planId: nextPlanId,
      applicantName: dto.applicantName ?? undefined,
      applicantMobile: dto.applicantMobile ?? undefined,
      applicantEmail:
        dto.applicantEmail === undefined ? undefined : dto.applicantEmail,
      applicantAddress:
        dto.applicantAddress === undefined ? undefined : dto.applicantAddress,
      ...(plan && pricing ? buildApplicationSnapshotData(plan, pricing) : {}),
      notes: serializeApplicationNotes({
        freeText: dto.notes !== undefined ? dto.notes : noteState.freeText,
        documentUrls: dto.documentUrls ?? noteState.documentUrls,
        reviewNotes: noteState.reviewNotes,
        pricingSnapshot: pricing
          ? buildApplicationPricingSnapshot(pricing)
          : noteState.pricingSnapshot,
      }),
    },
    include: repo.membershipApplicationInclude,
  });
  await auditUpdate(
    "membership_application",
    id,
    { planId: application.planId, status: application.status },
    { planId: updated.planId, status: updated.status },
    ctx,
  );
  return formatApplication(updated);
}

export async function submitMembershipApplication(
  userId: string,
  id: string,
  dto: SubmitMembershipApplicationDto,
  ctx: AuditContext,
) {
  const application = await getApplicationOwnedByUser(id, userId);
  if (!(
    application.status === MembershipApplicationStatus.draft ||
    application.status === MembershipApplicationStatus.submitted
  )) {
    throw AppError.badRequest(
      "Membership application is not editable",
      "MEMBERSHIP_APPLICATION_NOT_EDITABLE",
    );
  }
  const campaign = ensureCampaignReadable(
    await repo.getCampaignById(application.campaignId),
  );
  assertCampaignActiveForApplication(campaign);
  const plan = await getCampaignPlanForApplication(
    application.campaignId,
    application.planId,
  );
  const pricing = buildPricingObject(plan, campaign);
  assertPricingMatchesExpectedAmount(pricing, dto.expectedAmount);
  const snapshotPrice = roundPrice(
    toMoney(application.finalPriceSnapshot) ?? 0,
  );
  if (roundPrice(pricing.effectivePrice) !== snapshotPrice) {
    throwPriceChanged(pricing, snapshotPrice);
  }
  const noteState = normalizeApplicationNotes(application.notes);

  const submitted = await prisma.membershipApplication.update({
    where: { id },
    data: {
      ...buildApplicationSnapshotData(plan, pricing),
      notes: serializeApplicationNotes({
        freeText: noteState.freeText,
        documentUrls: noteState.documentUrls,
        reviewNotes: noteState.reviewNotes,
        pricingSnapshot: buildApplicationPricingSnapshot(pricing),
      }),
      status: MembershipApplicationStatus.submitted,
      submittedAt: new Date(),
    },
    include: repo.membershipApplicationInclude,
  });
  await writeAuditLog(
    {
      action: AuditAction.update,
      resource: "membership_application_submit",
      resourceId: submitted.id,
      oldValues: { status: application.status },
      newValues: { status: submitted.status },
    },
    ctx,
  );
  return formatApplication(submitted);
}

export async function createMembershipApplicationPayment(
  userId: string,
  id: string,
  dto: CreateMembershipPaymentDto,
  ctx: AuditContext,
) {
  const application = await getApplicationOwnedByUser(id, userId);
  if (!(
    application.status === MembershipApplicationStatus.submitted ||
    application.status === MembershipApplicationStatus.draft ||
    application.status === MembershipApplicationStatus.pending_payment
  )) {
    throw AppError.badRequest(
      "Membership application cannot be paid in its current status",
      "MEMBERSHIP_APPLICATION_NOT_EDITABLE",
    );
  }
  const campaign = ensureCampaignReadable(
    await repo.getCampaignById(application.campaignId),
  );
  assertCampaignActiveForApplication(campaign);
  const now = nowInBusinessClock();
  const paymentMode =
    config.EPS_ENABLED === "true" &&
    config.PAYMENT_CHANNEL_MODE !== "MANUAL" &&
    isEPSConfigured()
      ? "eps"
      : "manual";

  if (
    application.paymentId &&
    application.expiresAt &&
    application.expiresAt > now &&
    application.payment &&
    application.payment.status === "pending"
  ) {
    return {
      application: formatApplication(application),
      payment: {
        id: application.payment.id,
        merchantTxnId: application.payment.merchantTxnId,
        amount: toMoney(application.payment.amount),
        currency: application.payment.currency,
        paymentMode,
        redirectUrl: null,
        paymentLockExpiresAt: application.expiresAt.toISOString(),
      },
    };
  }

  const plan = await getCampaignPlanForApplication(
    application.campaignId,
    application.planId,
  );
  const pricing = buildPricingObject(plan, campaign, now);
  const snapshotPrice = roundPrice(
    toMoney(application.finalPriceSnapshot) ?? 0,
  );
  assertPricingMatchesExpectedAmount(pricing, dto.expectedAmount);
  if (roundPrice(pricing.effectivePrice) !== snapshotPrice) {
    throwPriceChanged(pricing, snapshotPrice);
  }

  const paymentLockExpiresAt = new Date(
    now.getTime() + MEMBERSHIP_PAYMENT_LOCK_SECONDS * 1000,
  );
  const merchantTxnId = generateMembershipMerchantTxnId("A");
  const payment = await createPayment({
    gateway: "eps",
    merchantTxnId,
    amount: pricing.effectivePrice,
    currency: "BDT",
    purpose: MEMBERSHIP_PAYMENT_PURPOSE,
    payload: {
      type: MEMBERSHIP_PAYMENT_PURPOSE,
      applicationId: application.id,
      campaignId: application.campaignId,
      planId: application.planId,
      pricingSnapshot: {
        regularPrice: pricing.regularPrice,
        offerPrice: pricing.offerPrice,
        effectivePrice: pricing.effectivePrice,
        pricingStatus: pricing.pricingStatus,
        offerEndsAt: pricing.offerEndsAt,
        applicationEndsAt: pricing.applicationEndsAt,
        serverNow: pricing.serverNow,
      },
      paymentLockExpiresAt: paymentLockExpiresAt.toISOString(),
      timezone: DHAKA_TIMEZONE,
    },
  });

  const appUpdated = await prisma.membershipApplication.update({
    where: { id },
    data: {
      status: MembershipApplicationStatus.pending_payment,
      paymentId: payment.id,
      expiresAt: paymentLockExpiresAt,
    },
    include: repo.membershipApplicationInclude,
  });

  let redirectUrl: string | null = null;

  if (paymentMode === "eps") {
    const epsResult = await initializeEpsPayment({
      customerOrderId: application.id,
      merchantTransactionId: merchantTxnId,
      totalAmount: pricing.effectivePrice,
      customerName: appUpdated.applicantName,
      customerEmail: appUpdated.applicantEmail || "no-email@bpa.org",
      customerPhone: appUpdated.applicantMobile,
      customerAddress: appUpdated.applicantAddress || "Bangladesh",
      customerCity: "Dhaka",
      customerState: "Dhaka Division",
      customerPostcode: "1000",
      productName: `BPA Membership ${application.plan?.nameEn ?? application.tierNameEnSnapshot ?? "Plan"}`,
      valueA: payment.id,
      valueB: MEMBERSHIP_PAYMENT_PURPOSE,
    });
    redirectUrl = epsResult.RedirectURL || null;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        epsTxnId: epsResult.TransactionId,
        gatewayRef: epsResult.TransactionId,
      },
    });
  }

  await writeAuditLog(
    {
      action: AuditAction.create,
      resource: "membership_payment",
      resourceId: payment.id,
      newValues: {
        applicationId: application.id,
        amount: pricing.effectivePrice,
        paymentMode,
      },
    },
    ctx,
  );

  return {
    application: formatApplication(appUpdated),
    payment: {
      id: payment.id,
      merchantTxnId,
      amount: pricing.effectivePrice,
      currency: "BDT",
      paymentMode,
      redirectUrl,
      paymentLockExpiresAt: paymentLockExpiresAt.toISOString(),
    },
  };
}

export async function handleMembershipApplicationPaymentSuccess(
  paymentId: string,
) {
  const application = await prisma.membershipApplication.findFirst({
    where: { paymentId },
    include: repo.membershipApplicationInclude,
  });
  if (!application) return null;
  if (
    application.status === MembershipApplicationStatus.paid ||
    application.status === MembershipApplicationStatus.approved
  ) {
    return application;
  }
  return prisma.membershipApplication.update({
    where: { id: application.id },
    data: {
      status: MembershipApplicationStatus.paid,
    },
    include: repo.membershipApplicationInclude,
  });
}

export async function listMyMembershipApplications(userId: string) {
  const result = await repo.listMembershipApplications({
    userId,
  } as MembershipApplicationListQuery);
  return { items: result.items.map(formatApplication), meta: result.meta };
}

export async function getMyMembershipApplication(userId: string, id: string) {
  return formatApplication(await getApplicationOwnedByUser(id, userId));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listMyMemberships(userId: string, query?: MembershipListQuery) {
  if (!UUID_RE.test(userId)) {
    // The authenticated identity failed to resolve to a valid local user id.
    // This is an auth/identity-mapping failure, not "no memberships" -
    // surface it explicitly instead of letting Prisma fail decoding the
    // query parameter or silently returning an empty list.
    throw AppError.unauthorized(
      'Unable to resolve authenticated user identity',
      'USER_IDENTITY_UNRESOLVED',
    );
  }
  const mergedQuery = { ...query, userId } as MembershipListQuery;
  const result = await repo.listMemberships(mergedQuery);
  return { items: result.items.map(formatMembershipDetail), meta: result.meta };
}

export async function getMyMembership(userId: string, id: string) {
  const membership = await getMembershipOwnedByUser(id, userId);
  return formatMembershipDetail(membership);
}

export async function getMembershipUpgradeOptions(
  userId: string,
  membershipId: string,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);
  assertMembershipActiveState(membership);
  const campaign = membership.membershipCampaign
    ? ensureCampaignReadable(
        await repo.getCampaignById(membership.membershipCampaign.id),
      )
    : null;
  if (!campaign)
    throw AppError.badRequest(
      "Membership campaign is unavailable",
      "MEMBERSHIP_CAMPAIGN_NOT_ACTIVE",
    );

  const usedPetSlots = membership.coveredPets.filter(
    (pet) =>
      pet.status === MembershipCoveredPetStatus.ACTIVE ||
      pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
  ).length;

  const availablePlans = campaign.plans
    .filter(
      (plan) =>
        plan.isActive &&
        plan.maxCoveredPets > (membership.maxCoveredPetsSnapshot ?? 0),
    )
    .map((plan) => buildUpgradeQuoteForPlan({ membership, campaign, plan }));

  return {
    currentPlan: {
      code: membership.planCodeSnapshot ?? membership.plan?.code ?? null,
      maxCoveredPets:
        membership.maxCoveredPetsSnapshot ??
        membership.plan?.maxCoveredPets ??
        0,
      usedPetSlots,
    },
    availablePlans,
  };
}

export async function getMyMembershipUpgrade(
  userId: string,
  upgradeId: string,
) {
  return formatMembershipUpgrade(
    await getMembershipUpgradeOwnedByUser(upgradeId, userId),
  );
}

export async function listMyMembershipEligiblePets(
  userId: string,
  membershipId: string,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);
  assertMembershipActiveState(membership);

  const owner = await resolveMembershipOwner(membership as never);
  const linked = new Set(
    membership.coveredPets
      .filter(
        (cp) =>
          cp.status === MembershipCoveredPetStatus.ACTIVE ||
          cp.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
      )
      .map((cp) => cp.petId),
  );

  const eligible = owner.pets
    .filter((pet) => pet.isActive && !linked.has(pet.id))
    .map((pet) => ({
      id: pet.id,
      name: pet.name,
      type: pet.petType,
    }));

  return {
    eligiblePets: eligible,
    linkedCount: membership.coveredPets.filter(
      (cp) => cp.status === MembershipCoveredPetStatus.ACTIVE,
    ).length,
    maxPets:
      membership.maxCoveredPetsSnapshot ?? membership.plan?.maxCoveredPets ?? 0,
  };
}

export async function linkMyMembershipPet(
  userId: string,
  membershipId: string,
  dto: ClinicLinkCoveredPetDto,
  ctx: AuditContext,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);
  assertMembershipActiveState(membership);

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
      const current = await tx.membership.findUnique({
        where: { id: membershipId },
        include: repo.membershipDetailInclude,
      });
      if (!current) throw AppError.notFound("Membership");

      const owner = await resolveMembershipOwner(current as never);
      const pet = owner.pets.find((item) => item.id === dto.petId) ?? null;
      if (!pet) {
        throw AppError.badRequest("Pet does not belong to membership owner");
      }
      if (!pet.isActive) {
        throw AppError.badRequest("Pet cannot be linked");
      }

      const duplicate = current.coveredPets.find(
        (coveredPet) =>
          coveredPet.petId === dto.petId &&
          (coveredPet.status === MembershipCoveredPetStatus.ACTIVE ||
            coveredPet.status ===
              MembershipCoveredPetStatus.REPLACEMENT_PENDING),
      );
      if (duplicate) {
        throw AppError.badRequest("Pet already linked to this membership");
      }

      const activeCoveredPets = current.coveredPets.filter(
        (cp) => cp.status === MembershipCoveredPetStatus.ACTIVE,
      );
      const maxPets =
        current.maxCoveredPetsSnapshot ?? current.plan?.maxCoveredPets ?? 0;
      if (activeCoveredPets.length >= maxPets) {
        throw AppError.badRequest(`Pet limit reached (${maxPets})`);
      }

      const occupiedSlots = new Set(
        activeCoveredPets.map((cp) => cp.slotNumber),
      );
      let slotNumber = 1;
      while (occupiedSlots.has(slotNumber)) slotNumber += 1;

      const covered = await tx.membershipCoveredPet.create({
        data: {
          membershipId: current.id,
          petId: dto.petId,
          slotNumber,
          status: MembershipCoveredPetStatus.ACTIVE,
          linkedByUserId: userId,
          linkedAt: new Date(),
        },
      });

      return {
        membership: current,
        created: covered,
        activeCoveredPetsCountBefore: activeCoveredPets.length,
      };
    },
    { timeout: 20000 },
  );

  await auditCreate(
    "membership_pet_link",
    result.created.id,
    {
      membershipId,
      petId: dto.petId,
      slotNumber: result.created.slotNumber,
      linkedByUserId: userId,
    },
    ctx,
  );

  return {
    id: result.created.id,
    membershipId,
    petId: dto.petId,
    slotNumber: result.created.slotNumber,
    status: result.created.status,
    linkedAt: result.created.linkedAt.toISOString(),
    currentPetCount: result.activeCoveredPetsCountBefore + 1,
    maxCoveredPets:
      result.membership.maxCoveredPetsSnapshot ??
      result.membership.plan?.maxCoveredPets ??
      0,
  };
}

export async function unlinkMyMembershipPet(
  userId: string,
  membershipId: string,
  petId: string,
  ctx: AuditContext,
) {
  await getMembershipOwnedByUser(membershipId, userId);

  const covered = await prisma.membershipCoveredPet.findFirst({
    where: {
      membershipId,
      petId,
      status: MembershipCoveredPetStatus.ACTIVE,
    },
  });

  if (!covered) {
    return; // Idempotent - already unlinked
  }

  const updated = await prisma.membershipCoveredPet.update({
    where: { id: covered.id },
    data: {
      status: MembershipCoveredPetStatus.REMOVED_BY_ADMIN_CORRECTION,
    },
  });

  await auditUpdate(
    "membership_covered_pet",
    covered.id,
    { status: covered.status },
    { status: updated.status },
    ctx,
  );
}

export async function getMyMembershipBenefits(
  userId: string,
  membershipId: string,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);
  assertMembershipActiveState(membership);

  const benefitsArray = Array.isArray(membership.benefitsSnapshot)
    ? (membership.benefitsSnapshot as any[])
    : [];

  const benefits = benefitsArray.map((benefit: any) => ({
    id: benefit.id || benefit.benefitId,
    name: benefit.name || benefit.serviceName,
    type: benefit.type || "unlimited",
    totalAllowance: benefit.totalAllowance,
    consumedAmount: 0,
    remainingAmount: benefit.totalAllowance,
  }));

  const usageByBenefit = await prisma.membershipServiceUsage.groupBy({
    by: ["serviceCode"],
    where: {
      membershipId,
      status: "completed",
    },
    _count: true,
  });

  return benefits.map((benefit: any) => {
    const usage = usageByBenefit.find((u) => u.serviceCode === benefit.id);
    const consumed = usage?._count || 0;
    return {
      ...benefit,
      consumedAmount: consumed,
      remainingAmount:
        benefit.totalAllowance != null
          ? benefit.totalAllowance - consumed
          : undefined,
    };
  });
}

export async function getMyMembershipBenefitHistory(
  userId: string,
  membershipId: string,
  benefitId: string,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);
  assertMembershipActiveState(membership);

  const history = await prisma.membershipServiceUsage.findMany({
    where: {
      membershipId,
      serviceCode: benefitId,
      status: { in: ["completed", "reversed"] },
    },
    include: {
      pet: true,
      clinic: true,
    },
    orderBy: { serviceDate: "desc" },
    take: 100,
  });

  return history.map((record) => ({
    id: record.id,
    serviceDate: record.serviceDate.toISOString(),
    serviceName: record.serviceName,
    petName: record.pet?.name || "Unknown",
    clinicName: record.clinic?.name || "Unknown",
    status: record.status,
    notes: record.notes,
  }));
}

export async function cancelMyMembership(
  userId: string,
  membershipId: string,
  dto: CancelMembershipDto,
  ctx: AuditContext,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);

  // Only active or expired memberships can be cancelled
  if (!["active", "expired"].includes(membership.status)) {
    throw AppError.badRequest(`Cannot cancel ${membership.status} membership`);
  }

  // Idempotent: if already cancelled, return success
  if (membership.status === "cancelled") {
    return { status: "cancelled", cancelledAt: new Date().toISOString() };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: {
      status: "cancelled",
      membershipRecordStatus: "cancelled",
    },
  });

  await auditUpdate(
    "membership_cancellation",
    membershipId,
    { status: membership.status },
    { status: "cancelled", reason: dto.reason, notes: dto.notes },
    ctx,
  );

  return { status: "cancelled", cancelledAt: new Date().toISOString() };
}

export async function getMembershipRenewalOptions(
  userId: string,
  membershipId: string,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);

  // Only expired memberships can be renewed
  if (membership.status !== "expired") {
    throw AppError.badRequest("Only expired memberships can be renewed");
  }

  const now = nowInBusinessClock();
  const campaigns = await repo.listActiveCampaigns(now);
  const result = campaigns.map((campaign) => ({
    id: campaign.id,
    slug: campaign.slug,
    titleEn: campaign.titleEn,
    titleBn: campaign.titleBn,
    applicationEndsAt: campaign.applicationEndAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    plans: campaign.plans.map((plan) => {
      const pricing = buildPricingObject(plan, campaign, now);
      return {
        id: plan.id,
        nameEn: plan.nameEn,
        nameBn: plan.nameBn,
        maxCoveredPets: getPlanMaxPets(plan),
        regularPrice: pricing.regularPrice,
        offerPrice: pricing.offerPrice,
        effectivePrice: pricing.effectivePrice,
        discountPercentage: pricing.discountPercentage,
        pricingStatus: pricing.pricingStatus,
        offerEndsAt: pricing.offerEndsAt,
        applicationEndsAt: pricing.applicationEndsAt,
        serverNow: pricing.serverNow,
      };
    }),
  }));

  return {
    currentMembership: {
      id: membership.id,
      status: membership.status,
      expiresAt: membership.expiresAt?.toISOString(),
    },
    eligibleCampaigns: result,
  };
}

export async function applyForRenewal(
  userId: string,
  membershipId: string,
  dto: MembershipRenewalApplyDto,
  ctx: AuditContext,
) {
  const membership = await getMembershipOwnedByUser(membershipId, userId);

  // Only expired memberships can be renewed
  if (membership.status !== "expired") {
    throw AppError.badRequest("Only expired memberships can be renewed");
  }

  // Verify plan exists
  const campaign = ensureCampaignReadable(
    await repo.getCampaignById(dto.campaignId),
  );
  assertCampaignActiveForApplication(campaign);
  const plan = await getCampaignPlanForApplication(dto.campaignId, dto.planId);
  const pricing = buildPricingObject(plan, campaign);

  // Get application for old membership to copy applicant details
  const oldApplication = membership.applicationId
    ? await prisma.membershipApplication.findUnique({
        where: { id: membership.applicationId },
      })
    : null;

  // Create new membership application for renewal
  const application = await prisma.membershipApplication.create({
    data: {
      userId,
      campaignId: dto.campaignId,
      planId: dto.planId,
      status: "pending_payment",
      applicantName: oldApplication?.applicantName || "",
      applicantMobile: oldApplication?.applicantMobile || "",
      applicantEmail: oldApplication?.applicantEmail,
      applicantAddress: oldApplication?.applicantAddress,
      ...buildApplicationSnapshotData(plan, pricing),
      notes: serializeApplicationNotes(buildApplicationNotesState({}, pricing)),
    },
  });

  await auditCreate(
    "membership_renewal_application",
    application.id,
    { applicationId: application.id, previousMembershipId: membershipId },
    ctx,
  );

  // Return pricing and application details
  return {
    applicationId: application.id,
    campaignId: dto.campaignId,
    planId: dto.planId,
    regularPrice: pricing.regularPrice,
    offerPrice: pricing.offerPrice,
    effectivePrice: pricing.effectivePrice,
    pricingStatus: pricing.pricingStatus,
    offerEndsAt: pricing.offerEndsAt,
    applicationEndsAt: pricing.applicationEndsAt,
    serverNow: pricing.serverNow,
    maxCoveredPets: getPlanMaxPets(plan),
    validityMonths: getPlanValidityMonths(plan),
  };
}

export async function listAdminCampaigns(query: MembershipCampaignListQuery) {
  return repo.listCampaigns(query);
}

export async function listAdminPlans(query: MembershipChildListQuery) {
  return repo.listPlans(query);
}

export async function getAdminPlanHistory(id: string) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) throw AppError.notFound("Membership plan");
  const entries = await prisma.auditLog.findMany({
    where: {
      resource: "membership_plan",
      resourceId: id,
    },
    orderBy: { createdAt: "desc" },
  });
  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entityType: entry.resource,
    entityId: entry.resourceId,
    changedBy: entry.actorEmail ?? entry.actorId ?? "system",
    changedAt: entry.createdAt.toISOString(),
    previousValues: entry.oldValues,
    newValues: entry.newValues,
    reason: entry.reason,
    effectiveDate: entry.effectiveAt?.toISOString() ?? null,
    existingMembersAffected: entry.existingMembersAffected ?? false,
  }));
}

export async function listAdminBenefits(query: MembershipChildListQuery) {
  return repo.listBenefits(query);
}

export async function listAdminMedia(query: MembershipChildListQuery) {
  return repo.listMediaItems(query);
}

export async function listAdminDocuments(query: MembershipChildListQuery) {
  return repo.listDocuments(query);
}

export async function listAdminFaqs(query: MembershipChildListQuery) {
  return repo.listFaqs(query);
}

export async function getAdminCampaign(id: string) {
  const campaign = await repo.getCampaignById(id);
  if (!campaign) throw AppError.notFound("Membership campaign");
  return campaign;
}

export async function getAdminCampaignPreview(id: string) {
  const campaign = await repo.getCampaignById(id);
  if (!campaign) throw AppError.notFound("Membership campaign");
  return formatCampaignDetail(
    campaign as NonNullable<Awaited<ReturnType<typeof repo.getCampaignBySlug>>>,
  );
}

export async function createAdminCampaign(
  dto: CreateMembershipCampaignDto,
  userId: string,
  ctx: AuditContext,
) {
  const nextStatus = dto.status ?? MembershipCampaignStatus.draft;
  if (
    nextStatus === MembershipCampaignStatus.published ||
    nextStatus === MembershipCampaignStatus.scheduled
  ) {
    await assertCampaignPublishable({
      slug: dto.slug,
      titleEn: dto.titleEn,
      titleBn: dto.titleBn,
      heroImageUrl: dto.heroImageUrl ?? null,
      mobileImageUrl: dto.mobileImageUrl ?? null,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      applicationStartAt: asNullableDate(dto.applicationStartAt) ?? null,
      applicationEndAt: asNullableDate(dto.applicationEndAt) ?? null,
      plans: [],
    });
  }

  const created = await prisma.membershipCampaign.create({
    data: {
      slug: dto.slug,
      titleEn: dto.titleEn,
      titleBn: dto.titleBn,
      shortDescriptionEn: dto.shortDescriptionEn,
      shortDescriptionBn: dto.shortDescriptionBn,
      descriptionEn: dto.descriptionEn,
      descriptionBn: dto.descriptionBn,
      heroImageUrl: dto.heroImageUrl,
      mobileImageUrl: dto.mobileImageUrl,
      thumbnailUrl: dto.thumbnailUrl,
      status: dto.status ?? MembershipCampaignStatus.draft,
      offerStartAt: asNullableDate(dto.offerStartAt),
      offerEndAt: asNullableDate(dto.offerEndAt),
      applicationStartAt: asNullableDate(dto.applicationStartAt),
      applicationEndAt: asNullableDate(dto.applicationEndAt),
      publishedAt: asNullableDate(dto.publishedAt),
      eligibilityContentEn: dto.eligibilityContentEn,
      eligibilityContentBn: dto.eligibilityContentBn,
      howItWorksContentEn: dto.howItWorksContentEn,
      howItWorksContentBn: dto.howItWorksContentBn,
      termsContentEn: dto.termsContentEn,
      termsContentBn: dto.termsContentBn,
      refundPolicyEn: dto.refundPolicyEn,
      refundPolicyBn: dto.refundPolicyBn,
      organizerNameEn: dto.organizerNameEn,
      organizerNameBn: dto.organizerNameBn,
      supportPhone: dto.supportPhone,
      supportEmail: dto.supportEmail,
      supportWhatsapp: dto.supportWhatsapp,
      supportAddress: dto.supportAddress,
      notes: dto.notes,
      createdById: userId,
      updatedById: userId,
    },
  });
  await auditCreate(
    "membership_campaign",
    created.id,
    { slug: created.slug, titleEn: created.titleEn },
    ctx,
  );
  return created;
}

export async function updateAdminCampaign(
  id: string,
  dto: UpdateMembershipCampaignDto,
  userId: string,
  ctx: AuditContext,
) {
  const existing = await getAdminCampaign(id);
  const nextStatus = dto.status ?? existing.status;
  if (
    nextStatus === MembershipCampaignStatus.published ||
    nextStatus === MembershipCampaignStatus.scheduled
  ) {
    await assertCampaignPublishable({
      slug: dto.slug ?? existing.slug,
      titleEn: dto.titleEn ?? existing.titleEn,
      titleBn: dto.titleBn ?? existing.titleBn,
      heroImageUrl:
        dto.heroImageUrl === undefined
          ? existing.heroImageUrl
          : (dto.heroImageUrl ?? null),
      mobileImageUrl:
        dto.mobileImageUrl === undefined
          ? existing.mobileImageUrl
          : (dto.mobileImageUrl ?? null),
      thumbnailUrl:
        dto.thumbnailUrl === undefined
          ? existing.thumbnailUrl
          : (dto.thumbnailUrl ?? null),
      applicationStartAt:
        asNullableDate(dto.applicationStartAt) === undefined
          ? existing.applicationStartAt
          : (asNullableDate(dto.applicationStartAt) ?? null),
      applicationEndAt:
        asNullableDate(dto.applicationEndAt) === undefined
          ? existing.applicationEndAt
          : (asNullableDate(dto.applicationEndAt) ?? null),
      plans: existing.plans as never,
    });
  }

  const updated = await prisma.membershipCampaign.update({
    where: { id },
    data: {
      slug: dto.slug ?? undefined,
      titleEn: dto.titleEn ?? undefined,
      titleBn: dto.titleBn ?? undefined,
      shortDescriptionEn: dto.shortDescriptionEn ?? undefined,
      shortDescriptionBn: dto.shortDescriptionBn ?? undefined,
      descriptionEn: dto.descriptionEn ?? undefined,
      descriptionBn: dto.descriptionBn ?? undefined,
      heroImageUrl: dto.heroImageUrl ?? undefined,
      mobileImageUrl: dto.mobileImageUrl ?? undefined,
      thumbnailUrl: dto.thumbnailUrl ?? undefined,
      status: dto.status ?? undefined,
      offerStartAt: asNullableDate(dto.offerStartAt),
      offerEndAt: asNullableDate(dto.offerEndAt),
      applicationStartAt: asNullableDate(dto.applicationStartAt),
      applicationEndAt: asNullableDate(dto.applicationEndAt),
      publishedAt: asNullableDate(dto.publishedAt),
      eligibilityContentEn: dto.eligibilityContentEn ?? undefined,
      eligibilityContentBn: dto.eligibilityContentBn ?? undefined,
      howItWorksContentEn: dto.howItWorksContentEn ?? undefined,
      howItWorksContentBn: dto.howItWorksContentBn ?? undefined,
      termsContentEn: dto.termsContentEn ?? undefined,
      termsContentBn: dto.termsContentBn ?? undefined,
      refundPolicyEn: dto.refundPolicyEn ?? undefined,
      refundPolicyBn: dto.refundPolicyBn ?? undefined,
      organizerNameEn: dto.organizerNameEn ?? undefined,
      organizerNameBn: dto.organizerNameBn ?? undefined,
      supportPhone: dto.supportPhone ?? undefined,
      supportEmail: dto.supportEmail ?? undefined,
      supportWhatsapp: dto.supportWhatsapp ?? undefined,
      supportAddress: dto.supportAddress ?? undefined,
      notes: dto.notes ?? undefined,
      updatedById: userId,
    },
  });
  await auditUpdate(
    "membership_campaign",
    id,
    { titleEn: existing.titleEn, status: existing.status },
    { titleEn: updated.titleEn, status: updated.status },
    ctx,
  );
  return updated;
}

export async function deleteAdminCampaign(id: string, ctx: AuditContext) {
  const existing = await getAdminCampaign(id);
  await prisma.membershipCampaign.delete({ where: { id } });
  await auditDelete(
    "membership_campaign",
    id,
    { slug: existing.slug, titleEn: existing.titleEn },
    ctx,
  );
}

function assertPlanPricingIsValid(
  regularPrice: number,
  campaignPrice: number,
  allowPriceIncrease = false,
) {
  if (!allowPriceIncrease && campaignPrice > regularPrice) {
    throw AppError.badRequest(
      "Campaign price cannot exceed regular price",
      "MEMBERSHIP_PLAN_INVALID_PRICING",
    );
  }
}

function assertPlanPetLimits(
  minPets: number,
  includedPets: number,
  maxPets: number,
) {
  if (minPets > includedPets || includedPets > maxPets) {
    throw AppError.badRequest(
      "Pet limits must satisfy minPets <= includedPets <= maxPets",
      "MEMBERSHIP_PLAN_INVALID_PET_LIMITS",
    );
  }
}

async function getTierForPlanWrite(tierId: string) {
  const tier = await prisma.communityMembershipTier.findUnique({
    where: { id: tierId },
  });
  if (!tier) throw AppError.notFound("Membership tier");
  return tier;
}

async function assertCampaignPlanTierUnique(
  campaignId: string,
  tierId: string,
  existingPlanId?: string,
) {
  const duplicate = await prisma.membershipPlan.findFirst({
    where: {
      campaignId,
      tierId,
      ...(existingPlanId ? { NOT: { id: existingPlanId } } : {}),
    },
  });
  if (duplicate) {
    throw AppError.badRequest(
      "This tier is already linked to the selected campaign",
      "MEMBERSHIP_PLAN_DUPLICATE_TIER",
    );
  }
}

async function buildPlanWriteData(
  dto: CreateMembershipPlanDto | UpdateMembershipPlanDto,
  existing?: {
    campaignId: string;
    tierId: string;
    code: string;
    nameEn: string;
    nameBn: string;
    regularPriceSnapshot: Prisma.Decimal | null;
    campaignPrice: Prisma.Decimal | null;
    minPetsSnapshot: number | null;
    includedPetsSnapshot: number | null;
    maxPetsSnapshot: number | null;
    validityMonthsSnapshot: number | null;
    benefitsSnapshot: Prisma.JsonValue | null;
    tierVersion: number;
    allowPriceIncrease: boolean;
    maximumReplacementCount: number;
    replacementRequiresApproval: boolean;
    replacementFee: Prisma.Decimal | null;
    sortOrder: number;
    isActive: boolean;
  },
) {
  const tierId = dto.tierId ?? existing?.tierId;
  if (!tierId)
    throw AppError.badRequest(
      "Tier is required",
      "MEMBERSHIP_PLAN_TIER_REQUIRED",
    );
  const tier = await getTierForPlanWrite(tierId);

  const regularPrice =
    dto.regularPriceSnapshot ??
    (existing
      ? Number(existing.regularPriceSnapshot)
      : Number(tier.regularPriceBdt));
  const campaignPrice =
    dto.campaignPrice ??
    (existing ? Number(existing.campaignPrice) : Number(tier.launchPriceBdt));
  const minPets =
    dto.minPetsSnapshot ?? existing?.minPetsSnapshot ?? tier.petLimitMin;
  const includedPets =
    dto.includedPetsSnapshot ??
    existing?.includedPetsSnapshot ??
    tier.includedPets;
  const maxPets =
    dto.maxPetsSnapshot ?? existing?.maxPetsSnapshot ?? tier.petLimitMax;
  const validityMonths =
    dto.validityMonthsSnapshot ??
    existing?.validityMonthsSnapshot ??
    tier.validityMonths;
  const allowPriceIncrease =
    dto.allowPriceIncrease ?? existing?.allowPriceIncrease ?? false;
  const benefitsSnapshot =
    dto.benefitsSnapshot ??
    getBenefitsSnapshotFromValue(existing?.benefitsSnapshot) ??
    [];

  assertPlanPricingIsValid(regularPrice, campaignPrice, allowPriceIncrease);
  assertPlanPetLimits(minPets, includedPets, maxPets);

  const isActive = dto.isActive ?? existing?.isActive ?? true;
  if (
    isActive &&
    (!tier.isActive || tier.status === "inactive" || tier.status === "archived")
  ) {
    throw AppError.badRequest(
      "Active campaign plans must reference active tiers",
      "MEMBERSHIP_PLAN_TIER_INACTIVE",
    );
  }

  const code =
    dto.code ?? existing?.code ?? tier.code ?? tier.slug.toUpperCase();
  const tierVersion = Math.max(existing?.tierVersion ?? 0, tier.version);

  return {
    tier,
    data: {
      tierId: tier.id,
      code,
      nameEn: dto.nameEn ?? existing?.nameEn ?? tier.nameEn,
      nameBn: dto.nameBn ?? existing?.nameBn ?? tier.nameBn,
      regularPrice: new Prisma.Decimal(regularPrice),
      offerPrice: new Prisma.Decimal(campaignPrice),
      regularPriceSnapshot: new Prisma.Decimal(regularPrice),
      campaignPrice: new Prisma.Decimal(campaignPrice),
      minPetsSnapshot: minPets,
      includedPetsSnapshot: includedPets,
      maxPetsSnapshot: maxPets,
      validityMonthsSnapshot: validityMonths,
      benefitsSnapshot: benefitsSnapshot as Prisma.InputJsonValue,
      tierVersion,
      allowPriceIncrease,
      maxCoveredPets: maxPets,
      validityYears: validityMonths % 12 === 0 ? validityMonths / 12 : null,
      validityMonths: validityMonths,
      maximumReplacementCount:
        dto.maximumReplacementCount ?? existing?.maximumReplacementCount ?? 0,
      replacementRequiresApproval:
        dto.replacementRequiresApproval ??
        existing?.replacementRequiresApproval ??
        true,
      replacementFee:
        dto.replacementFee === undefined
          ? (existing?.replacementFee ?? null)
          : dto.replacementFee == null
            ? null
            : new Prisma.Decimal(dto.replacementFee),
      sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
      isActive,
    },
    audit: {
      reason: dto.changeReason ?? null,
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
      existingMembersAffected: dto.existingMembersAffected ?? false,
    },
  };
}

export async function createAdminPlan(
  dto: CreateMembershipPlanDto,
  ctx: AuditContext,
) {
  await assertCampaignPlanTierUnique(dto.campaignId, dto.tierId);
  const { data, audit } = await buildPlanWriteData(dto);
  const created = await prisma.membershipPlan.create({
    data: {
      campaignId: dto.campaignId,
      ...data,
    },
    include: { tier: true, campaign: true },
  });
  await writeAuditLog(
    {
      action: AuditAction.create,
      resource: "membership_plan",
      resourceId: created.id,
      newValues: {
        campaignId: dto.campaignId,
        tierId: created.tierId,
        code: created.code,
      },
      reason: audit.reason,
      effectiveAt: audit.effectiveAt,
      existingMembersAffected: audit.existingMembersAffected,
    },
    ctx,
  );
  return created;
}

export async function updateAdminPlan(
  id: string,
  dto: UpdateMembershipPlanDto,
  ctx: AuditContext,
) {
  const existing = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership plan");
  const nextTierId = dto.tierId ?? existing.tierId;
  await assertCampaignPlanTierUnique(existing.campaignId, nextTierId, id);
  const { data, audit } = await buildPlanWriteData(dto, existing);
  const campaign = await prisma.membershipCampaign.findUnique({
    where: { id: existing.campaignId },
    include: {
      plans: {
        include: { tier: true },
      },
    },
  });
  if (
    campaign &&
    (campaign.status === MembershipCampaignStatus.published ||
      campaign.status === MembershipCampaignStatus.scheduled)
  ) {
    const plansAfter = campaign.plans.map((plan) =>
      plan.id === id ? { ...plan, ...data } : plan,
    );
    try {
      await assertCampaignPublishable({
        ...campaign,
        plans: plansAfter,
      } as never);
    } catch (e: any) {
      if (e.code === "MEMBERSHIP_CAMPAIGN_NO_ACTIVE_PLAN") {
        throw AppError.badRequest(
          "Cannot deactivate the final active plan while the campaign is published.",
          "MEMBERSHIP_CAMPAIGN_REQUIRES_ACTIVE_PLAN",
        );
      }
      throw e;
    }
  }

  const updated = await prisma.membershipPlan.update({
    where: { id },
    data,
    include: { tier: true, campaign: true },
  });
  await writeAuditLog(
    {
      action: AuditAction.update,
      resource: "membership_plan",
      resourceId: id,
      oldValues: {
        tierId: existing.tierId,
        code: existing.code,
        regularPriceSnapshot: Number(existing.regularPriceSnapshot),
        campaignPrice: Number(existing.campaignPrice),
        maxPetsSnapshot: existing.maxPetsSnapshot,
        isActive: existing.isActive,
      },
      newValues: {
        tierId: updated.tierId,
        code: updated.code,
        regularPriceSnapshot: Number(updated.regularPriceSnapshot),
        campaignPrice: Number(updated.campaignPrice),
        maxPetsSnapshot: updated.maxPetsSnapshot,
        isActive: updated.isActive,
      },
      reason: audit.reason,
      effectiveAt: audit.effectiveAt,
      existingMembersAffected: audit.existingMembersAffected,
    },
    ctx,
  );
  return updated;
}

export async function deleteAdminPlan(id: string, ctx: AuditContext) {
  const existing = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership plan");
  const campaign = await prisma.membershipCampaign.findUnique({
    where: { id: existing.campaignId },
    include: {
      plans: {
        include: { tier: true },
      },
    },
  });
  if (
    campaign &&
    (campaign.status === MembershipCampaignStatus.published ||
      campaign.status === MembershipCampaignStatus.scheduled)
  ) {
    const plansAfter = campaign.plans.filter((p) => p.id !== id);
    try {
      await assertCampaignPublishable({
        ...campaign,
        plans: plansAfter,
      } as any);
    } catch (e: any) {
      if (e.code === "MEMBERSHIP_CAMPAIGN_NO_ACTIVE_PLAN") {
        throw AppError.badRequest(
          "Cannot delete the final active plan while the campaign is published.",
          "MEMBERSHIP_CAMPAIGN_REQUIRES_ACTIVE_PLAN",
        );
      }
    }
  }

  await prisma.membershipPlan.delete({ where: { id } });
  await auditDelete("membership_plan", id, { code: existing.code }, ctx);
}

export async function createAdminBenefit(
  dto: CreateMembershipBenefitDto,
  ctx: AuditContext,
) {
  const created = await prisma.membershipBenefit.create({
    data: {
      campaignId: dto.campaignId,
      code: dto.code,
      titleEn: dto.titleEn,
      titleBn: dto.titleBn,
      descriptionEn: dto.descriptionEn,
      descriptionBn: dto.descriptionBn,
      icon: dto.icon,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      plans: dto.planIds?.length
        ? {
            createMany: {
              data: dto.planIds.map((planId) => ({ planId })),
            },
          }
        : undefined,
    },
    include: { plans: true },
  });
  await auditCreate(
    "membership_benefit",
    created.id,
    { titleEn: created.titleEn },
    ctx,
  );
  return created;
}

export async function updateAdminBenefit(
  id: string,
  dto: UpdateMembershipBenefitDto,
  ctx: AuditContext,
) {
  const existing = await prisma.membershipBenefit.findUnique({
    where: { id },
    include: { plans: true },
  });
  if (!existing) throw AppError.notFound("Membership benefit");
  const updated = await prisma.$transaction(async (tx) => {
    if (dto.planIds) {
      await tx.membershipPlanBenefit.deleteMany({ where: { benefitId: id } });
      if (dto.planIds.length) {
        await tx.membershipPlanBenefit.createMany({
          data: dto.planIds.map((planId) => ({ planId, benefitId: id })),
        });
      }
    }
    return tx.membershipBenefit.update({
      where: { id },
      data: {
        code: dto.code ?? undefined,
        titleEn: dto.titleEn ?? undefined,
        titleBn: dto.titleBn ?? undefined,
        descriptionEn: dto.descriptionEn ?? undefined,
        descriptionBn: dto.descriptionBn ?? undefined,
        icon: dto.icon ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
      include: { plans: true },
    });
  });
  await auditUpdate(
    "membership_benefit",
    id,
    { titleEn: existing.titleEn },
    { titleEn: updated.titleEn },
    ctx,
  );
  return updated;
}

export async function deleteAdminBenefit(id: string, ctx: AuditContext) {
  const existing = await prisma.membershipBenefit.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership benefit");
  await prisma.membershipBenefit.delete({ where: { id } });
  await auditDelete(
    "membership_benefit",
    id,
    { titleEn: existing.titleEn },
    ctx,
  );
}

export async function createAdminMedia(
  dto: CreateMembershipMediaDto,
  ctx: AuditContext,
) {
  await assertMembershipMediaFile(dto.mediaFileId, dto.role);
  const created = await prisma.membershipMedia.create({ data: dto });
  await auditCreate(
    "membership_media",
    created.id,
    { campaignId: created.campaignId, role: created.role },
    ctx,
  );
  return created;
}

export async function updateAdminMedia(
  id: string,
  dto: UpdateMembershipMediaDto,
  ctx: AuditContext,
) {
  const existing = await prisma.membershipMedia.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership media");
  if (dto.mediaFileId) {
    await assertMembershipMediaFile(
      dto.mediaFileId,
      (dto.role ?? existing.role) as MembershipMediaRole,
    );
  }
  const updated = await prisma.membershipMedia.update({
    where: { id },
    data: dto,
  });
  await auditUpdate(
    "membership_media",
    id,
    { role: existing.role },
    { role: updated.role },
    ctx,
  );
  return updated;
}

export async function deleteAdminMedia(id: string, ctx: AuditContext) {
  const existing = await prisma.membershipMedia.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership media");
  await prisma.membershipMedia.delete({ where: { id } });
  await auditDelete("membership_media", id, { role: existing.role }, ctx);
}

export async function createAdminDocument(
  dto: CreateMembershipDocumentDto,
  ctx: AuditContext,
) {
  if (dto.mediaFileId) {
    await assertMembershipDocumentFile(dto.mediaFileId);
  }
  const created = await prisma.membershipDocument.create({ data: dto });
  await auditCreate(
    "membership_document",
    created.id,
    { documentType: created.documentType, titleEn: created.titleEn },
    ctx,
  );
  return created;
}

export async function updateAdminDocument(
  id: string,
  dto: UpdateMembershipDocumentDto,
  ctx: AuditContext,
) {
  const existing = await prisma.membershipDocument.findUnique({
    where: { id },
  });
  if (!existing) throw AppError.notFound("Membership document");
  if (dto.mediaFileId) {
    await assertMembershipDocumentFile(dto.mediaFileId);
  }
  const updated = await prisma.membershipDocument.update({
    where: { id },
    data: dto,
  });
  await auditUpdate(
    "membership_document",
    id,
    { titleEn: existing.titleEn },
    { titleEn: updated.titleEn },
    ctx,
  );
  return updated;
}

export async function deleteAdminDocument(id: string, ctx: AuditContext) {
  const existing = await prisma.membershipDocument.findUnique({
    where: { id },
  });
  if (!existing) throw AppError.notFound("Membership document");
  await prisma.membershipDocument.delete({ where: { id } });
  await auditDelete(
    "membership_document",
    id,
    { titleEn: existing.titleEn },
    ctx,
  );
}

export async function createAdminFaq(
  dto: CreateMembershipFaqDto,
  ctx: AuditContext,
) {
  const created = await prisma.membershipFaq.create({ data: dto });
  await auditCreate(
    "membership_faq",
    created.id,
    { questionEn: created.questionEn },
    ctx,
  );
  return created;
}

export async function updateAdminFaq(
  id: string,
  dto: UpdateMembershipFaqDto,
  ctx: AuditContext,
) {
  const existing = await prisma.membershipFaq.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership FAQ");
  const updated = await prisma.membershipFaq.update({
    where: { id },
    data: dto,
  });
  await auditUpdate(
    "membership_faq",
    id,
    { questionEn: existing.questionEn },
    { questionEn: updated.questionEn },
    ctx,
  );
  return updated;
}

export async function deleteAdminFaq(id: string, ctx: AuditContext) {
  const existing = await prisma.membershipFaq.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Membership FAQ");
  await prisma.membershipFaq.delete({ where: { id } });
  await auditDelete(
    "membership_faq",
    id,
    { questionEn: existing.questionEn },
    ctx,
  );
}

export async function listAdminApplications(
  query: MembershipApplicationListQuery,
) {
  return repo.listMembershipApplications(query);
}

export async function getAdminApplication(id: string) {
  const application = await repo.getMembershipApplicationById(id);
  if (!application) throw AppError.notFound("Membership application");
  return formatApplication(application);
}

export async function reviewAdminApplication(
  id: string,
  dto: AdminMembershipApplicationReviewDto,
  ctx: AuditContext,
) {
  const application = await repo.getMembershipApplicationById(id);
  if (!application) throw AppError.notFound("Membership application");
  const noteState = normalizeApplicationNotes(application.notes);
  const updated = await prisma.membershipApplication.update({
    where: { id },
    data: {
      status:
        dto.status === "approved"
          ? MembershipApplicationStatus.approved
          : MembershipApplicationStatus.rejected,
      approvedAt: dto.status === "approved" ? new Date() : null,
      rejectedAt: dto.status === "rejected" ? new Date() : null,
      notes: serializeApplicationNotes({
        freeText: noteState.freeText,
        documentUrls: noteState.documentUrls,
        reviewNotes: dto.reviewNotes ?? noteState.reviewNotes,
        pricingSnapshot: noteState.pricingSnapshot,
      }),
    },
    include: repo.membershipApplicationInclude,
  });
  await auditUpdate(
    "membership_application_review",
    id,
    { status: application.status },
    { status: updated.status },
    ctx,
  );
  return formatApplication(updated);
}

export async function activateMembershipFromApplication(
  id: string,
  dto: AdminMembershipActivationDto,
  ctx: AuditContext,
) {
  const application = await repo.getMembershipApplicationById(id);
  if (!application) throw AppError.notFound("Membership application");
  if (!(
    application.status === MembershipApplicationStatus.paid ||
    application.status === MembershipApplicationStatus.approved
  )) {
    throw AppError.badRequest(
      "Membership application is not ready for activation",
      "MEMBERSHIP_CAMPAIGN_NOT_ACTIVE",
    );
  }
  if (application.membership)
    return formatMembershipDetail(
      (await repo.getMembershipById(application.membership.id)) as never,
    );
  const validFrom = asNullableDay(dto.validFrom) ?? new Date();
  const validUntil = addValidity(
    validFrom,
    application.validityYearsSnapshot,
    application.validityMonthsSnapshot,
  );

  const membership = await prisma.$transaction(async (tx) => {
    const createdMembership = await tx.membership.create({
      data: {
        membershipCampaignId: application.campaignId,
        userId: application.userId,
        applicationId: application.id,
        planId: application.planId,
        membershipNumber: generateMembershipNumber(),
        cardNumber: generateCardNumber(),
        tierIdSnapshot: application.tierIdSnapshot,
        tierCodeSnapshot: application.tierCodeSnapshot,
        tierNameEnSnapshot: application.tierNameEnSnapshot,
        tierNameBnSnapshot: application.tierNameBnSnapshot,
        tierVersionSnapshot: application.tierVersionSnapshot,
        planCodeSnapshot: application.plan.code,
        planNameSnapshot: application.plan.nameEn,
        regularPriceSnapshot: application.regularPriceSnapshot,
        paidPriceSnapshot: application.finalPriceSnapshot,
        minCoveredPetsSnapshot: application.minCoveredPetsSnapshot,
        includedPetsSnapshot: application.includedPetsSnapshot,
        maxCoveredPetsSnapshot: application.maxCoveredPetsSnapshot,
        validityMonthsSnapshot: application.validityMonthsSnapshot,
        benefitsSnapshot:
          application.benefitsSnapshot ??
          buildPlanBenefitSnapshot(application.plan),
        maximumReplacementCountSnapshot:
          application.maximumReplacementCountSnapshot,
        validFrom,
        validUntil,
        membershipRecordStatus: MembershipRecordStatus.active,
        activatedAt: dto.activatedAt ? new Date(dto.activatedAt) : new Date(),
        memberId: null,
        startsAt: validFrom,
        expiresAt: validUntil,
        status: "active",
      },
      include: repo.membershipDetailInclude,
    });

    await tx.membershipApplication.update({
      where: { id: application.id },
      data: {
        status: MembershipApplicationStatus.approved,
        approvedAt: new Date(),
      },
    });
    return createdMembership;
  });

  await auditCreate(
    "membership_activation",
    membership.id,
    {
      applicationId: application.id,
      membershipNumber: membership.membershipNumber,
    },
    ctx,
  );
  return formatMembershipDetail(membership);
}

export async function listAdminMemberships(query: MembershipListQuery) {
  return repo.listMemberships(query);
}

export async function getAdminMembership(id: string) {
  const membership = await repo.getMembershipById(id);
  if (!membership) throw AppError.notFound("Membership");
  return formatMembershipDetail(membership);
}

export async function updateAdminMembershipStatus(
  id: string,
  dto: AdminMembershipStatusDto,
  ctx: AuditContext,
) {
  const membership = await repo.getMembershipById(id);
  if (!membership) throw AppError.notFound("Membership");
  const updated = await prisma.membership.update({
    where: { id },
    data: {
      membershipRecordStatus: dto.status,
    },
    include: repo.membershipDetailInclude,
  });
  await auditUpdate(
    "membership_status",
    id,
    { status: membership.membershipRecordStatus },
    { status: updated.membershipRecordStatus },
    ctx,
  );
  return formatMembershipDetail(updated);
}

export async function listAdminReplacements(
  query: MembershipReplacementListQuery,
) {
  return repo.listMembershipReplacements(query);
}

export async function listAdminCoveredPets(
  query: MembershipCoveredPetListQuery,
) {
  return repo.listMembershipCoveredPets(query);
}

export async function listAdminServiceUsage(
  query: MembershipServiceUsageListQuery,
) {
  return repo.listMembershipServiceUsages(query);
}

export async function getAdminReplacement(id: string) {
  const replacement = await repo.getMembershipReplacementById(id);
  if (!replacement) throw AppError.notFound("Membership pet replacement");
  return replacement;
}

export async function createMembershipReplacementRequest(
  membershipId: string,
  dto: CreateMembershipReplacementDto,
  actor: { userId?: string; staffId?: string },
  ctx: AuditContext,
) {
  const membership = await repo.getMembershipById(membershipId);
  if (!membership) throw AppError.notFound("Membership");
  assertMembershipActiveState(membership);

  const coveredPet = membership.coveredPets.find(
    (pet) => pet.id === dto.coveredPetId,
  );
  if (!coveredPet) throw AppError.notFound("Covered pet");
  const pending = await prisma.membershipPetReplacement.findFirst({
    where: {
      membershipId,
      oldCoveredPetId: dto.coveredPetId,
      status: {
        in: [
          MembershipPetReplacementStatus.REQUESTED,
          MembershipPetReplacementStatus.UNDER_REVIEW,
          MembershipPetReplacementStatus.APPROVED,
        ],
      },
    },
  });
  if (pending) {
    throw AppError.badRequest(
      "A replacement request is already pending for this pet",
      "PET_REPLACEMENT_ALREADY_PENDING",
    );
  }
  if (coveredPet.status !== MembershipCoveredPetStatus.ACTIVE) {
    throw AppError.badRequest(
      "Covered pet removal is not allowed",
      "MEMBERSHIP_PET_REMOVAL_NOT_ALLOWED",
    );
  }
  if (!(dto.reason === "DECEASED" || dto.reason === "PERMANENTLY_LOST")) {
    throw AppError.badRequest(
      "Replacement reason is not allowed",
      "PET_REPLACEMENT_REASON_NOT_ALLOWED",
    );
  }

  const replacementCount = await prisma.membershipPetReplacement.count({
    where: {
      membershipId,
      status: {
        in: [
          MembershipPetReplacementStatus.APPROVED,
          MembershipPetReplacementStatus.COMPLETED,
        ],
      },
    },
  });
  if (replacementCount >= (membership.maximumReplacementCountSnapshot ?? 0)) {
    throw AppError.badRequest(
      "Replacement limit reached for this membership",
      "PET_REPLACEMENT_LIMIT_REACHED",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.membershipCoveredPet.update({
      where: { id: dto.coveredPetId },
      data: { status: MembershipCoveredPetStatus.REPLACEMENT_PENDING },
    });
    return tx.membershipPetReplacement.create({
      data: {
        membershipId,
        oldCoveredPetId: dto.coveredPetId,
        reason: dto.reason,
        status: MembershipPetReplacementStatus.REQUESTED,
        supportingDocumentUrl: dto.supportingDocumentUrl,
        requestedByUserId: actor.userId ?? null,
        requestedByStaffId: actor.staffId ?? null,
        reviewNotes: appendReplacementNotes(
          null,
          dto.notes ?? null,
          "REQUEST: ",
        ),
      },
    });
  });

  await auditCreate(
    "membership_replacement_request",
    created.id,
    {
      membershipId,
      coveredPetId: dto.coveredPetId,
      reason: dto.reason,
      requestedByUserId: actor.userId ?? null,
      requestedByStaffId: actor.staffId ?? null,
    },
    ctx,
  );
  return created;
}

export async function reviewAdminReplacement(
  id: string,
  dto: MembershipReplacementReviewDto,
  reviewerId: string,
  ctx: AuditContext,
) {
  const replacement = await prisma.membershipPetReplacement.findUnique({
    where: { id },
  });
  if (!replacement) throw AppError.notFound("Membership pet replacement");
  const updated = await prisma.membershipPetReplacement.update({
    where: { id },
    data: {
      status: dto.status,
      reviewedByAdminId: reviewerId,
      reviewNotes: dto.reviewNotes ?? undefined,
      newPetId: dto.newPetId ?? undefined,
      reviewedAt: new Date(),
      completedAt:
        dto.status === MembershipPetReplacementStatus.COMPLETED
          ? new Date()
          : undefined,
    },
  });
  await auditUpdate(
    "membership_replacement",
    id,
    { status: replacement.status },
    { status: updated.status },
    ctx,
  );
  return updated;
}

export async function approveMembershipReplacement(
  id: string,
  dto: ApproveMembershipReplacementDto,
  reviewerId: string,
  ctx: AuditContext,
) {
  const replacement = await prisma.membershipPetReplacement.findUnique({
    where: { id },
  });
  if (!replacement) throw AppError.notFound("Membership pet replacement");
  const updated = await prisma.membershipPetReplacement.update({
    where: { id },
    data: {
      status: MembershipPetReplacementStatus.APPROVED,
      reviewedByAdminId: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: appendReplacementNotes(
        replacement.reviewNotes,
        dto.reviewNotes ?? null,
        "APPROVED: ",
      ),
    },
  });
  await auditUpdate(
    "membership_replacement_approve",
    id,
    { status: replacement.status },
    { status: updated.status },
    ctx,
  );
  return updated;
}

export async function rejectMembershipReplacement(
  id: string,
  dto: RejectMembershipReplacementDto,
  reviewerId: string,
  ctx: AuditContext,
) {
  const replacement = await prisma.membershipPetReplacement.findUnique({
    where: { id },
  });
  if (!replacement) throw AppError.notFound("Membership pet replacement");
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.membershipPetReplacement.update({
      where: { id },
      data: {
        status: MembershipPetReplacementStatus.REJECTED,
        reviewedByAdminId: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: appendReplacementNotes(
          replacement.reviewNotes,
          dto.reviewNotes ?? null,
          "REJECTED: ",
        ),
      },
    });
    await tx.membershipCoveredPet.update({
      where: { id: replacement.oldCoveredPetId },
      data: { status: MembershipCoveredPetStatus.ACTIVE },
    });
    return row;
  });
  await auditUpdate(
    "membership_replacement_reject",
    id,
    { status: replacement.status },
    { status: updated.status },
    ctx,
  );
  return updated;
}

export async function completeMembershipReplacement(
  id: string,
  dto: CompleteMembershipReplacementDto,
  reviewerId: string,
  ctx: AuditContext,
) {
  const replacement = await repo.getMembershipReplacementById(id);
  if (!replacement) throw AppError.notFound("Membership pet replacement");
  if (replacement.status !== MembershipPetReplacementStatus.APPROVED) {
    throw AppError.badRequest(
      "Replacement request is not approved",
      "PET_REPLACEMENT_NOT_APPROVED",
    );
  }

  const membershipId = replacement.membershipId;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
    const membership = await tx.membership.findUnique({
      where: { id: membershipId },
      include: repo.membershipDetailInclude,
    });
    if (!membership) throw AppError.notFound("Membership");

    const oldCoveredPet = membership.coveredPets.find(
      (pet) => pet.id === replacement.oldCoveredPetId,
    );
    if (!oldCoveredPet) throw AppError.notFound("Covered pet");
    const owner = await resolveMembershipOwner(membership as never);
    const newPet = owner.pets.find((pet) => pet.id === dto.newPetId) ?? null;
    if (!newPet) {
      throw AppError.badRequest(
        "Pet does not belong to the membership owner",
        "MEMBERSHIP_PET_OWNER_MISMATCH",
      );
    }
    if (!newPet.isActive) {
      throw AppError.badRequest(
        "Pet data is not valid for membership linking",
        "MEMBERSHIP_PET_INVALID",
      );
    }

    const activeCount = membership.coveredPets.filter(
      (pet) => pet.status === MembershipCoveredPetStatus.ACTIVE,
    ).length;
    if (activeCount > (membership.maxCoveredPetsSnapshot ?? 0)) {
      throw AppError.badRequest(
        "Replacement slot is unavailable",
        "PET_REPLACEMENT_SLOT_UNAVAILABLE",
      );
    }

    const duplicate = membership.coveredPets.find(
      (pet) =>
        pet.petId === dto.newPetId &&
        (pet.status === MembershipCoveredPetStatus.ACTIVE ||
          pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING),
    );
    if (duplicate) {
      throw AppError.badRequest(
        "Replacement slot is unavailable",
        "PET_REPLACEMENT_SLOT_UNAVAILABLE",
      );
    }

    await tx.membershipCoveredPet.update({
      where: { id: oldCoveredPet.id },
      data: {
        status:
          replacement.reason === "DECEASED"
            ? MembershipCoveredPetStatus.DECEASED
            : MembershipCoveredPetStatus.LOST,
      },
    });

    const createdCoveredPet = await tx.membershipCoveredPet.create({
      data: {
        membershipId,
        petId: dto.newPetId,
        slotNumber: oldCoveredPet.slotNumber,
        status: MembershipCoveredPetStatus.ACTIVE,
        linkedAt: new Date(),
        linkedByStaffId: replacement.requestedByStaffId ?? reviewerId,
        linkedByUserId: replacement.requestedByUserId ?? null,
        linkedAtClinicId: oldCoveredPet.linkedAtClinicId,
        replacementOfCoveredPetId: oldCoveredPet.id,
        isReplacement: true,
      },
    });

    await tx.membershipCoveredPet.update({
      where: { id: oldCoveredPet.id },
      data: {
        replacedByCoveredPetId: createdCoveredPet.id,
      },
    });

    const completed = await tx.membershipPetReplacement.update({
      where: { id },
      data: {
        newPetId: dto.newPetId,
        status: MembershipPetReplacementStatus.COMPLETED,
        reviewedByAdminId: reviewerId,
        reviewedAt: replacement.reviewedAt ?? new Date(),
        completedAt: new Date(),
        reviewNotes: appendReplacementNotes(
          replacement.reviewNotes,
          dto.reviewNotes ?? null,
          "COMPLETED: ",
        ),
      },
    });

    return { createdCoveredPet, completed };
  });

  await auditUpdate(
    "membership_replacement_complete",
    id,
    { status: replacement.status },
    {
      status: result.completed.status,
      newPetId: dto.newPetId,
      replacementOfCoveredPetId: replacement.oldCoveredPetId,
    },
    ctx,
  );
  return result.completed;
}

export async function createMembershipUpgrade(
  userId: string,
  dto: MembershipUpgradeCreateDto,
  ctx: AuditContext,
) {
  const membership = await getMembershipOwnedByUser(dto.membershipId, userId);
  assertMembershipActiveState(membership);
  const toPlan = await prisma.membershipPlan.findFirst({
    where: {
      id: dto.toPlanId,
      campaignId: membership.membershipCampaignId ?? undefined,
      isActive: true,
    },
  });
  if (!toPlan)
    throw AppError.badRequest(
      "Selected membership plan is not available",
      "MEMBERSHIP_PLAN_NOT_AVAILABLE",
    );
  if (toPlan.maxCoveredPets <= (membership.maxCoveredPetsSnapshot ?? 0)) {
    throw AppError.badRequest(
      "Upgrade target must increase the pet limit",
      "MEMBERSHIP_PLAN_NOT_AVAILABLE",
    );
  }
  const campaign = membership.membershipCampaign
    ? ensureCampaignReadable(
        await repo.getCampaignById(membership.membershipCampaign.id),
      )
    : null;
  if (!campaign)
    throw AppError.badRequest(
      "Membership campaign is unavailable",
      "MEMBERSHIP_CAMPAIGN_NOT_ACTIVE",
    );
  const quote = buildUpgradeQuoteForPlan({
    membership,
    campaign,
    plan: toPlan,
  });
  if (
    dto.expectedAmount !== undefined &&
    roundPrice(dto.expectedAmount) !== roundPrice(quote.upgradePayable)
  ) {
    throw AppError.badRequest(
      "Membership payment price changed",
      "MEMBERSHIP_PAYMENT_PRICE_CHANGED",
    );
  }

  const upgrade = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${membership.id}))`;
    const pendingExisting = await tx.membershipUpgrade.findFirst({
      where: {
        membershipId: membership.id,
        status: {
          in: [
            MembershipUpgradeRecordStatus.pending_payment,
            MembershipUpgradeRecordStatus.paid,
          ],
        },
      },
      orderBy: { requestedAt: "desc" },
    });
    if (pendingExisting) {
      throw AppError.badRequest(
        "A membership upgrade is already in progress",
        "MEMBERSHIP_UPGRADE_ALREADY_PENDING",
      );
    }

    return tx.membershipUpgrade.create({
      data: {
        membershipId: membership.id,
        fromPlanId: membership.planId!,
        toPlanId: toPlan.id,
        requestedByUserId: userId,
        regularPriceSnapshot: toPlan.regularPrice,
        paidPriceSnapshot: new Prisma.Decimal(quote.effectivePrice),
        upgradePriceSnapshot: new Prisma.Decimal(quote.upgradePayable),
        maxCoveredPetsSnapshotBefore: membership.maxCoveredPetsSnapshot ?? 0,
        maxCoveredPetsSnapshotAfter: toPlan.maxCoveredPets,
        status: MembershipUpgradeRecordStatus.pending_payment,
      },
      include: {
        membership: true,
        fromPlan: true,
        toPlan: true,
        payment: true,
      },
    });
  });
  await auditCreate(
    "membership_upgrade",
    upgrade.id,
    {
      membershipId: membership.id,
      toPlanId: toPlan.id,
      upgradePayable: quote.upgradePayable,
    },
    ctx,
  );
  return formatMembershipUpgrade(upgrade);
}

export async function createMembershipUpgradePayment(
  userId: string,
  upgradeId: string,
  dto: MembershipUpgradePaymentDto,
  ctx: AuditContext,
) {
  const upgrade = await getMembershipUpgradeOwnedByUser(upgradeId, userId);
  if (upgrade.status !== MembershipUpgradeRecordStatus.pending_payment) {
    throw AppError.badRequest(
      "Membership upgrade is not payable in its current status",
      "MEMBERSHIP_APPLICATION_NOT_EDITABLE",
    );
  }

  const membership = await getMembershipOwnedByUser(
    upgrade.membershipId,
    userId,
  );
  assertMembershipActiveState(membership);

  const campaign = membership.membershipCampaign
    ? ensureCampaignReadable(
        await repo.getCampaignById(membership.membershipCampaign.id),
      )
    : null;
  if (!campaign)
    throw AppError.badRequest(
      "Membership campaign is unavailable",
      "MEMBERSHIP_CAMPAIGN_NOT_ACTIVE",
    );

  const toPlan = await prisma.membershipPlan.findFirst({
    where: {
      id: upgrade.toPlanId,
      campaignId: membership.membershipCampaignId ?? undefined,
      isActive: true,
    },
  });
  if (!toPlan)
    throw AppError.badRequest(
      "Selected membership plan is not available",
      "MEMBERSHIP_PLAN_NOT_AVAILABLE",
    );

  const quote = buildUpgradeQuoteForPlan({
    membership,
    campaign,
    plan: toPlan,
  });
  if (
    dto.expectedAmount !== undefined &&
    roundPrice(dto.expectedAmount) !== roundPrice(quote.upgradePayable)
  ) {
    throw AppError.badRequest(
      "Membership payment price changed",
      "MEMBERSHIP_PAYMENT_PRICE_CHANGED",
    );
  }

  if (upgrade.paymentId) {
    const existingPayment = await prisma.payment.findUnique({
      where: { id: upgrade.paymentId },
    });
    if (existingPayment && existingPayment.status === "pending") {
      return {
        upgrade: formatMembershipUpgrade({
          ...upgrade,
          payment: existingPayment,
        }),
        payment: {
          id: existingPayment.id,
          merchantTxnId: existingPayment.merchantTxnId,
          amount: toMoney(existingPayment.amount),
          currency: existingPayment.currency,
          paymentMode: "eps",
          redirectUrl: null,
        },
      };
    }
  }

  const merchantTxnId = generateMembershipMerchantTxnId("U");
  const paymentLockExpiresAt = new Date(
    Date.now() + MEMBERSHIP_PAYMENT_LOCK_SECONDS * 1000,
  );
  const payment = await createPayment({
    gateway: "eps",
    merchantTxnId,
    amount: quote.upgradePayable,
    currency: "BDT",
    purpose: MEMBERSHIP_UPGRADE_PAYMENT_PURPOSE,
    payload: {
      type: MEMBERSHIP_UPGRADE_PAYMENT_PURPOSE,
      membershipId: membership.id,
      upgradeId: upgrade.id,
      fromPlanId: membership.planId,
      toPlanId: toPlan.id,
      pricingSnapshot: quote,
      paymentLockExpiresAt: paymentLockExpiresAt.toISOString(),
      timezone: DHAKA_TIMEZONE,
    },
  });

  const updatedUpgrade = await prisma.membershipUpgrade.update({
    where: { id: upgrade.id },
    data: {
      paymentId: payment.id,
      regularPriceSnapshot: toPlan.regularPrice,
      paidPriceSnapshot: new Prisma.Decimal(quote.effectivePrice),
      upgradePriceSnapshot: new Prisma.Decimal(quote.upgradePayable),
      maxCoveredPetsSnapshotAfter: toPlan.maxCoveredPets,
    },
    include: {
      membership: true,
      fromPlan: true,
      toPlan: true,
      payment: true,
    },
  });

  let redirectUrl: string | null = null;
  const paymentMode =
    config.EPS_ENABLED === "true" &&
    config.PAYMENT_CHANNEL_MODE !== "MANUAL" &&
    isEPSConfigured()
      ? "eps"
      : "manual";

  if (paymentMode === "eps") {
    const epsResult = await initializeEpsPayment({
      customerOrderId: upgrade.id,
      merchantTransactionId: merchantTxnId,
      totalAmount: quote.upgradePayable,
      customerName:
        membership.user?.name ??
        membership.application?.applicantName ??
        "BPA Member",
      customerEmail:
        membership.user?.email ||
        membership.application?.applicantEmail ||
        "no-email@bpa.org",
      customerPhone:
        membership.application?.applicantMobile ||
        membership.user?.phone ||
        "00000000000",
      customerAddress: membership.application?.applicantAddress || "Bangladesh",
      customerCity: "Dhaka",
      customerState: "Dhaka Division",
      customerPostcode: "1000",
      productName: `BPA Membership Upgrade ${toPlan.nameEn}`,
      valueA: payment.id,
      valueB: MEMBERSHIP_UPGRADE_PAYMENT_PURPOSE,
    });
    redirectUrl = epsResult.RedirectURL || null;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        epsTxnId: epsResult.TransactionId,
        gatewayRef: epsResult.TransactionId,
      },
    });
  }

  await writeAuditLog(
    {
      action: AuditAction.create,
      resource: "membership_upgrade_payment",
      resourceId: payment.id,
      newValues: {
        upgradeId: upgrade.id,
        amount: quote.upgradePayable,
        paymentMode,
      },
    },
    ctx,
  );

  return {
    upgrade: formatMembershipUpgrade(updatedUpgrade),
    payment: {
      id: payment.id,
      merchantTxnId,
      amount: quote.upgradePayable,
      currency: "BDT",
      paymentMode,
      redirectUrl,
      paymentLockExpiresAt: paymentLockExpiresAt.toISOString(),
    },
  };
}

export async function handleMembershipUpgradePaymentSuccess(paymentId: string) {
  const upgrade = await prisma.membershipUpgrade.findFirst({
    where: { paymentId },
    include: { membership: true, fromPlan: true, toPlan: true, payment: true },
  });
  if (!upgrade) return null;
  if (upgrade.status === MembershipUpgradeRecordStatus.completed)
    return upgrade;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: upgrade.membershipId },
      data: {
        planId: upgrade.toPlanId,
        planCodeSnapshot: upgrade.toPlan.code,
        planNameSnapshot: upgrade.toPlan.nameEn,
        regularPriceSnapshot: upgrade.toPlan.regularPrice,
        paidPriceSnapshot: upgrade.paidPriceSnapshot,
        maxCoveredPetsSnapshot: upgrade.maxCoveredPetsSnapshotAfter,
      },
    });
    return tx.membershipUpgrade.update({
      where: { id: upgrade.id },
      data: {
        status: MembershipUpgradeRecordStatus.completed,
        reviewedAt: upgrade.reviewedAt ?? new Date(),
        completedAt: new Date(),
      },
      include: {
        membership: true,
        fromPlan: true,
        toPlan: true,
        payment: true,
      },
    });
  });
  return updated;
}

export async function handleMembershipUpgradePaymentFailure(
  paymentId: string,
  status: "failed" | "cancelled",
) {
  const upgrade = await prisma.membershipUpgrade.findFirst({
    where: { paymentId },
  });
  if (!upgrade) return null;
  if (upgrade.status === MembershipUpgradeRecordStatus.completed)
    return upgrade;
  if (
    upgrade.status === MembershipUpgradeRecordStatus.failed ||
    upgrade.status === MembershipUpgradeRecordStatus.cancelled
  ) {
    return upgrade;
  }

  return prisma.membershipUpgrade.update({
    where: { id: upgrade.id },
    data: {
      status:
        status === "cancelled"
          ? MembershipUpgradeRecordStatus.cancelled
          : MembershipUpgradeRecordStatus.failed,
      reviewedAt: new Date(),
      reviewNotes: appendReplacementNotes(
        upgrade.reviewNotes,
        `Payment ${status}`,
        "SYSTEM: ",
      ),
    },
  });
}

export async function listAdminUpgrades(query: MembershipUpgradeListQuery) {
  const result = await repo.listMembershipUpgrades(query);
  return {
    items: result.items.map(formatMembershipUpgrade),
    meta: result.meta,
  };
}

export async function getAdminUpgrade(id: string) {
  const upgrade = await prisma.membershipUpgrade.findUnique({
    where: { id },
    include: { membership: true, fromPlan: true, toPlan: true, payment: true },
  });
  if (!upgrade) throw AppError.notFound("Membership upgrade");
  return formatMembershipUpgrade(upgrade);
}

export async function reviewAdminUpgrade(
  id: string,
  dto: MembershipUpgradeReviewDto,
  reviewerId: string,
  ctx: AuditContext,
) {
  const upgrade = await prisma.membershipUpgrade.findUnique({ where: { id } });
  if (!upgrade) throw AppError.notFound("Membership upgrade");
  const updated = await prisma.membershipUpgrade.update({
    where: { id },
    data: {
      status:
        dto.status === "completed"
          ? MembershipUpgradeRecordStatus.completed
          : MembershipUpgradeRecordStatus.cancelled,
      reviewedByAdminId: reviewerId,
      reviewNotes: dto.reviewNotes ?? undefined,
      reviewedAt: new Date(),
      completedAt: dto.status === "completed" ? new Date() : undefined,
    },
    include: { membership: true, fromPlan: true, toPlan: true, payment: true },
  });
  await auditUpdate(
    "membership_upgrade_review",
    id,
    { status: upgrade.status },
    { status: updated.status },
    ctx,
  );
  return formatMembershipUpgrade(updated);
}

export async function getMembershipReports() {
  const [
    campaigns,
    applicationsByStatus,
    membershipsByStatus,
    upgradesByStatus,
  ] = await Promise.all([
    prisma.membershipCampaign.count(),
    prisma.membershipApplication.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.membership.groupBy({
      by: ["membershipRecordStatus"],
      _count: { _all: true },
    }),
    prisma.membershipUpgrade.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return {
    campaigns,
    applicationsByStatus,
    membershipsByStatus,
    upgradesByStatus,
  };
}

export async function lookupClinicMembership(
  query: ClinicMembershipLookupQuery,
  _ctx: AuditContext,
) {
  await getActiveClinicOrThrow(query.clinicId);

  const qrToken = query.qrToken?.trim();
  const decodedQr = qrToken?.startsWith("membership:")
    ? qrToken.slice("membership:".length)
    : qrToken;

  const membership = await prisma.membership.findFirst({
    where: {
      OR: [
        ...(decodedQr
          ? [
              { membershipNumber: decodedQr },
              { cardNumber: decodedQr },
              {
                id: decodedQr.match(/^[0-9a-f-]{36}$/i) ? decodedQr : undefined,
              },
            ]
          : []),
        ...(query.membershipNumber
          ? [{ membershipNumber: query.membershipNumber }]
          : []),
        ...(query.cardNumber ? [{ cardNumber: query.cardNumber }] : []),
        ...(query.accountId ? [{ userId: query.accountId }] : []),
        ...(query.mobile
          ? [
              { application: { applicantMobile: query.mobile } },
              { user: { phone: query.mobile } },
            ]
          : []),
        ...(query.email
          ? [
              { application: { applicantEmail: query.email } },
              { user: { email: query.email } },
            ]
          : []),
      ].filter(Boolean) as Prisma.MembershipWhereInput[],
    },
    include: repo.membershipDetailInclude,
    orderBy: { createdAt: "desc" },
  });

  if (!membership) throw AppError.notFound("Membership");
  return buildClinicMembershipSummary(membership);
}

export async function getClinicMembership(
  membershipId: string,
  query: ClinicMembershipContextQuery,
  _ctx: AuditContext,
) {
  await getActiveClinicOrThrow(query.clinicId);
  const membership = await repo.getMembershipById(membershipId);
  if (!membership) throw AppError.notFound("Membership");
  return {
    ...buildClinicMembershipSummary(membership),
    linkedPetHistory: membership.coveredPets.map((pet) => ({
      id: pet.id,
      petId: pet.petId,
      petName: pet.pet.name,
      slotNumber: pet.slotNumber,
      status: pet.status,
      linkedAt: pet.linkedAt.toISOString(),
      coveredSince: pet.linkedAt.toISOString(),
      linkedAtClinicId: pet.linkedAtClinicId,
    })),
    serviceUsageHistory: membership.serviceUsages.map((usage) => ({
      id: usage.id,
      serviceDate: usage.serviceDate.toISOString(),
      serviceCode: usage.serviceCode,
      serviceName: usage.serviceName,
      clinicId: usage.clinicId,
      notes: usage.notes,
    })),
  };
}

export async function getClinicMembershipPets(
  membershipId: string,
  query: ClinicMembershipContextQuery,
  _ctx: AuditContext,
) {
  await getActiveClinicOrThrow(query.clinicId);
  const membership = await repo.getMembershipById(membershipId);
  if (!membership) throw AppError.notFound("Membership");
  assertMembershipActiveState(membership);
  const owner = await resolveMembershipOwner(membership);

  const activeCoveredPets = membership.coveredPets.filter(
    (pet) =>
      pet.status === MembershipCoveredPetStatus.ACTIVE ||
      pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
  );
  const remainingPetSlots = Math.max(
    0,
    (membership.maxCoveredPetsSnapshot ?? 0) - activeCoveredPets.length,
  );
  const replacementPendingCount = membership.coveredPets.filter(
    (pet) => pet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
  ).length;

  return {
    owner: {
      id: owner.id,
      userId: owner.userId,
      ownerName: owner.ownerName,
      mobile: owner.mobile,
      email: owner.email,
    },
    maxCoveredPets: membership.maxCoveredPetsSnapshot ?? 0,
    activeCoveredPetCount: activeCoveredPets.length,
    remainingPetSlots,
    upgradeRequired: remainingPetSlots === 0,
    replacementPendingCount,
    pets: owner.pets.map((pet) => {
      const covered = membership.coveredPets.find(
        (coveredPet) => coveredPet.petId === pet.id,
      );
      const isCovered = Boolean(
        covered &&
        (covered.status === MembershipCoveredPetStatus.ACTIVE ||
          covered.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING),
      );
      return {
        id: pet.id,
        name: pet.name,
        petType: pet.petType,
        gender: pet.gender,
        breed: pet.breed,
        color: pet.color,
        isCovered,
        coveredStatus: covered?.status ?? null,
        slotNumber: covered?.slotNumber ?? null,
        coveredSince: covered?.linkedAt.toISOString() ?? null,
        eligibleForMembership: pet.isActive,
        canBeLinkedNow:
          pet.isActive &&
          !isCovered &&
          remainingPetSlots > 0 &&
          replacementPendingCount === 0,
      };
    }),
  };
}

export async function createClinicPetForMembershipOwner(
  membershipId: string,
  dto: ClinicCreatePetDto,
  query: ClinicMembershipContextQuery,
  actorId: string,
  ctx: AuditContext,
) {
  await getActiveClinicOrThrow(query.clinicId);
  const membership = await repo.getMembershipById(membershipId);
  if (!membership) throw AppError.notFound("Membership");
  const owner = await resolveMembershipOwner(membership);

  const created = await prisma.pet.create({
    data: {
      ownerId: owner.id,
      name: dto.name,
      petType: mapPetType(dto.petType),
      gender: mapPetGender(dto.gender),
      approxAge: dto.approxAge,
      breed: dto.breed,
      color: dto.color,
      weightKg:
        dto.weightKg == null ? undefined : new Prisma.Decimal(dto.weightKg),
      photoId: dto.photoId,
      notes: dto.notes,
    },
    include: { owner: true },
  });
  await auditCreate(
    "clinic_membership_pet_create",
    created.id,
    { ownerId: owner.id, membershipId, actorId },
    ctx,
  );
  return created;
}

export async function linkClinicCoveredPet(
  membershipId: string,
  dto: ClinicLinkCoveredPetDto,
  query: ClinicMembershipContextQuery,
  actorId: string,
  ctx: AuditContext,
) {
  await getActiveClinicOrThrow(query.clinicId);

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        include: repo.membershipDetailInclude,
      });
      if (!membership) throw AppError.notFound("Membership");
      assertMembershipActiveState(membership);

      const owner = await resolveMembershipOwner(membership as never);
      const pet = owner.pets.find((item) => item.id === dto.petId) ?? null;
      if (!pet) {
        throw AppError.badRequest(
          "Pet does not belong to the membership owner",
          "MEMBERSHIP_PET_OWNER_MISMATCH",
        );
      }
      if (!pet.isActive) {
        throw AppError.badRequest(
          "Pet data is not valid for membership linking",
          "MEMBERSHIP_PET_INVALID",
        );
      }

      const duplicate = membership.coveredPets.find(
        (coveredPet) =>
          coveredPet.petId === dto.petId &&
          (coveredPet.status === MembershipCoveredPetStatus.ACTIVE ||
            coveredPet.status ===
              MembershipCoveredPetStatus.REPLACEMENT_PENDING),
      );
      if (duplicate) {
        throw AppError.conflict(
          "Pet is already actively linked to this membership",
        );
      }

      const replacementPendingCount = membership.coveredPets.filter(
        (coveredPet) =>
          coveredPet.status === MembershipCoveredPetStatus.REPLACEMENT_PENDING,
      ).length;
      if (replacementPendingCount > 0) {
        throw AppError.badRequest(
          "A replacement request is pending and must be resolved first",
          "MEMBERSHIP_REPLACEMENT_PENDING",
        );
      }

      const activeCoveredPets = membership.coveredPets.filter(
        (coveredPet) => coveredPet.status === MembershipCoveredPetStatus.ACTIVE,
      );
      if (
        activeCoveredPets.length >= (membership.maxCoveredPetsSnapshot ?? 0)
      ) {
        const payload = buildMembershipLimitPayload(
          membership as never,
          activeCoveredPets.length,
        );
        throw new AppError(409, payload.code, payload.message, [payload]);
      }

      const occupiedSlots = new Set(
        activeCoveredPets.map((coveredPet) => coveredPet.slotNumber),
      );
      let slotNumber = 1;
      while (occupiedSlots.has(slotNumber)) slotNumber += 1;

      const created = await tx.membershipCoveredPet.create({
        data: {
          membershipId,
          petId: dto.petId,
          slotNumber,
          status: MembershipCoveredPetStatus.ACTIVE,
          linkedAt: new Date(),
          linkedByStaffId: actorId,
          linkedAtClinicId: query.clinicId,
        },
        include: {
          pet: true,
          linkedAtClinic: true,
        },
      });

      return {
        membership,
        created,
        activeCoveredPetsCountBefore: activeCoveredPets.length,
      };
    },
    { timeout: 20000 },
  );

  await auditCreate(
    "membership_pet_link",
    result.created.id,
    {
      membershipId,
      petId: dto.petId,
      slotNumber: result.created.slotNumber,
      linkedByStaffId: actorId,
      clinicId: query.clinicId,
    },
    ctx,
  );

  return {
    id: result.created.id,
    membershipId,
    petId: dto.petId,
    slotNumber: result.created.slotNumber,
    status: result.created.status,
    linkedAt: result.created.linkedAt.toISOString(),
    currentPetCount: result.activeCoveredPetsCountBefore + 1,
    maxCoveredPets: result.membership.maxCoveredPetsSnapshot ?? 0,
  };
}

export async function createClinicServiceUsage(
  membershipId: string,
  dto: ClinicServiceUsageDto,
  actorId: string,
  ctx: AuditContext,
) {
  await getActiveClinicOrThrow(dto.clinicId);
  const membership = await repo.getMembershipById(membershipId);
  if (!membership) throw AppError.notFound("Membership");
  assertMembershipActiveState(membership);

  const coveredPet = membership.coveredPets.find(
    (pet) =>
      pet.petId === dto.petId &&
      pet.status === MembershipCoveredPetStatus.ACTIVE,
  );
  if (!coveredPet) {
    throw AppError.badRequest(
      "Selected pet is not an active covered pet",
      "MEMBERSHIP_PET_NOT_COVERED",
    );
  }

  const benefit = membership.membershipCampaign?.benefits.find(
    (item) =>
      item.id === dto.benefitId &&
      item.isActive &&
      item.plans.some((mapping) => mapping.planId === membership.planId),
  );
  if (!benefit) {
    throw AppError.badRequest(
      "Selected benefit is not available for this membership plan",
      "MEMBERSHIP_BENEFIT_NOT_AVAILABLE",
    );
  }

  if (
    roundPrice(dto.regularPrice - dto.discountAmount) !==
    roundPrice(dto.payableAmount)
  ) {
    throw AppError.badRequest(
      "Service pricing payload is invalid",
      "MEMBERSHIP_SERVICE_PRICING_INVALID",
    );
  }

  if (dto.doctorId) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: dto.doctorId },
    });
    if (!doctor || !doctor.isActive) {
      throw AppError.badRequest(
        "Doctor is not eligible for this service",
        "MEMBERSHIP_DOCTOR_INVALID",
      );
    }
  }

  const serviceDate = dto.serviceDate ? new Date(dto.serviceDate) : new Date();
  if (serviceDate.getTime() > Date.now() + 5 * 60 * 1000) {
    throw AppError.badRequest(
      "Service date is not valid",
      "MEMBERSHIP_SERVICE_DATE_INVALID",
    );
  }

  const created = await prisma.membershipServiceUsage.create({
    data: {
      membershipId,
      coveredPetId: coveredPet.id,
      petId: dto.petId,
      serviceDate,
      serviceCode: dto.serviceCode,
      serviceName: dto.serviceName,
      clinicId: dto.clinicId,
      status: MembershipServiceUsageStatus.completed,
      recordedByUserId: actorId,
      notes: JSON.stringify({
        benefitId: dto.benefitId,
        benefitTitleEn: benefit.titleEn,
        regularPrice: dto.regularPrice,
        discountAmount: dto.discountAmount,
        payableAmount: dto.payableAmount,
        doctorId: dto.doctorId ?? null,
        notes: dto.notes ?? null,
      }),
    },
  });

  await writeAuditLog(
    {
      action: AuditAction.create,
      resource: "membership_service_usage",
      resourceId: created.id,
      newValues: {
        membershipId,
        petId: dto.petId,
        clinicId: dto.clinicId,
        benefitId: dto.benefitId,
        serviceCode: dto.serviceCode,
        payableAmount: dto.payableAmount,
        actorId,
      },
    },
    ctx,
  );

  return created;
}

export async function syncAdminPlans(campaignId: string, _ctx: AuditContext) {
  const campaign = await prisma.membershipCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw AppError.notFound("Campaign");
  const tiers = await prisma.communityMembershipTier.findMany({
    where: { isActive: true },
  });
  const existingPlans = await prisma.membershipPlan.findMany({
    where: { campaignId },
  });
  const existingTierIds = new Set(existingPlans.map((p) => p.tierId));

  const created = [];
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (!existingTierIds.has(tier.id)) {
      const plan = await prisma.membershipPlan.create({
        data: {
          campaignId,
          tierId: tier.id,
          code: `${campaign.slug}-${tier.code || "tier-" + i}`,
          nameEn: `${campaign.titleEn} - ${tier.nameEn}`,
          nameBn: `${campaign.titleBn} - ${tier.nameBn}`,

          regularPrice: tier.regularPriceBdt,
          offerPrice: tier.launchPriceBdt,
          regularPriceSnapshot: null,
          campaignPrice: null,
          minPetsSnapshot: null,
          includedPetsSnapshot: null,
          maxPetsSnapshot: null,
          validityMonthsSnapshot: null,
          benefitsSnapshot: require("@prisma/client").Prisma.DbNull,
          tierVersion: tier.version,
          allowPriceIncrease: false,
          maxCoveredPets: tier.petLimitMax,
          validityYears: Math.floor(tier.validityMonths / 12),
          validityMonths: tier.validityMonths % 12,
          maximumReplacementCount: 0,
          replacementRequiresApproval: true,
          replacementFee: null,
          sortOrder: i,
          isActive: true,
        },
      });
      created.push(plan);
    }
  }
  return {
    syncedCount: created.length,
    totalPlans: existingPlans.length + created.length,
  };
}
