import { z } from "zod";
import {
  MembershipCampaignStatus,
  MembershipMediaRole,
  MembershipApplicationStatus,
  MembershipRecordStatus,
  MembershipPetReplacementStatus,
  MembershipReplacementReason,
  MembershipUpgradeRecordStatus,
} from "@prisma/client";

const uuidSchema = z.string().uuid();
const optionalString = z.string().trim().optional().nullable();
const moneySchema = z.number().nonnegative().multipleOf(0.01);
const benefitSnapshotSchema = z
  .array(z.string().trim().min(1).max(200))
  .optional()
  .nullable();

export const membershipCampaignListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(MembershipCampaignStatus).optional(),
  search: z.string().trim().optional(),
});

export const membershipChildListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  campaignId: uuidSchema.optional(),
  search: z.string().trim().optional(),
});

const membershipCampaignSchemaBase = z.object({
  slug: z.string().trim().min(3).max(180),
  titleEn: z.string().trim().min(1).max(200),
  titleBn: z.string().trim().min(1).max(200),
  shortDescriptionEn: optionalString,
  shortDescriptionBn: optionalString,
  descriptionEn: optionalString,
  descriptionBn: optionalString,
  heroImageUrl: optionalString,
  mobileImageUrl: optionalString,
  thumbnailUrl: optionalString,
  status: z.nativeEnum(MembershipCampaignStatus).optional(),
  offerStartAt: z.string().datetime().optional().nullable(),
  offerEndAt: z.string().datetime().optional().nullable(),
  applicationStartAt: z.string().datetime().optional().nullable(),
  applicationEndAt: z.string().datetime().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  eligibilityContentEn: optionalString,
  eligibilityContentBn: optionalString,
  howItWorksContentEn: optionalString,
  howItWorksContentBn: optionalString,
  termsContentEn: optionalString,
  termsContentBn: optionalString,
  refundPolicyEn: optionalString,
  refundPolicyBn: optionalString,
  organizerNameEn: optionalString,
  organizerNameBn: optionalString,
  supportPhone: optionalString,
  supportEmail: z
    .string()
    .email()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  supportWhatsapp: optionalString,
  supportAddress: optionalString,
  notes: optionalString,
});

export const createMembershipCampaignSchema =
  membershipCampaignSchemaBase.superRefine((data, ctx) => {
    if (
      data.offerStartAt &&
      data.offerEndAt &&
      new Date(data.offerEndAt) <= new Date(data.offerStartAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Offer end must be after offer start",
        path: ["offerEndAt"],
      });
    }

    if (
      data.applicationStartAt &&
      data.applicationEndAt &&
      new Date(data.applicationEndAt) <= new Date(data.applicationStartAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Application end must be after application start",
        path: ["applicationEndAt"],
      });
    }
  });

export const updateMembershipCampaignSchema = membershipCampaignSchemaBase
  .partial()
  .superRefine((data, ctx) => {
    if (
      data.offerStartAt &&
      data.offerEndAt &&
      new Date(data.offerEndAt) <= new Date(data.offerStartAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Offer end must be after offer start",
        path: ["offerEndAt"],
      });
    }

    if (
      data.applicationStartAt &&
      data.applicationEndAt &&
      new Date(data.applicationEndAt) <= new Date(data.applicationStartAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Application end must be after application start",
        path: ["applicationEndAt"],
      });
    }
  });

const membershipPlanSchemaBase = z.object({
  campaignId: uuidSchema,
  tierId: uuidSchema,
  code: z.string().trim().min(1).max(60).optional(),
  nameEn: z.string().trim().min(1).max(140),
  nameBn: z.string().trim().min(1).max(140),
  regularPriceSnapshot: moneySchema.optional().nullable(),
  campaignPrice: moneySchema.optional().nullable(),
  minPetsSnapshot: z.number().int().nonnegative().optional().nullable(),
  includedPetsSnapshot: z.number().int().nonnegative().optional().nullable(),
  maxPetsSnapshot: z.number().int().nonnegative().optional().nullable(),
  validityMonthsSnapshot: z.number().int().positive().optional().nullable(),
  benefitsSnapshot: benefitSnapshotSchema,
  allowPriceIncrease: z.boolean().optional(),
  maximumReplacementCount: z.number().int().nonnegative().optional(),
  replacementRequiresApproval: z.boolean().optional(),
  replacementFee: moneySchema.optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  changeReason: optionalString,
  effectiveAt: z.string().datetime().optional().nullable(),
  existingMembersAffected: z.boolean().optional(),
});

