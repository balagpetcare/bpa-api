import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

const publicBranchInclude = {
  // Organization's Media Library logo/cover are resolved here (not a plain
  // `organization: true`) so the public DTO can prefer the Central Media
  // Library asset's URL over the legacy plain-URL column without a second
  // query per branch (avoids N+1 — this is a single join per page, same
  // query shape as before).
  organization: { include: { logoMedia: true, coverMedia: true } },
  phones: { orderBy: { sortOrder: 'asc' as const } },
  socialLinks: true,
  openingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  closures: { orderBy: { startDate: 'asc' as const } },
  services: true,
  animalTypes: true,
  facilities: true,
  // Same Media Library preference for gallery images — `mediaFile` is
  // joined so `toDto` can prefer it over the legacy `url` column.
  images: { orderBy: { sortOrder: 'asc' as const }, include: { mediaFile: true } },
  // Deliberately NOT included: `sources` (provenance URLs) and any
  // createdBy/updatedBy/audit fields — those are admin-only bookkeeping,
  // never part of the public contract.
};

export type PublicBranchRow = Prisma.ClinicBranchGetPayload<{ include: typeof publicBranchInclude }>;

export interface PublicBranchFilters {
  search?: string;
  organizationSlug?: string;
  cityCorporation?: string;
  area?: string;
  district?: string;
  service?: string;
  animalType?: string;
  facilityType?: string;
  appointmentRequired?: boolean;
  open24Hours?: boolean;
  emergencyAvailability?: boolean;
  verifiedOnly?: boolean;
  featured?: boolean;
}

/**
 * Fetches every published branch of a published organization matching the
 * DB-expressible filters (search/location/service/animal-type/verification/
 * featured). Geo radius, distance sort, "open now", and pagination are all
 * applied afterwards in the service layer — deliberately in application
 * code rather than a raw-SQL/PostGIS query, since the directory is small
 * (tens to low hundreds of branches) and this keeps the logic simple,
 * testable, and free of any new database infrastructure. If the directory
 * grows enough for this to matter, that's the point to introduce PostGIS.
 */
export async function findPublishedBranches(filters: PublicBranchFilters): Promise<PublicBranchRow[]> {
  const orgWhere: Prisma.ClinicOrganizationWhereInput = { published: true, archivedAt: null };
  if (filters.featured) orgWhere.featured = true;
  if (filters.organizationSlug) orgWhere.slug = filters.organizationSlug;

  const where: Prisma.ClinicBranchWhereInput = {
    published: true,
    archivedAt: null,
    organization: orgWhere,
  };

  if (filters.cityCorporation) where.cityCorporation = { contains: filters.cityCorporation, mode: 'insensitive' };
  if (filters.area) where.area = { contains: filters.area, mode: 'insensitive' };
  if (filters.district) where.district = { contains: filters.district, mode: 'insensitive' };
  if (filters.open24Hours) where.open24Hours = 'YES';
  if (filters.emergencyAvailability) where.emergencyAvailability = 'YES';
  if (filters.appointmentRequired) where.appointmentRequired = 'YES';
  if (filters.verifiedOnly) where.verificationStatus = 'VERIFIED';
  if (filters.service) {
    where.services = { some: { serviceName: { contains: filters.service, mode: 'insensitive' } } };
  }
  if (filters.animalType) {
    where.animalTypes = { some: { animalType: filters.animalType as never } };
  }
  if (filters.facilityType) {
    // Only branches CONFIRMED to have this facility (`available: 'YES'`) —
    // an UNKNOWN/NO row for the same facility type must never match, since
    // that would silently misrepresent unconfirmed data as available.
    where.facilities = { some: { facilityType: filters.facilityType as never, available: 'YES' } };
  }
  if (filters.search) {
    where.OR = [
      { branchName: { contains: filters.search, mode: 'insensitive' } },
      { area: { contains: filters.search, mode: 'insensitive' } },
      { address: { contains: filters.search, mode: 'insensitive' } },
      { organization: { name: { contains: filters.search, mode: 'insensitive' }, published: true } },
    ];
  }

  return prisma.clinicBranch.findMany({
    where,
    include: publicBranchInclude,
    orderBy: [{ branchName: 'asc' }, { id: 'asc' }],
  });
}

export async function findPublishedBranchBySlug(slug: string): Promise<PublicBranchRow | null> {
  return prisma.clinicBranch.findFirst({
    where: { slug, published: true, archivedAt: null, organization: { published: true, archivedAt: null } },
    include: publicBranchInclude,
  });
}

export interface PublicFilterOptions {
  cityCorporations: string[];
  areas: string[];
  districts: string[];
  services: string[];
  animalTypes: string[];
  facilityTypes: string[];
}

export async function getDistinctFilterOptions(): Promise<PublicFilterOptions> {
  const where: Prisma.ClinicBranchWhereInput = { published: true, archivedAt: null, organization: { published: true, archivedAt: null } };

  const [cityRows, areaRows, districtRows, serviceRows, animalRows, facilityRows] = await Promise.all([
    prisma.clinicBranch.findMany({ where, distinct: ['cityCorporation'], select: { cityCorporation: true } }),
    prisma.clinicBranch.findMany({ where, distinct: ['area'], select: { area: true } }),
    prisma.clinicBranch.findMany({ where, distinct: ['district'], select: { district: true } }),
    prisma.clinicBranchService.findMany({
      where: { branch: where },
      distinct: ['serviceName'],
      select: { serviceName: true },
    }),
    prisma.clinicBranchAnimalType.findMany({
      where: { branch: where },
      distinct: ['animalType'],
      select: { animalType: true },
    }),
    prisma.clinicBranchFacility.findMany({
      where: { branch: where, available: 'YES' },
      distinct: ['facilityType'],
      select: { facilityType: true },
    }),
  ]);

  return {
    cityCorporations: cityRows.map((r) => r.cityCorporation).filter((v): v is string => !!v).sort(),
    areas: areaRows.map((r) => r.area).filter((v): v is string => !!v).sort(),
    districts: districtRows.map((r) => r.district).filter((v): v is string => !!v).sort(),
    services: serviceRows.map((r) => r.serviceName).sort(),
    animalTypes: animalRows.map((r) => r.animalType).sort(),
    facilityTypes: facilityRows.map((r) => r.facilityType).sort(),
  };
}
