import { AppError } from '../../utils/AppError';
import {
  createFurtailPet,
  createFurtailPetDocument,
  createFurtailPetDewormingRecord,
  createFurtailPetMedicalHistoryRecord,
  createFurtailPetVaccination,
  createFurtailPetWeightRecord,
  deleteFurtailPet,
  deleteFurtailPetDocument,
  deleteFurtailPetDewormingRecord,
  deleteFurtailPetMedicalHistoryRecord,
  deleteFurtailPetVaccination,
  deleteFurtailPetWeightRecord,
  getFurtailPet,
  getFurtailPetDocument,
  getFurtailPetDewormingRecord,
  getFurtailPetMedicalHistory,
  getFurtailPetMedicalHistoryRecord,
  getFurtailPetVaccination,
  getFurtailPetWeightRecord,
  listFurtailPetDocuments,
  listFurtailPetDewormingRecords,
  listFurtailPetMedicalHistoryRecords,
  listFurtailPets,
  listFurtailPetVaccinations,
  listFurtailPetWeightRecords,
  updateFurtailPet,
  updateFurtailPetDocument,
  updateFurtailPetDewormingRecord,
  updateFurtailPetMedicalHistoryRecord,
  updateFurtailPetVaccination,
  updateFurtailPetWeightRecord,
  uploadFurtailMedia,
  type FurtailForwardHeaders,
} from './furtail-pets.client';
import type {
  CreateDewormingRecordDto,
  CreateMedicalHistoryRecordDto,
  CreateMyPetDto,
  CreatePetDocumentMetadataDto,
  CreatePetVaccinationDto,
  CreateWeightRecordDto,
  MePetDetailResponse,
  MePetDocumentItem,
  MePetDewormingItem,
  MePetItem,
  MePetMedicalHistoryItem,
  MePetVaccinationHistoryItem,
  MePetWeightItem,
  UpdateDewormingRecordDto,
  UpdateMedicalHistoryRecordDto,
  UpdateMyPetDto,
  UpdatePetDocumentMetadataDto,
  UpdatePetVaccinationDto,
  UpdateWeightRecordDto,
} from './me.pets.types';

type AuthUserContext = {
  sub: string;
  email?: string | null;
  token?: string;
  idempotencyKey?: string;
  requestId?: string;
};

type ForwardableContext = {
  token?: string;
  requestId?: string;
  idempotencyKey?: string;
};

function assertFurtailToken(token?: string): string {
  if (!token) throw AppError.unauthorized('No token provided for Furtail integration');
  return token;
}

function titleCasePetType(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Other';
}

function approxAgeToDateOfBirth(age?: number): string | undefined {
  if (age === undefined || age === null) return undefined;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, 0, 1)).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function summarizeMedical(pet: any): string | null {
  const parts = [
    typeof pet?.healthDisorders === 'string' ? pet.healthDisorders.trim() : '',
    typeof pet?.notes === 'string' ? pet.notes.trim() : '',
  ].filter((value) => value.length > 0);
  return parts.length === 0 ? null : parts.join(' | ');
}

