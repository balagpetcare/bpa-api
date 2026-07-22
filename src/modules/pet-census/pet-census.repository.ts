import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { SubmitCensusDto, UpdateCensusDto, CensusListQuery, PublicStatusLookupQuery } from './pet-census.types';

const censusInclude = {
  zone: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  photoMedia: { select: { id: true, url: true, originalName: true, mimeType: true } },
} as const;

function buildCensusWhere(query: CensusListQuery): Prisma.PetCensusSubmissionWhereInput {
  const where: Prisma.PetCensusSubmissionWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.zoneId) where.zoneId = query.zoneId;
  if (query.petType) where.petType = query.petType;
  if (query.division) where.division = { contains: query.division, mode: 'insensitive' };
  if (query.district) where.district = { contains: query.district, mode: 'insensitive' };
  // Location FK ID filters (exact match, non-breaking alongside text filters above)
  if (query.divisionId) where.divisionId = query.divisionId;
  if (query.districtId) where.districtId = query.districtId;
  if (query.upazilaId) where.upazilaId = query.upazilaId;
  if (query.cityCorporationId) where.cityCorporationId = query.cityCorporationId;
  if (query.wardId) where.wardId = query.wardId;
  if (query.memberStatus !== undefined) where.isBpaMember = query.memberStatus;
  if (query.vaccinationStatus) where.vaccinationStatus = query.vaccinationStatus;
  if (query.area) {
    where.OR = [
      { areaText: { contains: query.area, mode: 'insensitive' } },
      { ownerAddress: { contains: query.area, mode: 'insensitive' } },
      { cityUpazila: { contains: query.area, mode: 'insensitive' } },
    ];
  }
  if (query.vaccinationInterest !== undefined) where.isVaccinationInterested = query.vaccinationInterest;
  if (query.communityClinicInterest !== undefined) where.isClinicInterested = query.communityClinicInterest;
  if (query.communityPetShopInterest !== undefined) where.isPetShopInterested = query.communityPetShopInterest;
  if (query.carePartnerInterest !== undefined) where.isCarePartnerInterested = query.carePartnerInterest;
  if (query.dateFrom || query.dateTo) {
    where.submittedAt = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }
  if (query.search) {
    const existingAnd = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];

    where.AND = [
      ...existingAnd,
      {
        OR: [
          { ownerName: { contains: query.search, mode: 'insensitive' } },
          { ownerMobile: { contains: query.search } },
          { ownerEmail: { contains: query.search, mode: 'insensitive' } },
          { division: { contains: query.search, mode: 'insensitive' } },
          { district: { contains: query.search, mode: 'insensitive' } },
          { cityUpazila: { contains: query.search, mode: 'insensitive' } },
          { areaText: { contains: query.search, mode: 'insensitive' } },
          { breed: { contains: query.search, mode: 'insensitive' } },
          { petName: { contains: query.search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  return where;
}

export async function createSubmission(
  dto: SubmitCensusDto,
  userId?: string,
  ipAddress?: string,
  userAgent?: string,
  status?: 'duplicate' | 'new',
) {
  return prisma.petCensusSubmission.create({
    data: {
      userId,
      ownerName: dto.ownerName,
      ownerMobile: dto.ownerMobile,
      ownerEmail: dto.ownerEmail,
      division: dto.division,
      district: dto.district,
      cityUpazila: dto.cityUpazila,
      ownerAddress: dto.ownerAddress,
      zoneId: dto.zoneId,
      areaText: dto.areaText,
      divisionId: dto.divisionId,
      districtId: dto.districtId,
      upazilaId: dto.upazilaId,
      unionId: dto.unionId,
      cityCorporationId: dto.cityCorporationId,
      cityZoneId: dto.cityZoneId,
      wardId: dto.wardId,
      isBpaMember: dto.isBpaMember,
      petName: dto.petName,
      petType: dto.petType,
      petGender: dto.petGender,
      approxAge: dto.approxAge,
      petCount: dto.petCount,
      householdPetCount: dto.householdPetCount,
      breed: dto.breed,
      vaccinationStatus: dto.vaccinationStatus,
      neuteredStatus: dto.neuteredStatus,
      healthIssue: dto.healthIssue,
      photoMediaId: dto.photoMediaId,
      photoUrl: dto.photoUrl,
      petCountDog: dto.petCountDog,
      petCountCat: dto.petCountCat,
      petCountOther: dto.petCountOther,
      petsJson: dto.petsJson as Prisma.InputJsonValue ?? Prisma.JsonNull,
      isVaccinationInterested: dto.isVaccinationInterested,
      isClinicInterested: dto.isClinicInterested,
      isPetShopInterested: dto.isPetShopInterested,
      isCarePartnerInterested: dto.isCarePartnerInterested,
      hasConsented: dto.hasConsented,
      notes: dto.notes,
      source: dto.source,
      sourceRoute: dto.sourceRoute,
      ...(status ? { status } : {}),
      ipAddress,
      userAgent,
    },
    include: censusInclude,
  });
}

export async function findRecentSimilarSubmission(dto: SubmitCensusDto) {
  if (!dto.petName) return null;

  return prisma.petCensusSubmission.findFirst({
    where: {
      ownerMobile: dto.ownerMobile,
      petName: { equals: dto.petName, mode: 'insensitive' },
    },
    orderBy: [{ submittedAt: 'desc' }],
    select: { id: true, submittedAt: true, status: true, petName: true },
  });
}

export async function listSubmissions(query: CensusListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where = buildCensusWhere(query);
  const [items, total] = await Promise.all([
    prisma.petCensusSubmission.findMany({ where, skip, take: limit, orderBy: { submittedAt: 'desc' }, include: censusInclude }),
    prisma.petCensusSubmission.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getSubmissionById(id: string) {
  return prisma.petCensusSubmission.findUnique({ where: { id }, include: censusInclude });
}

export async function updateSubmission(id: string, dto: UpdateCensusDto) {
  return prisma.petCensusSubmission.update({ where: { id }, data: dto, include: censusInclude });
}

export async function deleteSubmission(id: string) {
  return prisma.petCensusSubmission.delete({ where: { id } });
}

export async function listSubmissionsForExport(query: CensusListQuery) {
  return prisma.petCensusSubmission.findMany({
    where: buildCensusWhere(query),
    orderBy: { submittedAt: 'desc' },
    include: censusInclude,
  });
}

export async function listPublicSubmissionStatuses(query: PublicStatusLookupQuery) {
  return prisma.petCensusSubmission.findMany({
    where: {
      ownerMobile: query.mobile,
      ...(query.petName
        ? {
            petName: {
              equals: query.petName,
              mode: 'insensitive',
            },
          }
        : {}),
    },
    orderBy: { submittedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      petName: true,
      petType: true,
      division: true,
      district: true,
      cityUpazila: true,
      vaccinationStatus: true,
      status: true,
      submittedAt: true,
    },
  });
}

export async function listAnalyticsRows() {
  return prisma.petCensusSubmission.findMany({
    select: {
      id: true,
      ownerMobile: true,
      petCount: true,
      petType: true,
      division: true,
      district: true,
      vaccinationStatus: true,
      isBpaMember: true,
    },
  });
}

// ─── Campaign Management ────────────────────────────────────────

export async function getActiveCampaign() {
  return prisma.petCensusCampaign.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCampaign(dto: any) {
  return prisma.petCensusCampaign.create({
    data: {
      ...dto,
      settings: dto.settings || Prisma.JsonNull,
    },
  });
}

export async function updateCampaign(id: string, dto: any) {
  return prisma.petCensusCampaign.update({
    where: { id },
    data: {
      ...dto,
      ...(dto.settings ? { settings: dto.settings } : {}),
    },
  });
}

export async function getCampaignById(id: string) {
  return prisma.petCensusCampaign.findUnique({ where: { id } });
}

export async function listCampaigns() {
  return prisma.petCensusCampaign.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function countSubmissions() {
  return prisma.petCensusSubmission.count();
}