export const createMembershipPlanSchema = membershipPlanSchemaBase.superRefine(
  (data, ctx) => {
    if (
      (data.minPetsSnapshot != null &&
        data.includedPetsSnapshot != null &&
        data.minPetsSnapshot > data.includedPetsSnapshot) ||
      (data.includedPetsSnapshot != null &&
        data.maxPetsSnapshot != null &&
        data.includedPetsSnapshot > data.maxPetsSnapshot)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pet limits must satisfy minPets <= includedPets <= maxPets",
        path: ["includedPetsSnapshot"],
      });
    }
    if (
      !data.allowPriceIncrease &&
      data.campaignPrice != null &&
      data.regularPriceSnapshot != null &&
      data.campaignPrice > data.regularPriceSnapshot
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Campaign price cannot exceed regular price unless explicitly allowed",
        path: ["campaignPrice"],
      });
    }
  },
);

export const updateMembershipPlanSchema = membershipPlanSchemaBase
  .partial()
  .omit({ campaignId: true })
  .superRefine((data, ctx) => {
    if (
      data.minPetsSnapshot != null &&
      data.includedPetsSnapshot != null &&
      data.maxPetsSnapshot != null &&
      (data.minPetsSnapshot > data.includedPetsSnapshot ||
        data.includedPetsSnapshot > data.maxPetsSnapshot)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pet limits must satisfy minPets <= includedPets <= maxPets",
        path: ["includedPetsSnapshot"],
      });
    }
    if (
      data.campaignPrice != null &&
      data.regularPriceSnapshot != null &&
      !data.allowPriceIncrease &&
      data.campaignPrice > data.regularPriceSnapshot
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Campaign price cannot exceed regular price unless explicitly allowed",
        path: ["campaignPrice"],
      });
    }
  });

export const createMembershipBenefitSchema = z.object({
  campaignId: uuidSchema,
  code: optionalString,
  titleEn: z.string().trim().min(1).max(200),
  titleBn: optionalString,
  descriptionEn: optionalString,
  descriptionBn: optionalString,
  icon: optionalString,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  planIds: z.array(uuidSchema).optional(),
});

export const updateMembershipBenefitSchema = createMembershipBenefitSchema
  .partial()
  .omit({ campaignId: true });

export const createMembershipMediaSchema = z.object({
  campaignId: uuidSchema,
  mediaFileId: uuidSchema,
  role: z.nativeEnum(MembershipMediaRole),
  titleEn: optionalString,
  titleBn: optionalString,
  altText: optionalString,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateMembershipMediaSchema = createMembershipMediaSchema
  .partial()
  .omit({ campaignId: true });

export const createMembershipDocumentSchema = z.object({
  campaignId: uuidSchema,
  mediaFileId: uuidSchema.optional().nullable(),
  documentType: z.string().trim().min(1).max(60),
  code: optionalString,
  titleEn: z.string().trim().min(1).max(200),
  titleBn: optionalString,
  descriptionEn: optionalString,
  descriptionBn: optionalString,
  fileUrl: optionalString,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateMembershipDocumentSchema = createMembershipDocumentSchema
  .partial()
  .omit({ campaignId: true });

export const createMembershipFaqSchema = z.object({
  campaignId: uuidSchema,
  questionEn: z.string().trim().min(1),
  questionBn: optionalString,
  answerEn: z.string().trim().min(1),
  answerBn: optionalString,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateMembershipFaqSchema = createMembershipFaqSchema
  .partial()
  .omit({ campaignId: true });

export const createMembershipApplicationSchema = z.object({
  campaignId: uuidSchema,
  planId: uuidSchema,
  applicantName: z.string().trim().min(1).max(120),
  applicantMobile: z.string().trim().min(5).max(20),
  applicantEmail: z
    .string()
    .email()
    .max(255)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  applicantAddress: optionalString,
  documentUrls: z.array(z.string().url()).optional(),
  notes: optionalString,
  expectedAmount: moneySchema.optional(),
});

export const updateMembershipApplicationSchema = z.object({
  planId: uuidSchema.optional(),
  applicantName: z.string().trim().min(1).max(120).optional(),
  applicantMobile: z.string().trim().min(5).max(20).optional(),
  applicantEmail: z
    .string()
    .email()
    .max(255)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  applicantAddress: optionalString,
  documentUrls: z.array(z.string().url()).optional(),
  notes: optionalString,
  expectedAmount: moneySchema.optional(),
});

export const submitMembershipApplicationSchema = z.object({
  expectedAmount: moneySchema.optional(),
});

export const createMembershipPaymentSchema = z.object({
  expectedAmount: moneySchema.optional(),
});

export const adminMembershipApplicationReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: optionalString,
});

export const adminMembershipActivationSchema = z.object({
  validFrom: z.string().date().optional(),
  activatedAt: z.string().datetime().optional(),
  reviewNotes: optionalString,
});

export const adminMembershipStatusSchema = z.object({
  status: z.nativeEnum(MembershipRecordStatus),
  notes: optionalString,
});

export const membershipApplicationListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(MembershipApplicationStatus).optional(),
  campaignId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  search: z.string().trim().optional(),
});

export const membershipListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(MembershipRecordStatus).optional(),
  campaignId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  search: z.string().trim().optional(),
});

