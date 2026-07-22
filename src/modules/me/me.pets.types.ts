import { z } from 'zod';

const dateLike = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  }, 'Invalid date');

const optionalDateLike = z.union([dateLike, z.null()]).optional();

const boolLike = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return value;
}, z.boolean());

const optionalBoolLike = boolLike.optional();

const positiveIntLike = z.coerce.number().int().positive();

const nullableTrimmedString = (max: number) => z.string().trim().max(max).optional().nullable();

const documentCategorySchema = z.enum([
  'PROFILE_IMAGE',
  'VACCINATION_CARD',
  'VACCINE_CERTIFICATE',
  'PRESCRIPTION',
  'LAB_REPORT',
  'XRAY',
  'ULTRASOUND',
  'SURGERY_DOCUMENT',
  'DISCHARGE_SUMMARY',
  'MEDICAL_OTHER',
]);

export const petIdParamsSchema = z.object({
  petId: z.string().trim().regex(/^\d+$/, 'petId must be a numeric Furtail pet id'),
});

export const vaccinationParamsSchema = petIdParamsSchema.extend({
  vaccinationId: z.string().trim().regex(/^\d+$/, 'vaccinationId must be numeric'),
});

export const medicalHistoryParamsSchema = petIdParamsSchema.extend({
  recordId: z.string().trim().regex(/^\d+$/, 'recordId must be numeric'),
});

export const dewormingParamsSchema = petIdParamsSchema.extend({
  recordId: z.string().trim().regex(/^\d+$/, 'recordId must be numeric'),
});

export const weightParamsSchema = petIdParamsSchema.extend({
  recordId: z.string().trim().regex(/^\d+$/, 'recordId must be numeric'),
});

export const documentParamsSchema = petIdParamsSchema.extend({
  documentId: z.string().trim().regex(/^\d+$/, 'documentId must be numeric'),
});

export const createMyPetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  petType: z.string().trim().min(1).max(120).optional(),
  species: z.string().trim().min(1).max(120).optional(),
  breed: nullableTrimmedString(256),
  mixedBreed: optionalBoolLike,
  isMixedBreed: optionalBoolLike,
  gender: z.string().trim().max(20).optional(),
  sex: z.string().trim().max(20).optional(),
  approxAge: z.coerce.number().int().min(0).optional(),
  dateOfBirth: optionalDateLike,
  estimatedDateOfBirth: optionalBoolLike,
  isDateOfBirthEstimated: optionalBoolLike,
  color: nullableTrimmedString(128),
  colour: nullableTrimmedString(128),
  microchipNumber: nullableTrimmedString(120),
  registrationNumber: nullableTrimmedString(120),
  distinguishingMarks: nullableTrimmedString(2000),
  ownershipSource: nullableTrimmedString(200),
  ownershipStartDate: optionalDateLike,
  isNeuteredOrSpayed: optionalBoolLike,
  isNeutered: optionalBoolLike,
  allergies: z.union([z.array(z.string().trim().min(1).max(200)), z.string().trim().max(4000)]).optional(),
  chronicConditions: nullableTrimmedString(4000),
  healthDisorders: nullableTrimmedString(4000),
  currentMedications: nullableTrimmedString(4000),
  previousSurgeries: nullableTrimmedString(4000),
  disability: nullableTrimmedString(2000),
  specialCareNotes: nullableTrimmedString(4000),
  previousVaccineReaction: optionalBoolLike,
  generalMedicalNotes: nullableTrimmedString(4000),
  medicalSummary: nullableTrimmedString(4000),
  notes: nullableTrimmedString(4000),
  healthCard: z.record(z.string(), z.unknown()).optional().nullable(),
  identityDetails: z.record(z.string(), z.unknown()).optional().nullable(),
  weightKg: z.coerce.number().positive().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
  historicalVaccinations: z.array(
    z.object({
      vaccineTypeId: positiveIntLike.optional(),
      vaccineName: z.string().trim().min(1).max(120).optional(),
      administeredAt: optionalDateLike,
      nextDueDate: optionalDateLike,
      batchNumber: nullableTrimmedString(120),
      manufacturer: nullableTrimmedString(128),
      vetClinic: nullableTrimmedString(200),
      notes: nullableTrimmedString(2000),
      idempotencyKey: z.string().trim().max(128).optional().nullable(),
    }).refine((item) => !!item.vaccineTypeId || !!item.vaccineName, {
      message: 'Each historical vaccination requires vaccineTypeId or vaccineName',
    }),
  ).optional(),
});

export const updateMyPetSchema = createMyPetSchema.partial();

export const createPetVaccinationSchema = z.object({
  vaccineTypeId: positiveIntLike.optional(),
  vaccineName: z.string().trim().min(1).max(120).optional(),
  administeredAt: optionalDateLike,
  nextDueDate: optionalDateLike,
  batchNumber: nullableTrimmedString(120),
  manufacturer: nullableTrimmedString(128),
  vetClinic: nullableTrimmedString(200),
  notes: nullableTrimmedString(2000),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
}).refine((item) => !!item.vaccineTypeId || !!item.vaccineName, {
  message: 'vaccineTypeId or vaccineName is required',
});

export const updatePetVaccinationSchema = z.object({
  vaccineTypeId: positiveIntLike.optional(),
  vaccineName: z.string().trim().min(1).max(120).optional(),
  administeredAt: optionalDateLike,
  nextDueDate: optionalDateLike,
  batchNumber: nullableTrimmedString(120),
  manufacturer: nullableTrimmedString(128),
  vetClinic: nullableTrimmedString(200),
  notes: nullableTrimmedString(2000),
});