function summarizeVaccination(pet: any): string | null {
  const summary = pet?.vaccinationSummary;
  if (!summary || typeof summary !== 'object') return null;
  const total = Number(summary.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const nextDue = toIsoOrNull(summary.nextDueDate);
  return nextDue ? `${total} vaccination record(s) | next due ${nextDue.split('T')[0]}` : `${total} vaccination record(s)`;
}

function extractHealthCardValue(card: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(card, key) ? card[key] : null;
}

function mapVaccinationHistoryItem(item: any): MePetVaccinationHistoryItem {
  return {
    id: String(item.id),
    vaccineTypeId: item.vaccineTypeId ?? null,
    vaccineName: item.vaccineName ?? item?.vaccineType?.name ?? 'Vaccination',
    administeredAt: toIsoOrNull(item.administeredAt) || new Date(0).toISOString(),
    nextDueDate: toIsoOrNull(item.nextDueDate),
    status: item.status ?? null,
    verificationState: item.verificationState ?? null,
    batchNumber: item.batchNumber ?? null,
    manufacturer: item.manufacturer ?? null,
    vetClinic: item.vetClinic ?? null,
    notes: item.notes ?? null,
  };
}

function mapMedicalHistoryItem(item: any): MePetMedicalHistoryItem {
  return {
    id: String(item.id),
    condition: item.condition,
    treatment: item.treatment ?? null,
    doctorName: item.doctorName ?? null,
    clinicName: item.clinicName ?? null,
    visitDate: toIsoOrNull(item.visitDate) || new Date(0).toISOString(),
    followUpDate: toIsoOrNull(item.followUpDate),
    createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
  };
}

function mapDewormingItem(item: any): MePetDewormingItem {
  return {
    id: String(item.id),
    medicationName: item.medicationName,
    dosage: item.dosage ?? null,
    weightAtTime: typeof item.weightAtTime === 'number' ? item.weightAtTime : item.weightAtTime ?? null,
    administeredAt: toIsoOrNull(item.administeredAt) || new Date(0).toISOString(),
    nextDueDate: toIsoOrNull(item.nextDueDate),
    notes: item.notes ?? null,
    createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
  };
}

function mapWeightItem(item: any): MePetWeightItem {
  return {
    id: String(item.id),
    weightKg: Number(item.weightKg),
    notes: item.notes ?? null,
    recordedAt: toIsoOrNull(item.recordedAt) || new Date(0).toISOString(),
    createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
  };
}

function mapPetDocumentItem(item: any): MePetDocumentItem {
  return {
    id: String(item.id),
    petId: String(item.petId),
    category: item.category,
    title: item.title ?? null,
    url: item.url ?? item.fileUrl ?? item.media?.url ?? null,
    storageKey: item.storageKey ?? item.fileKey ?? item.media?.key ?? null,
    mimeType: item.mimeType ?? item.media?.mimeType ?? null,
    sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : item.media?.sizeBytes ?? null,
    documentDate: toIsoOrNull(item.documentDate),
    notes: item.notes ?? null,
    uploadedBy: item.uploadedBy
      ? {
          id: item.uploadedBy.id !== undefined && item.uploadedBy.id !== null ? String(item.uploadedBy.id) : null,
          displayName: item.uploadedBy.displayName ?? item.uploadedBy.profile?.displayName ?? null,
          username: item.uploadedBy.username ?? item.uploadedBy.profile?.username ?? null,
        }
      : null,
    createdAt: toIsoOrNull(item.createdAt),
    updatedAt: toIsoOrNull(item.updatedAt),
  };
}

function mapFurtailPetToMePetItem(pet: any): MePetItem {
  const healthCard = pet?.healthCard && typeof pet.healthCard === 'object' ? pet.healthCard : {};
  const identityDetails = pet?.identityDetails && typeof pet.identityDetails === 'object' ? pet.identityDetails : {};
  const petTypeName = String(
    pet?.animalType?.name ||
      pet?.animalTypeNameSnapshot ||
      pet?.petType ||
      pet?.species ||
      'other',
  ).toLowerCase();

  return {
    id: String(pet.id),
    furtailPetId: Number(pet.id),
    uniquePetId: pet.uniquePetId ?? null,
    name: pet.name,
    petType: petTypeName,
    species: petTypeName,
    breed: pet?.breed?.name || pet?.breedNameSnapshot || pet?.customBreedText || null,
    mixedBreed: pet?.isMixedBreed ?? null,
    gender: String(pet.sex || pet.gender || 'UNKNOWN').toLowerCase(),
    approxAge: pet.approxAgeYears ?? null,
    dateOfBirth: toIsoOrNull(pet.dateOfBirth),
    isDateOfBirthEstimated: typeof pet?.isDateOfBirthEstimated === 'boolean' ? pet.isDateOfBirthEstimated : null,
    isActive: pet?.deleted === true ? false : true,
    color: pet?.color?.name || pet?.colorNameSnapshot || pet?.customColorText || null,
    profileImageUrl: pet?.profilePic?.url ?? pet?.profileImageUrl ?? null,
    latestWeightKg: pet.latestWeightKg ?? null,
    microchipNumber: pet.microchipNumber ?? null,
    registrationNumber: typeof identityDetails.registrationNumber === 'string' ? identityDetails.registrationNumber : null,
    distinguishingMarks: typeof identityDetails.distinguishingMarks === 'string' ? identityDetails.distinguishingMarks : null,
    ownershipSource: typeof identityDetails.ownershipSource === 'string' ? identityDetails.ownershipSource : null,
    ownershipStartDate: toIsoOrNull(identityDetails.ownershipStartDate),
    isNeuteredOrSpayed: typeof pet?.isNeutered === 'boolean' ? pet.isNeutered : null,
    allergies: normalizeStringArray(pet.allergies),
    chronicConditions: pet.healthDisorders ?? null,
    currentMedications: typeof extractHealthCardValue(healthCard, 'currentMedications') === 'string'
      ? String(extractHealthCardValue(healthCard, 'currentMedications'))
      : null,
    previousSurgeries: typeof extractHealthCardValue(healthCard, 'previousSurgeries') === 'string'
      ? String(extractHealthCardValue(healthCard, 'previousSurgeries'))
      : null,
    disability: typeof extractHealthCardValue(healthCard, 'disability') === 'string'
      ? String(extractHealthCardValue(healthCard, 'disability'))
      : null,
    specialCareNotes: typeof extractHealthCardValue(healthCard, 'specialCareNotes') === 'string'
      ? String(extractHealthCardValue(healthCard, 'specialCareNotes'))
      : null,
    previousVaccineReaction: typeof extractHealthCardValue(healthCard, 'previousVaccineReaction') === 'boolean'
      ? Boolean(extractHealthCardValue(healthCard, 'previousVaccineReaction'))
      : null,
    medicalSummary: summarizeMedical(pet),
    vaccinationSummary: summarizeVaccination(pet),
    slug: pet.slug ?? null,
    isPublicProfileVisible: pet?.publicProfile?.isPublicProfileEnabled ?? null,
    followerCount: pet?.publicProfile?.followersCount ?? null,
    likeCount: pet?.publicProfile?.likesCount ?? null,
    createdAt: toIsoOrNull(pet.createdAt),
    updatedAt: toIsoOrNull(pet.updatedAt),
    healthCard,
    identityDetails,
    vaccinationHistory: Array.isArray(pet.vaccinationHistory) ? pet.vaccinationHistory.map(mapVaccinationHistoryItem) : [],
  };
}

function buildFurtailPetPayload(dto: CreateMyPetDto | UpdateMyPetDto) {
  return {
    name: dto.name,
    petType: dto.petType ? titleCasePetType(String(dto.petType)) : dto.species ? titleCasePetType(String(dto.species)) : undefined,
    species: dto.species ? titleCasePetType(String(dto.species)) : dto.petType ? titleCasePetType(String(dto.petType)) : undefined,
    sex: dto.gender ? String(dto.gender).toUpperCase() : dto.sex ? String(dto.sex).toUpperCase() : undefined,
    gender: dto.gender ? String(dto.gender).toUpperCase() : dto.sex ? String(dto.sex).toUpperCase() : undefined,
    dateOfBirth: dto.dateOfBirth ?? approxAgeToDateOfBirth(dto.approxAge),
    customBreedText: dto.breed,
    breed: dto.breed,
    mixedBreed: dto.mixedBreed,
    isMixedBreed: dto.isMixedBreed,
    customColorText: dto.color ?? dto.colour,
    color: dto.color,
    colour: dto.colour,
    microchipNumber: dto.microchipNumber,
    registrationNumber: dto.registrationNumber,
    distinguishingMarks: dto.distinguishingMarks,
    ownershipSource: dto.ownershipSource,
    ownershipStartDate: dto.ownershipStartDate,
    estimatedDateOfBirth: dto.estimatedDateOfBirth,
    isDateOfBirthEstimated: dto.isDateOfBirthEstimated,
    isNeutered: dto.isNeutered ?? dto.isNeuteredOrSpayed,
    isNeuteredOrSpayed: dto.isNeuteredOrSpayed,
    allergies: normalizeStringArray(dto.allergies),
    chronicConditions: dto.chronicConditions,
    healthDisorders: dto.healthDisorders ?? dto.chronicConditions,
    currentMedications: dto.currentMedications,
    previousSurgeries: dto.previousSurgeries,
    disability: dto.disability,
    specialCareNotes: dto.specialCareNotes,
    previousVaccineReaction: dto.previousVaccineReaction,
    generalMedicalNotes: dto.generalMedicalNotes,
    medicalSummary: dto.medicalSummary ?? dto.generalMedicalNotes,
    notes: dto.notes ?? dto.medicalSummary ?? dto.generalMedicalNotes,
    healthCard: dto.healthCard,
    identityDetails: dto.identityDetails,
    weightKg: dto.weightKg,
    idempotencyKey: dto.idempotencyKey ?? undefined,
    historicalVaccinations: dto.historicalVaccinations?.map((item) => ({
      vaccineTypeId: item.vaccineTypeId,
      vaccineName: item.vaccineName,
      administeredAt: item.administeredAt,
      nextDueDate: item.nextDueDate,
      batchNumber: item.batchNumber,
      manufacturer: item.manufacturer,
      vetClinic: item.vetClinic,
      notes: item.notes,
      idempotencyKey: item.idempotencyKey,
    })),
  };
}

function forwardHeadersFromContext(context: ForwardableContext): FurtailForwardHeaders {
  return {
    requestId: context.requestId,
    idempotencyKey: context.idempotencyKey,
  };
}

export async function listMyPets(_userId: string, context: ForwardableContext): Promise<MePetItem[]> {
  const pets = await listFurtailPets(assertFurtailToken(context.token), forwardHeadersFromContext(context));
  return pets.map(mapFurtailPetToMePetItem);
}

export async function createMyPet(authUser: AuthUserContext, dto: CreateMyPetDto): Promise<MePetItem> {
  const pet = await createFurtailPet(
    assertFurtailToken(authUser.token),
    buildFurtailPetPayload(dto),
    forwardHeadersFromContext(authUser),
  );
  return mapFurtailPetToMePetItem(pet);
}

export async function getMyPet(_userId: string, petId: string, context: ForwardableContext): Promise<MePetItem> {
  const pet = await getFurtailPet(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  return mapFurtailPetToMePetItem(pet);
}

export async function updateMyPet(_userId: string, petId: string, context: ForwardableContext, dto: UpdateMyPetDto): Promise<MePetItem> {
  const pet = await updateFurtailPet(
    assertFurtailToken(context.token),
    petId,
    buildFurtailPetPayload(dto),
    forwardHeadersFromContext(context),
  );
  return mapFurtailPetToMePetItem(pet);
}

export async function deleteMyPet(_userId: string, petId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPet(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
}

export async function listMyPetVaccinations(_userId: string, petId: string, context: ForwardableContext): Promise<MePetVaccinationHistoryItem[]> {
  const items = await listFurtailPetVaccinations(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  return Array.isArray(items) ? items.map(mapVaccinationHistoryItem) : [];
}

export async function getMyPetVaccination(_userId: string, petId: string, vaccinationId: string, context: ForwardableContext): Promise<MePetVaccinationHistoryItem> {
  const item = await getFurtailPetVaccination(assertFurtailToken(context.token), petId, vaccinationId, forwardHeadersFromContext(context));
  return mapVaccinationHistoryItem(item);
}

export async function createMyPetVaccination(_userId: string, petId: string, context: ForwardableContext, dto: CreatePetVaccinationDto): Promise<MePetVaccinationHistoryItem> {
  const item = await createFurtailPetVaccination(assertFurtailToken(context.token), petId, dto, forwardHeadersFromContext({
    ...context,
    idempotencyKey: context.idempotencyKey || dto.idempotencyKey || undefined,
  }));
  return mapVaccinationHistoryItem(item);
}

export async function updateMyPetVaccination(_userId: string, petId: string, vaccinationId: string, context: ForwardableContext, dto: UpdatePetVaccinationDto): Promise<MePetVaccinationHistoryItem> {
  const item = await updateFurtailPetVaccination(assertFurtailToken(context.token), petId, vaccinationId, dto, forwardHeadersFromContext(context));
  return mapVaccinationHistoryItem(item);
}

export async function deleteMyPetVaccination(_userId: string, petId: string, vaccinationId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPetVaccination(
    assertFurtailToken(context.token),
    petId,
    vaccinationId,
    { voidReason: 'Removed via BPA app' },
    forwardHeadersFromContext(context),
  );
}

export async function getMyPetMedicalHistory(_userId: string, petId: string, context: ForwardableContext): Promise<MePetDetailResponse> {
  const data = await getFurtailPetMedicalHistory(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  return {
    pet: mapFurtailPetToMePetItem(data.pet),
    profile: {
      allergies: normalizeStringArray(data.profile?.allergies),
      bloodType: data.profile?.bloodType ?? null,
      foodHabits: data.profile?.foodHabits ?? null,
      healthDisorders: data.profile?.healthDisorders ?? null,
      notes: data.profile?.notes ?? null,
      healthCard: data.profile?.healthCard && typeof data.profile.healthCard === 'object' ? data.profile.healthCard : {},
      identityDetails: data.profile?.identityDetails && typeof data.profile.identityDetails === 'object'
        ? data.profile.identityDetails
        : {},
    },
    vaccinations: Array.isArray(data.vaccinations) ? data.vaccinations.map(mapVaccinationHistoryItem) : [],
    medicalHistory: Array.isArray(data.medicalHistory) ? data.medicalHistory.map(mapMedicalHistoryItem) : [],
    dewormingHistory: Array.isArray(data.dewormingHistory) ? data.dewormingHistory.map(mapDewormingItem) : [],
    weightHistory: Array.isArray(data.weightHistory) ? data.weightHistory.map(mapWeightItem) : [],
    documents: Array.isArray(data.documents) ? data.documents.map(mapPetDocumentItem) : [],
  };
}

export async function listMyPetMedicalHistoryRecords(_userId: string, petId: string, context: ForwardableContext): Promise<MePetMedicalHistoryItem[]> {
  const data = await listFurtailPetMedicalHistoryRecords(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  const items = Array.isArray(data?.medicalHistory) ? data.medicalHistory : Array.isArray(data) ? data : [];
  return items.map(mapMedicalHistoryItem);
}

export async function getMyPetMedicalHistoryRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<MePetMedicalHistoryItem> {
  const item = await getFurtailPetMedicalHistoryRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
  return mapMedicalHistoryItem(item);
}

export async function createMyPetMedicalHistoryRecord(_userId: string, petId: string, context: ForwardableContext, dto: CreateMedicalHistoryRecordDto): Promise<MePetMedicalHistoryItem> {
  const item = await createFurtailPetMedicalHistoryRecord(assertFurtailToken(context.token), petId, dto, forwardHeadersFromContext(context));
  return mapMedicalHistoryItem(item);
}

export async function updateMyPetMedicalHistoryRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext, dto: UpdateMedicalHistoryRecordDto): Promise<MePetMedicalHistoryItem> {
  const item = await updateFurtailPetMedicalHistoryRecord(assertFurtailToken(context.token), petId, recordId, dto, forwardHeadersFromContext(context));
  return mapMedicalHistoryItem(item);
}

export async function deleteMyPetMedicalHistoryRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPetMedicalHistoryRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
}

export async function listMyPetDewormingRecords(_userId: string, petId: string, context: ForwardableContext): Promise<MePetDewormingItem[]> {
  const data = await listFurtailPetDewormingRecords(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  const items = Array.isArray(data?.dewormingHistory) ? data.dewormingHistory : Array.isArray(data) ? data : [];
  return items.map(mapDewormingItem);
}

export async function getMyPetDewormingRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<MePetDewormingItem> {
  const item = await getFurtailPetDewormingRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
  return mapDewormingItem(item);
}

export async function createMyPetDewormingRecord(_userId: string, petId: string, context: ForwardableContext, dto: CreateDewormingRecordDto): Promise<MePetDewormingItem> {
  const item = await createFurtailPetDewormingRecord(assertFurtailToken(context.token), petId, dto, forwardHeadersFromContext(context));
  return mapDewormingItem(item);
}

export async function updateMyPetDewormingRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext, dto: UpdateDewormingRecordDto): Promise<MePetDewormingItem> {
  const item = await updateFurtailPetDewormingRecord(assertFurtailToken(context.token), petId, recordId, dto, forwardHeadersFromContext(context));
  return mapDewormingItem(item);
}

export async function deleteMyPetDewormingRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPetDewormingRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
}

export async function listMyPetWeightRecords(_userId: string, petId: string, context: ForwardableContext): Promise<MePetWeightItem[]> {
  const data = await listFurtailPetWeightRecords(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  const items = Array.isArray(data?.weightHistory) ? data.weightHistory : Array.isArray(data) ? data : [];
  return items.map(mapWeightItem);
}

export async function getMyPetWeightRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<MePetWeightItem> {
  const item = await getFurtailPetWeightRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
  return mapWeightItem(item);
}

export async function createMyPetWeightRecord(_userId: string, petId: string, context: ForwardableContext, dto: CreateWeightRecordDto): Promise<MePetWeightItem> {
  const item = await createFurtailPetWeightRecord(assertFurtailToken(context.token), petId, dto, forwardHeadersFromContext(context));
  return mapWeightItem(item);
}

export async function updateMyPetWeightRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext, dto: UpdateWeightRecordDto): Promise<MePetWeightItem> {
  const item = await updateFurtailPetWeightRecord(assertFurtailToken(context.token), petId, recordId, dto, forwardHeadersFromContext(context));
  return mapWeightItem(item);
}

export async function deleteMyPetWeightRecord(_userId: string, petId: string, recordId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPetWeightRecord(assertFurtailToken(context.token), petId, recordId, forwardHeadersFromContext(context));
}

export async function listMyPetDocuments(_userId: string, petId: string, context: ForwardableContext): Promise<MePetDocumentItem[]> {
  const data = await listFurtailPetDocuments(assertFurtailToken(context.token), petId, forwardHeadersFromContext(context));
  const items = Array.isArray(data?.documents) ? data.documents : Array.isArray(data) ? data : [];
  return items.map(mapPetDocumentItem);
}

export async function getMyPetDocument(_userId: string, petId: string, documentId: string, context: ForwardableContext): Promise<MePetDocumentItem> {
  const item = await getFurtailPetDocument(assertFurtailToken(context.token), petId, documentId, forwardHeadersFromContext(context));
  return mapPetDocumentItem(item);
}

export async function uploadMyPetDocument(_userId: string, petId: string, context: ForwardableContext, file: Express.Multer.File | undefined, dto: CreatePetDocumentMetadataDto): Promise<MePetDocumentItem> {
  if (!file) throw AppError.badRequest('No file uploaded');
  const media = await uploadFurtailMedia(assertFurtailToken(context.token), file, forwardHeadersFromContext(context));
  const document = await createFurtailPetDocument(
    assertFurtailToken(context.token),
    petId,
    {
      mediaId: media.id,
      category: dto.category,
      title: dto.title,
      documentDate: dto.documentDate,
      notes: dto.notes,
    },
    forwardHeadersFromContext(context),
  );
  return mapPetDocumentItem(document);
}

export async function updateMyPetDocument(_userId: string, petId: string, documentId: string, context: ForwardableContext, dto: UpdatePetDocumentMetadataDto): Promise<MePetDocumentItem> {
  const item = await updateFurtailPetDocument(assertFurtailToken(context.token), petId, documentId, dto, forwardHeadersFromContext(context));
  return mapPetDocumentItem(item);
}

export async function deleteMyPetDocument(_userId: string, petId: string, documentId: string, context: ForwardableContext): Promise<any> {
  return deleteFurtailPetDocument(assertFurtailToken(context.token), petId, documentId, forwardHeadersFromContext(context));
}

export async function uploadMyPetProfileImage(_userId: string, petId: string, context: ForwardableContext, file: Express.Multer.File | undefined): Promise<MePetItem> {
  if (!file) throw AppError.badRequest('No file uploaded');
  const media = await uploadFurtailMedia(assertFurtailToken(context.token), file, forwardHeadersFromContext(context));
  const pet = await updateFurtailPet(
    assertFurtailToken(context.token),
    petId,
    { profileImageId: media.id },
    forwardHeadersFromContext(context),
  );
  return mapFurtailPetToMePetItem(pet);
}

export async function removeMyPetProfileImage(_userId: string, petId: string, context: ForwardableContext): Promise<MePetItem> {
  const pet = await updateFurtailPet(
    assertFurtailToken(context.token),
    petId,
    { profileImageId: null },
    forwardHeadersFromContext(context),
  );
  return mapFurtailPetToMePetItem(pet);
}