export const membershipCoveredPetListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  membershipId: uuidSchema.optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const membershipServiceUsageListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  membershipId: uuidSchema.optional(),
  clinicId: uuidSchema.optional(),
  search: z.string().trim().optional(),
});

export const membershipReplacementReviewSchema = z.object({
  status: z.nativeEnum(MembershipPetReplacementStatus),
  reviewNotes: optionalString,
  newPetId: uuidSchema.optional().nullable(),
});

export const createMembershipReplacementSchema = z.object({
  coveredPetId: uuidSchema,
  reason: z.enum(["DECEASED", "PERMANENTLY_LOST"]),
  notes: optionalString,
  supportingDocumentUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export const approveMembershipReplacementSchema = z.object({
  reviewNotes: optionalString,
});

export const rejectMembershipReplacementSchema = z.object({
  reviewNotes: optionalString,
});

export const completeMembershipReplacementSchema = z.object({
  newPetId: uuidSchema,
  reviewNotes: optionalString,
});

export const membershipUpgradeCreateSchema = z.object({
  membershipId: uuidSchema,
  toPlanId: uuidSchema,
  expectedAmount: moneySchema.optional(),
});

export const membershipUpgradeCreateForMembershipSchema = z.object({
  toPlanId: uuidSchema,
});

export const membershipUpgradePaymentSchema = z.object({
  expectedAmount: moneySchema.optional(),
});

export const membershipUpgradeReviewSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
  reviewNotes: optionalString,
});

export const cancelMembershipSchema = z.object({
  reason: z.string().min(1).max(500),
  notes: z.string().max(1000).optional(),
});

export const membershipRenewalApplySchema = z.object({
  campaignId: uuidSchema,
  planId: uuidSchema,
});

export const membershipUpgradeListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(MembershipUpgradeRecordStatus).optional(),
  membershipId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
});

export const membershipReplacementListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(MembershipPetReplacementStatus).optional(),
  membershipId: uuidSchema.optional(),
  reason: z.nativeEnum(MembershipReplacementReason).optional(),
});

export const clinicMembershipLookupQuerySchema = z
  .object({
    clinicId: uuidSchema,
    qrToken: z.string().trim().optional(),
    membershipNumber: z.string().trim().optional(),
    cardNumber: z.string().trim().optional(),
    mobile: z.string().trim().optional(),
    email: z.string().trim().optional(),
    accountId: uuidSchema.optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.qrToken ||
        data.membershipNumber ||
        data.cardNumber ||
        data.mobile ||
        data.email ||
        data.accountId,
      ),
    {
      message: "At least one membership lookup identifier is required",
      path: ["qrToken"],
    },
  );

export const clinicMembershipContextQuerySchema = z.object({
  clinicId: uuidSchema,
});

export const clinicCreatePetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  petType: z.string().trim().min(1).max(40),
  gender: z.string().trim().min(1).max(20),
  approxAge: z.number().int().min(0).optional(),
  breed: z.string().trim().max(120).optional(),
  color: z.string().trim().max(80).optional(),
  weightKg: z.number().positive().optional(),
  photoId: uuidSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const clinicLinkCoveredPetSchema = z.object({
  petId: uuidSchema,
});