export const createMedicalHistoryRecordSchema = z.object({
  condition: z.string().trim().min(1).max(200),
  treatment: nullableTrimmedString(4000),
  doctorName: nullableTrimmedString(200),
  clinicName: nullableTrimmedString(200),
  visitDate: optionalDateLike,
  followUpDate: optionalDateLike,
});

export const updateMedicalHistoryRecordSchema = createMedicalHistoryRecordSchema.partial();

export const createDewormingRecordSchema = z.object({
  medicationName: z.string().trim().min(1).max(200),
  dosage: nullableTrimmedString(200),
  weightAtTime: z.coerce.number().positive().max(500).optional().nullable(),
  administeredAt: optionalDateLike,
  nextDueDate: optionalDateLike,
  notes: nullableTrimmedString(2000),
});

export const updateDewormingRecordSchema = createDewormingRecordSchema.partial();

export const createWeightRecordSchema = z.object({
  weightKg: z.coerce.number().positive().max(500),
  notes: nullableTrimmedString(1000),
  recordedAt: optionalDateLike,
});

export const updateWeightRecordSchema = createWeightRecordSchema.partial();

export const createPetDocumentMetadataSchema = z.object({
  category: documentCategorySchema,
  title: z.string().trim().min(1).max(200).optional(),
  documentDate: optionalDateLike,
  notes: nullableTrimmedString(2000),
});

export const updatePetDocumentMetadataSchema = z.object({
  category: documentCategorySchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  documentDate: optionalDateLike,
  notes: nullableTrimmedString(2000),
});

export type CreateMyPetDto = z.infer<typeof createMyPetSchema>;
export type UpdateMyPetDto = z.infer<typeof updateMyPetSchema>;
export type CreatePetVaccinationDto = z.infer<typeof createPetVaccinationSchema>;
export type UpdatePetVaccinationDto = z.infer<typeof updatePetVaccinationSchema>;
export type CreateMedicalHistoryRecordDto = z.infer<typeof createMedicalHistoryRecordSchema>;
export type UpdateMedicalHistoryRecordDto = z.infer<typeof updateMedicalHistoryRecordSchema>;
export type CreateDewormingRecordDto = z.infer<typeof createDewormingRecordSchema>;
export type UpdateDewormingRecordDto = z.infer<typeof updateDewormingRecordSchema>;
export type CreateWeightRecordDto = z.infer<typeof createWeightRecordSchema>;
export type UpdateWeightRecordDto = z.infer<typeof updateWeightRecordSchema>;
export type CreatePetDocumentMetadataDto = z.infer<typeof createPetDocumentMetadataSchema>;
export type UpdatePetDocumentMetadataDto = z.infer<typeof updatePetDocumentMetadataSchema>;

export interface MePetVaccinationHistoryItem {
  id: string;
  vaccineTypeId: number | null;
  vaccineName: string;
  administeredAt: string;
  nextDueDate: string | null;
  status?: string | null;
  verificationState?: string | null;
  batchNumber?: string | null;
  manufacturer?: string | null;
  vetClinic?: string | null;
  notes?: string | null;
}

export interface MePetMedicalHistoryItem {
  id: string;
  condition: string;
  treatment: string | null;
  doctorName: string | null;
  clinicName: string | null;
  visitDate: string;
  followUpDate: string | null;
  createdAt: string;
}

export interface MePetDewormingItem {
  id: string;
  medicationName: string;
  dosage: string | null;
  weightAtTime: number | null;
  administeredAt: string;
  nextDueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MePetWeightItem {
  id: string;
  weightKg: number;
  notes: string | null;
  recordedAt: string;
  createdAt: string;
}

export interface MePetDocumentItem {
  id: string;
  petId: string;
  category: z.infer<typeof documentCategorySchema>;
  title: string | null;
  url: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  documentDate: string | null;
  notes: string | null;
  uploadedBy: {
    id: string | null;
    displayName: string | null;
    username: string | null;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MePetItem {
  id: string;
  furtailPetId: number;
  uniquePetId?: string | null;
  name: string;
  petType: string;
  species?: string | null;
  breed: string | null;
  mixedBreed?: boolean | null;
  gender: string;
  approxAge: number | null;
  dateOfBirth?: string | null;
  isDateOfBirthEstimated?: boolean | null;
  isActive: boolean;
  color?: string | null;
  profileImageUrl?: string | null;
  latestWeightKg?: number | null;
  microchipNumber?: string | null;
  registrationNumber?: string | null;
  distinguishingMarks?: string | null;
  ownershipSource?: string | null;
  ownershipStartDate?: string | null;
  isNeuteredOrSpayed?: boolean | null;
  allergies?: string[];
  chronicConditions?: string | null;
  currentMedications?: string | null;
  previousSurgeries?: string | null;
  disability?: string | null;
  specialCareNotes?: string | null;
  previousVaccineReaction?: boolean | null;
  medicalSummary?: string | null;
  vaccinationSummary?: string | null;
  slug?: string | null;
  isPublicProfileVisible?: boolean | null;
  followerCount?: number | null;
  likeCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  healthCard?: Record<string, unknown>;
  identityDetails?: Record<string, unknown>;
  vaccinationHistory: MePetVaccinationHistoryItem[];
}

export interface MePetDetailResponse {
  pet: MePetItem;
  profile: {
    allergies: string[];
    bloodType: string | null;
    foodHabits: string | null;
    healthDisorders: string | null;
    notes: string | null;
    healthCard: Record<string, unknown>;
    identityDetails: Record<string, unknown>;
  };
  vaccinations: MePetVaccinationHistoryItem[];
  medicalHistory: MePetMedicalHistoryItem[];
  dewormingHistory: MePetDewormingItem[];
  weightHistory: MePetWeightItem[];
  documents: MePetDocumentItem[];
}
