import { z } from 'zod';
import { MembershipTierSlug, MembershipDiscountType, CommunityServiceCategory, PriceAfterOffer } from '@prisma/client';

// ─── Program Settings ────────────────────────────────────────────

export const updateProgramSchema = z.object({
  nameEn: z.string().max(200).optional(),
  nameBn: z.string().max(200).optional(),
  descriptionEn: z.string().optional(),
  descriptionBn: z.string().optional(),
  offerStartAt: z.string().datetime().nullable().optional(),
  offerEndAt: z.string().datetime().nullable().optional(),
  priceAfterOffer: z.nativeEnum(PriceAfterOffer).optional(),
  offerBannerEn: z.string().max(300).nullable().optional(),
  offerBannerBn: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── Tiers ───────────────────────────────────────────────────────

const tierSchemaBase = z.object({
  code: z.string().min(1).max(60).optional(),
  nameEn: z.string().min(1).max(120),
  nameBn: z.string().min(1).max(120),
  slug: z.nativeEnum(MembershipTierSlug),
  launchPriceBdt: z.number().min(0),
  regularPriceBdt: z.number().min(0),
  petLimitMin: z.number().int().positive(),
  includedPets: z.number().int().positive(),
  petLimitMax: z.number().int().positive(),
  validityMonths: z.number().int().positive(),
  badgeTextEn: z.string().max(60).nullable().optional(),
  badgeTextBn: z.string().max(60).nullable().optional(),
  shortDescEn: z.string().nullable().optional(),
  shortDescBn: z.string().nullable().optional(),
  fullDescEn: z.string().nullable().optional(),
  fullDescBn: z.string().nullable().optional(),
  cardTheme: z.string().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createTierSchema = tierSchemaBase.superRefine((data, ctx) => {
  if (data.petLimitMin > data.includedPets || data.includedPets > data.petLimitMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pet limits must satisfy min <= included <= max',
      path: ['includedPets'],
    });
  }
});

export const updateTierSchema = tierSchemaBase.partial().superRefine((data, ctx) => {
  if (
    data.petLimitMin !== undefined &&
    data.includedPets !== undefined &&
    data.petLimitMax !== undefined &&
    (data.petLimitMin > data.includedPets || data.includedPets > data.petLimitMax)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pet limits must satisfy min <= included <= max',
      path: ['includedPets'],
    });
  }
});

export const tierListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});

// ─── Services ────────────────────────────────────────────────────

export const createServiceSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameBn: z.string().min(1).max(200),
  category: z.nativeEnum(CommunityServiceCategory),
  basePriceBdt: z.number().min(0),
  descriptionEn: z.string().nullable().optional(),
  descriptionBn: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateServiceSchema = createServiceSchema.partial();

// ─── Discounts ───────────────────────────────────────────────────

export const createDiscountSchema = z.object({
  tierId: z.string().uuid(),
  serviceId: z.string().uuid(),
  discountType: z.nativeEnum(MembershipDiscountType),
  discountValue: z.number().positive(),
  minDiscount: z.number().min(0).nullable().optional(),
  maxDiscount: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateDiscountSchema = createDiscountSchema.partial();

// ─── Benefits ────────────────────────────────────────────────────

export const createBenefitSchema = z.object({
  titleEn: z.string().min(1).max(200),
  titleBn: z.string().min(1).max(200),
  descriptionEn: z.string().nullable().optional(),
  descriptionBn: z.string().nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  tierIds: z.array(z.string().uuid()).optional(),
});

export const updateBenefitSchema = createBenefitSchema.partial();

// ─── Purchase ────────────────────────────────────────────────────

export const initiatePurchaseSchema = z.object({
  tierSlug: z.nativeEnum(MembershipTierSlug),
  memberName: z.string().min(1).max(120),
  memberMobile: z.string().min(5).max(20),
  memberEmail: z.string().email().max(255).optional().or(z.literal('')),
  memberAddress: z.string().max(500).optional().or(z.literal('')),
  // Location tree FK fields (optional; memberAddress text kept for fallback)
  divisionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  districtId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  upazilaId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  unionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityCorporationId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityZoneId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  wardId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  petCount: z.number().int().min(1).max(50).optional(),
  preferredZoneId: z.string().uuid().optional(),
});

// Zone is required for public purchases — every member vote counts
export const initiatePublicPurchaseSchema = initiatePurchaseSchema.extend({
  preferredZoneId: z.string().uuid('Please select your preferred clinic zone'),
});

export const purchaseListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.string().optional(),
  tierId: z.string().uuid().optional(),
  search: z.string().optional(),
});