export const clinicServiceUsageSchema = z.object({
  clinicId: uuidSchema,
  petId: uuidSchema,
  benefitId: uuidSchema,
  serviceCode: z.string().trim().min(1).max(60),
  serviceName: z.string().trim().min(1).max(200),
  regularPrice: moneySchema,
  discountAmount: moneySchema,
  payableAmount: moneySchema,
  serviceDate: z.string().datetime().optional(),
  doctorId: uuidSchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type MembershipCampaignListQuery = z.infer<
  typeof membershipCampaignListQuerySchema
>;
export type MembershipChildListQuery = z.infer<
  typeof membershipChildListQuerySchema
>;
export type CreateMembershipCampaignDto = z.infer<
  typeof createMembershipCampaignSchema
>;
export type UpdateMembershipCampaignDto = z.infer<
  typeof updateMembershipCampaignSchema
>;
export type CreateMembershipPlanDto = z.infer<
  typeof createMembershipPlanSchema
>;
export type UpdateMembershipPlanDto = z.infer<
  typeof updateMembershipPlanSchema
>;
export type CreateMembershipBenefitDto = z.infer<
  typeof createMembershipBenefitSchema
>;
export type UpdateMembershipBenefitDto = z.infer<
  typeof updateMembershipBenefitSchema
>;
export type CreateMembershipMediaDto = z.infer<
  typeof createMembershipMediaSchema
>;
export type UpdateMembershipMediaDto = z.infer<
  typeof updateMembershipMediaSchema
>;
export type CreateMembershipDocumentDto = z.infer<
  typeof createMembershipDocumentSchema
>;
export type UpdateMembershipDocumentDto = z.infer<
  typeof updateMembershipDocumentSchema
>;
export type CreateMembershipFaqDto = z.infer<typeof createMembershipFaqSchema>;
export type UpdateMembershipFaqDto = z.infer<typeof updateMembershipFaqSchema>;
export type CreateMembershipApplicationDto = z.infer<
  typeof createMembershipApplicationSchema
>;
export type UpdateMembershipApplicationDto = z.infer<
  typeof updateMembershipApplicationSchema
>;
export type SubmitMembershipApplicationDto = z.infer<
  typeof submitMembershipApplicationSchema
>;
export type CreateMembershipPaymentDto = z.infer<
  typeof createMembershipPaymentSchema
>;
export type AdminMembershipApplicationReviewDto = z.infer<
  typeof adminMembershipApplicationReviewSchema
>;
export type AdminMembershipActivationDto = z.infer<
  typeof adminMembershipActivationSchema
>;
export type AdminMembershipStatusDto = z.infer<
  typeof adminMembershipStatusSchema
>;
export type MembershipApplicationListQuery = z.infer<
  typeof membershipApplicationListQuerySchema
>;
export type MembershipListQuery = z.infer<typeof membershipListQuerySchema>;
export type MembershipCoveredPetListQuery = z.infer<
  typeof membershipCoveredPetListQuerySchema
>;
export type MembershipServiceUsageListQuery = z.infer<
  typeof membershipServiceUsageListQuerySchema
>;
export type MembershipReplacementReviewDto = z.infer<
  typeof membershipReplacementReviewSchema
>;
export type MembershipUpgradeCreateDto = z.infer<
  typeof membershipUpgradeCreateSchema
>;
export type MembershipUpgradeCreateForMembershipDto = z.infer<
  typeof membershipUpgradeCreateForMembershipSchema
>;
export type MembershipUpgradePaymentDto = z.infer<
  typeof membershipUpgradePaymentSchema
>;
export type MembershipUpgradeReviewDto = z.infer<
  typeof membershipUpgradeReviewSchema
>;
export type CancelMembershipDto = z.infer<typeof cancelMembershipSchema>;
export type MembershipUpgradeListQuery = z.infer<
  typeof membershipUpgradeListQuerySchema
>;
export type MembershipReplacementListQuery = z.infer<
  typeof membershipReplacementListQuerySchema
>;
export type ClinicMembershipLookupQuery = z.infer<
  typeof clinicMembershipLookupQuerySchema
>;
export type ClinicMembershipContextQuery = z.infer<
  typeof clinicMembershipContextQuerySchema
>;
export type ClinicCreatePetDto = z.infer<typeof clinicCreatePetSchema>;
export type ClinicLinkCoveredPetDto = z.infer<
  typeof clinicLinkCoveredPetSchema
>;
export type ClinicServiceUsageDto = z.infer<typeof clinicServiceUsageSchema>;
export type CreateMembershipReplacementDto = z.infer<
  typeof createMembershipReplacementSchema
>;
export type ApproveMembershipReplacementDto = z.infer<
  typeof approveMembershipReplacementSchema
>;
export type RejectMembershipReplacementDto = z.infer<
  typeof rejectMembershipReplacementSchema
>;
export type CompleteMembershipReplacementDto = z.infer<
  typeof completeMembershipReplacementSchema
>;
export type MembershipRenewalApplyDto = z.infer<
  typeof membershipRenewalApplySchema
>;
