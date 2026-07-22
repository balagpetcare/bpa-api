import { z } from 'zod';
import { PetType, PetGender } from '@prisma/client';

export const createMyPetSchema = z.object({
  name: z.string().min(1).max(120),
  petType: z.nativeEnum(PetType),
  gender: z.nativeEnum(PetGender).optional().default(PetGender.unknown),
  approxAge: z.number().int().min(0).optional(),
  dateOfBirth: z.string().datetime().optional(),
  isDateOfBirthEstimated: z.boolean().optional(),
  breed: z.string().max(120).optional(),
  color: z.string().max(80).optional(),
  microchipNumber: z.string().max(120).optional(),
  isNeuteredOrSpayed: z.boolean().optional(),
  allergies: z.array(z.string().min(1).max(200)).optional(),
  healthDisorders: z.string().max(2000).optional(),
  medicalSummary: z.string().max(2000).optional(),
  healthCard: z.record(z.unknown()).optional(),
  weightKg: z.number().positive().optional(),
  historicalVaccinations: z.array(
    z.object({
      vaccineTypeId: z.number().int().positive().optional(),
      vaccineName: z.string().min(1).max(120).optional(),
      administeredAt: z.string().datetime().optional(),
      nextDueDate: z.string().datetime().nullable().optional(),
      batchNumber: z.string().max(120).optional(),
      manufacturer: z.string().max(128).optional(),
      vetClinic: z.string().max(200).optional(),
      notes: z.string().max(2000).optional(),
      idempotencyKey: z.string().max(128).optional(),
    }).refine((item) => !!item.vaccineTypeId || !!item.vaccineName, {
      message: 'Each historical vaccination requires vaccineTypeId or vaccineName',
    })
  ).optional(),
});

export type CreateMyPetDto = z.infer<typeof createMyPetSchema>;

export const updateMyPetSchema = createMyPetSchema.partial();
export type UpdateMyPetDto = z.infer<typeof updateMyPetSchema>;

export const addMyPetVaccinationSchema = z.object({
  vaccineTypeId: z.number().int().positive().optional(),
  vaccineName: z.string().min(1).max(120).optional(),
  administeredAt: z.string().datetime().optional(),
  nextDueDate: z.string().datetime().nullable().optional(),
  batchNumber: z.string().max(120).optional(),
  manufacturer: z.string().max(128).optional(),
  vetClinic: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().max(128).optional(),
}).refine((item) => !!item.vaccineTypeId || !!item.vaccineName, {
  message: 'vaccineTypeId or vaccineName is required',
});

export type AddMyPetVaccinationDto = z.infer<typeof addMyPetVaccinationSchema>;

// ─── Dashboard Summary Response Types ───────────────────────────────────────

export interface DashboardUserSection {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  memberId: string;
  role: string;
  status: string;
  joinedAt: Date;
  profileCompletion: number;
}

export interface DashboardMembershipSection {
  purchaseId: string;
  tierName: string;
  tierSlug: string;
  status: string;
  amountBdt: number;
  startedAt: string | null;
  expiresAt: string | null;
  renewalDate: string | null;
  canUpgrade: boolean;
  petLimit: number;
  cardNumber: string | null;
  cardStatus: string | null;
  cardQrToken: string | null;
  verifyUrl: string | null;
  preferredZone: string | null;
}

export interface DashboardPetItem {
  id: string;
  name: string;
  petType: string;
  gender: string;
  breed: string | null;
  approxAge: number | null;
  isActive: boolean;
}

export interface DashboardPetsSection {
  total: number;
  items: DashboardPetItem[];
}

export interface DashboardBookingItem {
  id: string;
  bookingNumber: string;
  campaignTitle: string;
  campaignSlug: string;
  sessionDate: string;
  petCount: number;
  status: string;
  paymentStatus: string | null;
  totalAmountBdt: number;
  hasCertificate: boolean;
  certificateNumber: string | null;
  verifyToken: string | null;
  createdAt: Date;
}

export interface DashboardBookingsSection {
  total: number;
  upcoming: number;
  latest: DashboardBookingItem[];
}

export interface DashboardContributionItem {
  id: string;
  contributionNumber: string;
  amountBdt: number;
  status: string;
  planTitle: string;
  zoneName: string;
  zoneSlug: string;
  createdAt: Date;
}

