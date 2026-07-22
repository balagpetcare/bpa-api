import { AppError } from '../../utils/AppError';
import { type AuditContext } from '../../utils/audit';
import * as mediaSvc from '../media/media.service';
import * as repo from './pet-census.repository';
import type { SubmitCensusDto, UpdateCensusDto, CensusListQuery, PublicStatusLookupQuery } from './pet-census.types';

export async function submitCensus(dto: SubmitCensusDto, userId?: string, ipAddress?: string, userAgent?: string) {
  const duplicate = await repo.findRecentSimilarSubmission(dto);
  const submission = await repo.createSubmission(
    dto,
    userId,
    ipAddress,
    userAgent,
    duplicate ? 'duplicate' : 'new',
  );
  return {
    submission,
    duplicateHint: duplicate
      ? {
          possibleDuplicate: true,
          existingSubmissionId: duplicate.id,
          petName: duplicate.petName,
          submittedAt: duplicate.submittedAt,
          status: duplicate.status,
        }
      : { possibleDuplicate: false },
  };
}

export async function listSubmissions(query: CensusListQuery) {
  return repo.listSubmissions(query);
}

export async function getSubmission(id: string) {
  const s = await repo.getSubmissionById(id);
  if (!s) throw AppError.notFound('Census submission');
  return s;
}

export async function updateSubmission(id: string, dto: UpdateCensusDto) {
  await getSubmission(id);
  return repo.updateSubmission(id, dto);
}

export async function deleteSubmission(id: string) {
  await getSubmission(id);
  await repo.deleteSubmission(id);
}

export async function lookupSubmissionStatus(query: PublicStatusLookupQuery) {
  const submissions = await repo.listPublicSubmissionStatuses(query);
  return {
    mobile: query.mobile,
    total: submissions.length,
    submissions,
  };
}

export async function uploadPetCensusPhoto(
  file: Express.Multer.File | undefined,
  uploadedById: string | null | undefined,
  ctx: AuditContext,
) {
  if (!file) throw AppError.badRequest('No file uploaded');
  if (!file.mimetype.startsWith('image/')) {
    throw AppError.badRequest('Pet photo must be an image file.');
  }

  return mediaSvc.uploadFile(file, uploadedById, ctx);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function exportSubmissions(query: CensusListQuery) {
  const items = await repo.listSubmissionsForExport(query);
  const headers = [
    'id', 'ownerName', 'ownerMobile', 'ownerEmail', 'division', 'district', 'cityUpazila',
    'area', 'address', 'memberStatus', 'userId', 'zone', 'petName', 'petType', 'petGender',
    'approxAge', 'petCount', 'householdPetCount', 'breed', 'vaccinationStatus', 'neuteredStatus',
    'healthIssue', 'photoUrl', 'vaccinationInterest', 'clinicInterest',
    'petShopInterest', 'carePartnerInterest', 'status', 'source', 'notes',
    'adminNote', 'submittedAt',
  ];
  const rows = items.map((s) => [
    s.id,
    s.ownerName,
    s.ownerMobile,
    s.ownerEmail,
    s.division,
    s.district,
    s.cityUpazila,
    s.areaText,
    s.ownerAddress,
    s.isBpaMember ? 'member' : 'non_member',
    s.userId,
    s.zone?.name,
    s.petName,
    s.petType,
    s.petGender,
    s.approxAge,
    s.petCount,
    s.householdPetCount,
    s.breed,
    s.vaccinationStatus,
    s.neuteredStatus,
    s.healthIssue,
    s.photoUrl,
    s.isVaccinationInterested,
    s.isClinicInterested,
    s.isPetShopInterested,
    s.isCarePartnerInterested,
    s.status,
    s.source,
    s.notes,
    s.adminNote,
    s.submittedAt,
  ].map(csvCell).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export async function getAnalyticsSummary() {
  const rows = await repo.listAnalyticsRows();
  const uniqueOwners = new Set(rows.map((row) => row.ownerMobile));
  const species = new Map<string, number>();
  const districts = new Map<string, { division: string; district: string; owners: Set<string>; petCount: number }>();
  const memberBreakdown = { member: 0, nonMember: 0 };
  const vaccinationBreakdown = {
    up_to_date: 0,
    due: 0,
    not_vaccinated: 0,
    unknown: 0,
  };

  let totalPets = 0;
  let vaccinationNeededCount = 0;

  for (const row of rows) {
    const petCount = row.petCount || 0;
    totalPets += petCount;

    const speciesKey = row.petType ?? 'unknown';
    species.set(speciesKey, (species.get(speciesKey) ?? 0) + petCount);

    const districtKey = `${row.division ?? 'Unknown'}::${row.district ?? 'Unknown'}`;
    if (!districts.has(districtKey)) {
      districts.set(districtKey, {
        division: row.division ?? 'Unknown',
        district: row.district ?? 'Unknown',
        owners: new Set<string>(),
        petCount: 0,
      });
    }

    const districtRow = districts.get(districtKey)!;
    districtRow.owners.add(row.ownerMobile);
    districtRow.petCount += petCount;

    if (row.isBpaMember) memberBreakdown.member += 1;
    else memberBreakdown.nonMember += 1;

    const vaccinationKey = row.vaccinationStatus ?? 'unknown';
    if (vaccinationKey in vaccinationBreakdown) {
      vaccinationBreakdown[vaccinationKey as keyof typeof vaccinationBreakdown] += petCount;
    } else {
      vaccinationBreakdown.unknown += petCount;
    }

    if (row.vaccinationStatus === 'due' || row.vaccinationStatus === 'not_vaccinated') {
      vaccinationNeededCount += petCount;
    }
  }

  return {
    totals: {
      owners: uniqueOwners.size,
      pets: totalPets,
      vaccinationNeeded: vaccinationNeededCount,
    },
    districtWise: Array.from(districts.values())
      .map((row) => ({
        division: row.division,
        district: row.district,
        ownerCount: row.owners.size,
        petCount: row.petCount,
      }))
      .sort((a, b) => b.petCount - a.petCount),
    speciesWise: Array.from(species.entries())
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count),
    memberBreakdown,
    vaccinationBreakdown,
  };
}

// ─── Campaign Settings ──────────────────────────────────────────

export async function getPublicCampaignSettings() {
  const campaign = await repo.getActiveCampaign();
  if (!campaign) {
    return {
      active: false,
      title: 'Pet Census 2026',
      status: 'registration_closed',
      currentSubmissions: 0,
      targetSubmissions: 10000,
    };
  }

  const currentCount = await repo.countSubmissions();
  
  return {
    active: campaign.isActive && campaign.status === 'registration_open',
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    status: campaign.status,
    registrationStartAt: campaign.registrationStartAt,
    registrationEndAt: campaign.registrationEndAt,
    countdownTargetAt: campaign.countdownTargetAt,
    targetSubmissions: campaign.targetSubmissions,
    currentSubmissions: currentCount,
    settings: campaign.settings,
  };
}

export async function createCampaign(dto: any) {
  return repo.createCampaign(dto);
}

export async function updateCampaign(id: string, dto: any) {
  return repo.updateCampaign(id, dto);
}

export async function getCampaign(id: string) {
  const c = await repo.getCampaignById(id);
  if (!c) throw AppError.notFound('Campaign');
  return c;
}

export async function listCampaigns() {
  return repo.listCampaigns();
}
