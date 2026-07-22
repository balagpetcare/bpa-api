import { z } from 'zod';
import { PetCensusStatus, PetGender, CampaignStatus } from '@prisma/client';

export const PET_CENSUS_SOURCE = 'PET_CENSUS_2026';

const bdMobile = z.string().regex(/^(\+8801|01)[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number');
const optionalString = (max: number) => z.string().trim().max(max).optional().or(z.literal('')).transform((v) => v || undefined);
const petTypeSchema = z.enum(['cat', 'dog', 'bird', 'rabbit', 'other']);
const vaccinationStatusSchema = z.enum(['up_to_date', 'due', 'not_vaccinated', 'unknown']);
const neuteredStatusSchema = z.enum(['yes', 'no', 'planned', 'unknown']);
const queryBoolean = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const rawSubmitCensusSchema = z.object({
  ownerName: z.string().min(2).max(120),
  mobile: bdMobile.optional(),
  ownerMobile: bdMobile.optional(),
  ownerEmail: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  division: optionalString(120),
  district: optionalString(120),
  cityUpazila: optionalString(120),
  ownerAddress: optionalString(500),
  address: optionalString(500),
  zoneId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  areaText: optionalString(255),
  area: optionalString(255),
  // Location tree FK fields (optional, saved alongside text fallback fields)
  divisionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  districtId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  upazilaId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  unionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityCorporationId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityZoneId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  wardId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  isBpaMember: z.coerce.boolean().optional(),
  petType: petTypeSchema,
  petName: optionalString(120),
  petGender: z.nativeEnum(PetGender).optional(),
  approxAge: optionalString(80),
  petCount: z.coerce.number().int().min(1).max(999),
  householdPetCount: z.coerce.number().int().min(1).max(999).optional(),
  breed: optionalString(120),
  vaccinationStatus: vaccinationStatusSchema.optional(),
  neuteredStatus: neuteredStatusSchema.optional(),
  healthIssue: optionalString(1000),
  photoMediaId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  photoUrl: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  petCountDog: z.coerce.number().int().min(0).max(999).optional(),
  petCountCat: z.coerce.number().int().min(0).max(999).optional(),
  petCountOther: z.coerce.number().int().min(0).max(999).optional(),
  petsJson: z.array(z.record(z.unknown())).optional(),
  vaccinationInterest: z.coerce.boolean().default(false),
  communityClinicInterest: z.coerce.boolean().default(false),
  communityPetShopInterest: z.coerce.boolean().default(false),
  carePartnerInterest: z.coerce.boolean().default(false),
  isVaccinationInterested: z.coerce.boolean().optional(),
  isClinicInterested: z.coerce.boolean().optional(),
  isPetShopInterested: z.coerce.boolean().optional(),
  isCarePartnerInterested: z.coerce.boolean().optional(),
  notes: optionalString(2000),
  consent: z.coerce.boolean().optional(),
  hasConsented: z.coerce.boolean().optional(),
  source: z.string().max(80).optional().default(PET_CENSUS_SOURCE),
  sourceRoute: z.string().max(80).optional(),
}).superRefine((data, ctx) => {
  if (!data.mobile && !data.ownerMobile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mobile'], message: 'Mobile is required' });
  }
  if (data.consent !== true && data.hasConsented !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent'], message: 'Consent is required' });
  }
});

export const submitCensusSchema = rawSubmitCensusSchema.transform((data) => {
  const petCountDog = data.petType === 'dog' ? data.petCount : (data.petCountDog ?? 0);
  const petCountCat = data.petType === 'cat' ? data.petCount : (data.petCountCat ?? 0);
  const petCountOther = data.petType === 'bird' || data.petType === 'rabbit' || data.petType === 'other'
    ? data.petCount
    : (data.petCountOther ?? 0);
  const normalizedAddress = data.address ?? data.ownerAddress;
  const normalizedArea = data.area ?? data.areaText ?? normalizedAddress;

  return {
    ownerName: data.ownerName,
    ownerMobile: data.mobile ?? data.ownerMobile!,
    ownerEmail: data.email ?? data.ownerEmail,
    division: data.division,
    district: data.district,
    cityUpazila: data.cityUpazila,
    ownerAddress: normalizedAddress,
    zoneId: data.zoneId,
    areaText: normalizedArea,
    divisionId: data.divisionId,
    districtId: data.districtId,
    upazilaId: data.upazilaId,
    unionId: data.unionId,
    cityCorporationId: data.cityCorporationId,
    cityZoneId: data.cityZoneId,
    wardId: data.wardId,
    isBpaMember: data.isBpaMember ?? false,
    petName: data.petName,
    petType: data.petType,
    petGender: data.petGender,
    approxAge: data.approxAge,
    petCount: data.petCount,
    householdPetCount: data.householdPetCount ?? data.petCount,
    breed: data.breed,
    vaccinationStatus: data.vaccinationStatus,
    neuteredStatus: data.neuteredStatus,
    healthIssue: data.healthIssue,
    photoMediaId: data.photoMediaId,
    photoUrl: data.photoUrl,
    petCountDog,
    petCountCat,
    petCountOther,
    petsJson: data.petsJson,
    isVaccinationInterested: data.isVaccinationInterested ?? data.vaccinationInterest,
    isClinicInterested: data.isClinicInterested ?? data.communityClinicInterest,
    isPetShopInterested: data.isPetShopInterested ?? data.communityPetShopInterest,
    isCarePartnerInterested: data.isCarePartnerInterested ?? data.carePartnerInterest,
    hasConsented: true,
    notes: data.notes,
    source: data.source || PET_CENSUS_SOURCE,
    sourceRoute: data.sourceRoute,
  };
});

export const updateCensusSchema = z.object({
  status: z.nativeEnum(PetCensusStatus).optional(),
  adminNote: z.string().max(3000).optional().or(z.literal('')).transform((v) => v || null).optional(),
});

export const censusListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(PetCensusStatus).optional(),
  zoneId: z.string().uuid().optional(),
  petType: petTypeSchema.optional(),
  // Text location filters (legacy — kept working)
  division: z.string().optional(),
  district: z.string().optional(),
  // Location tree FK ID filters (new, non-breaking)
  divisionId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  upazilaId: z.string().uuid().optional(),
  cityCorporationId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  memberStatus: queryBoolean.optional(),
  vaccinationStatus: vaccinationStatusSchema.optional(),
  area: z.string().optional(),
  vaccinationInterest: queryBoolean.optional(),
  communityClinicInterest: queryBoolean.optional(),
  communityPetShopInterest: queryBoolean.optional(),
  carePartnerInterest: queryBoolean.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});

export const publicStatusLookupSchema = z.object({
  mobile: bdMobile,
  petName: optionalString(120),
});

export type VaccinationStatus = z.infer<typeof vaccinationStatusSchema>;
export type NeuteredStatus = z.infer<typeof neuteredStatusSchema>;

export type SubmitCensusDto = z.infer<typeof submitCensusSchema>;
export type UpdateCensusDto = z.infer<typeof updateCensusSchema>;
export type CensusListQuery = z.infer<typeof censusListQuerySchema>;
export type PublicStatusLookupQuery = z.infer<typeof publicStatusLookupSchema>;

// ─── Campaign Settings ──────────────────────────────────────────

export const createCampaignSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.draft),
  registrationStartAt: z.coerce.date(),
  registrationEndAt: z.coerce.date(),
  countdownTargetAt: z.coerce.date().optional(),
  targetSubmissions: z.coerce.number().int().min(1).default(10000),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;