export interface DashboardContributionsSection {
  totalAmount: number;
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  latest: DashboardContributionItem[];
  byZone: Array<{ zoneName: string; amount: number; count: number }>;
}

export interface DashboardCarePartnerCardSection {
  cardId: string;
  cardNumber: string;
  status: string;
  qrToken: string;
  verifyUrl: string;
  issuedAt: string | null;
  expiresAt: string | null;
  zone: string;
  zoneSlug: string;
}

export interface DashboardImpactSection {
  score: number;
  vaccinatedPets: number;
  supportedAnimals: number;
  certificatesIssued: number;
  campaignsParticipated: number;
  contributionsMade: number;
}

export interface DashboardDocumentItem {
  id: string;
  type: string;
  title: string;
  reference: string;
  issuedAt: string;
  downloadUrl: string | null;
  verifyUrl: string | null;
}

export interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  actionUrl: string | null;
}

export interface DashboardTransparencySection {
  totalRaisedBdt: number;
  totalContributors: number;
  userContributionShare: number;
  activeZones: number;
  totalZones: number;
  latestReportTitle: string | null;
  latestReportSlug: string | null;
  latestReportPublishedAt: string | null;
}

export interface DashboardActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  referenceNumber: string | null;
  occurredAt: Date;
}

export interface DashboardSummaryResponse {
  user: DashboardUserSection;
  membership: DashboardMembershipSection | null;
  pets: DashboardPetsSection;
  bookings: DashboardBookingsSection;
  contributions: DashboardContributionsSection;
  carePartnerCard: DashboardCarePartnerCardSection | null;
  impact: DashboardImpactSection;
  documents: DashboardDocumentItem[];
  notifications: DashboardNotification[];
  transparency: DashboardTransparencySection;
  recentActivities: DashboardActivity[];
}

export interface PaginatedListResponse<T> {
  items: T[];
  total: number;
}

export interface MeDonationItem {
  id: string;
  referenceNo: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  receipt_url: string | null;
}

export interface MeVaccinationCardItem {
  id: string;
  petName: string;
  qrCode: string;
  status: string;
  lastVaccinationDate: string | null;
}

export interface MePetCensusItem {
  id: string;
  pet_name: string;
  species: string;
  registration_status: string;
}

export interface MeEventPassItem {
  id: string;
  event_name: string;
  qr_code: string;
  status: string;
  event_date: string | null;
}

export interface MeElectionItem {
  id: string;
  title: string;
  is_eligible_to_vote: boolean;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
}

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

export interface MePetItem {
  id: string;
  furtailPetId: number;
  uniquePetId?: string | null;
  name: string;
  petType: string;
  breed: string | null;
  gender: string;
  approxAge: number | null;
  dateOfBirth?: string | null;
  isDateOfBirthEstimated?: boolean;
  isActive: boolean;
  color?: string | null;
  profileImageUrl?: string | null;
  latestWeightKg?: number | null;
  microchipNumber?: string | null;
  isNeuteredOrSpayed?: boolean | null;
  medicalSummary?: string | null;
  vaccinationSummary?: string | null;
  slug?: string | null;
  isPublicProfileVisible?: boolean | null;
  followerCount?: number | null;
  likeCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  vaccinationHistory: MePetVaccinationHistoryItem[];
}

export interface MePetMedicalHistoryResponse {
  pet: MePetItem;
  profile: {
    allergies: unknown[];
    bloodType: string | null;
    foodHabits: string | null;
    healthDisorders: string | null;
    notes: string | null;
    healthCard: Record<string, unknown>;
  };
  vaccinations: MePetVaccinationHistoryItem[];
  medicalHistory: Array<{
    id: string;
    condition: string;
    treatment: string | null;
    doctorName: string | null;
    clinicName: string | null;
    visitDate: string;
    followUpDate: string | null;
    createdAt: string;
  }>;
  dewormingHistory: Array<{
    id: string;
    medicationName: string;
    dosage: string | null;
    weightAtTime: number | null;
    administeredAt: string;
    nextDueDate: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  weightHistory: Array<{
    id: string;
    weightKg: number;
    notes: string | null;
    recordedAt: string;
    createdAt: string;
  }>;
}