// ─── Membership Lookup ───────────────────────────────────────────

export const lookupMembershipSchema = z.union([
  z.object({
    token: z.string().length(64).regex(/^[0-9a-f]+$/),
  }),
  z.object({
    cardNumber: z.string().min(1).max(30),
    mobile: z.string().min(5).max(20),
  }),
]);

const MFS_PROVIDER = z.enum(['bkash', 'nagad', 'rocket'], {
  errorMap: () => ({ message: 'Provider must be one of: bkash, nagad, rocket' }),
});
const TRANSACTION_ID = z.string()
  .min(6, 'Transaction ID must be at least 6 characters')
  .max(100, 'Transaction ID is too long')
  .regex(/^[A-Za-z0-9\-_]+$/, 'Transaction ID contains invalid characters');

export const submitUpgradeTransactionSchema = z.object({
  upgradeId: z.string().uuid(),
  provider: MFS_PROVIDER,
  transactionId: TRANSACTION_ID,
});

export const submitPurchaseTransactionSchema = z.object({
  purchaseId: z.string().uuid(),
  provider: MFS_PROVIDER,
  transactionId: TRANSACTION_ID,
});

export type LookupMembershipDto = z.infer<typeof lookupMembershipSchema>;
export type SubmitUpgradeTransactionDto = z.infer<typeof submitUpgradeTransactionSchema>;
export type SubmitPurchaseTransactionDto = z.infer<typeof submitPurchaseTransactionSchema>;

// ─── Upgrade ─────────────────────────────────────────────────────

export const upgradeQuoteSchema = z.object({
  purchaseId: z.string().uuid(),
  toTierSlug: z.nativeEnum(MembershipTierSlug),
});

export const upgradeRequestSchema = z.object({
  purchaseId: z.string().uuid(),
  toTierSlug: z.nativeEnum(MembershipTierSlug),
});

export const upgradeListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.string().optional(),
});

// ─── Documents ───────────────────────────────────────────────────

export const createDocumentSchema = z.object({
  documentType: z.string().min(1).max(60),
  titleEn: z.string().min(1).max(200),
  titleBn: z.string().min(1).max(200),
  contentEn: z.string().nullable().optional(),
  contentBn: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

// ─── Card Verification ───────────────────────────────────────────

export const verifyCardQuerySchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-f]+$/),
});

// ─── Types ───────────────────────────────────────────────────────

export type UpdateProgramDto = z.infer<typeof updateProgramSchema>;
export type CreateTierDto = z.infer<typeof createTierSchema>;
export type UpdateTierDto = z.infer<typeof updateTierSchema>;
export type TierListQuery = z.infer<typeof tierListQuerySchema>;
export type CreateServiceDto = z.infer<typeof createServiceSchema>;
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;
export type CreateDiscountDto = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountDto = z.infer<typeof updateDiscountSchema>;
export type CreateBenefitDto = z.infer<typeof createBenefitSchema>;
export type UpdateBenefitDto = z.infer<typeof updateBenefitSchema>;
export type InitiatePurchaseDto = z.infer<typeof initiatePurchaseSchema>;
export type InitiatePublicPurchaseDto = z.infer<typeof initiatePublicPurchaseSchema>;
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;
export type UpgradeQuoteDto = z.infer<typeof upgradeQuoteSchema>;
export type UpgradeRequestDto = z.infer<typeof upgradeRequestSchema>;
export type UpgradeListQuery = z.infer<typeof upgradeListQuerySchema>;
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;
export type VerifyCardQuery = z.infer<typeof verifyCardQuerySchema>;
