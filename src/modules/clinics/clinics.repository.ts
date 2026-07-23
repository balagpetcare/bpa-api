import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type {
  ClinicOrganizationListQuery,
  ClinicBranchListQuery,
  UpdateClinicBranchRelatedDto,
} from './clinics.types';

const branchInclude = {
  phones: { orderBy: { sortOrder: 'asc' as const } },
  socialLinks: true,
  openingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  closures: { orderBy: { startDate: 'desc' as const } },
  services: true,
  animalTypes: true,
  facilities: true,
  images: { orderBy: { sortOrder: 'asc' as const }, include: { mediaFile: true } },
  sources: true,
};

// ─── Organizations ──────────────────────────────────────────────────────────

const orgInclude = {
  socialLinks: true,
  logoMedia: true,
  coverMedia: true,
  _count: { select: { branches: true } },
};

/** Used to validate a media reference before it's newly assigned to a clinic. */
export async function getMediaFileById(id: string) {
  return prisma.mediaFile.findUnique({ where: { id }, select: { id: true, url: true, mimeType: true } });
}

export async function createOrganization(dto: Record<string, unknown>, createdById: string) {
  const { socialLinks, ...rest } = dto as { socialLinks?: unknown[] } & Record<string, unknown>;
  return prisma.clinicOrganization.create({
    data: {
      ...rest,
      createdById,
      updatedById: createdById,
      ...(socialLinks
        ? { socialLinks: { create: socialLinks as Prisma.ClinicOrganizationSocialLinkCreateWithoutOrganizationInput[] } }
        : {}),
    } as unknown as Prisma.ClinicOrganizationCreateInput,
    include: orgInclude,
  });
}

export async function listOrganizations(query: ClinicOrganizationListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.ClinicOrganizationWhereInput = {};

  if (query.published === 'true') where.published = true;
  else if (query.published === 'false') where.published = false;
  if (query.featured === 'true') where.featured = true;
  else if (query.featured === 'false') where.featured = false;
  if (query.verificationStatus) where.verificationStatus = query.verificationStatus;
  if (query.status === 'archived') where.archivedAt = { not: null };
  else if (query.status === 'all') {
    // no archivedAt filter — include both active and archived
  } else where.archivedAt = null; // default: active (non-archived) only
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const dir = query.sortDir ?? 'asc';
  const orgSortField = query.sortBy === 'createdAt' ? 'createdAt' : query.sortBy === 'updatedAt' ? 'updatedAt' : 'name';
  const orderBy: Prisma.ClinicOrganizationOrderByWithRelationInput[] = query.sortBy
    ? [{ [orgSortField]: dir }]
    : [{ featured: 'desc' }, { name: 'asc' }];

  const [items, total] = await Promise.all([
    prisma.clinicOrganization.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: orgInclude,
    }),
    prisma.clinicOrganization.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getOrganizationById(id: string) {
  return prisma.clinicOrganization.findUnique({
    where: { id },
    include: { ...orgInclude, branches: { orderBy: { branchName: 'asc' } } },
  });
}

export async function getOrganizationBySlug(slug: string) {
  return prisma.clinicOrganization.findUnique({ where: { slug } });
}

export async function updateOrganization(id: string, dto: Record<string, unknown>, updatedById: string) {
  const { socialLinks, ...rest } = dto as { socialLinks?: unknown[] } & Record<string, unknown>;
  if (socialLinks) {
    await prisma.$transaction([
      prisma.clinicOrganizationSocialLink.deleteMany({ where: { organizationId: id } }),
      prisma.clinicOrganizationSocialLink.createMany({
        data: (socialLinks as Record<string, unknown>[]).map((s) => ({ ...s, organizationId: id })) as Prisma.ClinicOrganizationSocialLinkCreateManyInput[],
      }),
    ]);
  }
  return prisma.clinicOrganization.update({
    where: { id },
    data: { ...rest, updatedById } as Prisma.ClinicOrganizationUpdateInput,
    include: orgInclude,
  });
}

export async function setOrganizationArchived(
  id: string,
  archived: boolean,
  actorId: string,
): Promise<void> {
  await prisma.clinicOrganization.update({
    where: { id },
    data: archived
      ? { archivedAt: new Date(), archivedById: actorId, published: false }
      : { archivedAt: null, archivedById: null },
  });
}

/** Non-archived branches count — used to block permanent organization deletion. */
export async function countActiveBranches(organizationId: string): Promise<number> {
  return prisma.clinicBranch.count({ where: { organizationId, archivedAt: null } });
}

export async function listBranchNamesForOrganization(organizationId: string, take = 10): Promise<string[]> {
  const rows = await prisma.clinicBranch.findMany({
    where: { organizationId },
    select: { branchName: true },
    take,
    orderBy: { branchName: 'asc' },
  });
  return rows.map((r) => r.branchName);
}

export async function deleteOrganization(id: string) {
  return prisma.clinicOrganization.delete({ where: { id } });
}

// ─── Branches ────────────────────────────────────────────────────────────────

export async function createBranch(dto: Record<string, unknown>, createdById: string) {
  return prisma.clinicBranch.create({
    data: { ...dto, createdById, updatedById: createdById } as unknown as Prisma.ClinicBranchCreateInput,
    include: branchInclude,
  });
}

export async function listBranches(query: ClinicBranchListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.ClinicBranchWhereInput = {};

  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.published === 'true') where.published = true;
  else if (query.published === 'false') where.published = false;
  if (query.verificationStatus) where.verificationStatus = query.verificationStatus;
  if (query.status === 'archived') where.archivedAt = { not: null };
  else if (query.status === 'all') {
    // include both active and archived
  } else where.archivedAt = null; // default: active only
  if (query.area) where.area = { contains: query.area, mode: 'insensitive' };
  if (query.district) where.district = { contains: query.district, mode: 'insensitive' };
  if (query.cityCorporation) where.cityCorporation = { contains: query.cityCorporation, mode: 'insensitive' };
  if (query.emergencyAvailability) where.emergencyAvailability = query.emergencyAvailability;
  if (query.open24Hours) where.open24Hours = query.open24Hours;
  if (query.missingCoordinates === 'true') {
    where.OR = [{ latitude: null }, { longitude: null }];
  }
  if (query.missingHours === 'true') {
    where.openingHours = { none: {} };
  }
  if (query.unverifiedOnly === 'true') {
    where.verificationStatus = { not: 'VERIFIED' };
  }
  if (query.search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { branchName: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { area: { contains: query.search, mode: 'insensitive' } },
          { district: { contains: query.search, mode: 'insensitive' } },
          { organization: { name: { contains: query.search, mode: 'insensitive' } } },
          { phones: { some: { phoneNumber: { contains: query.search, mode: 'insensitive' } } } },
        ],
      },
    ];
  }

  const branchDir = query.sortDir ?? 'asc';
  const branchSortField =
    query.sortBy === 'createdAt' ? 'createdAt'
    : query.sortBy === 'updatedAt' ? 'updatedAt'
    : query.sortBy === 'lastVerifiedAt' ? 'lastVerifiedAt'
    : 'branchName';
  const branchOrderBy: Prisma.ClinicBranchOrderByWithRelationInput[] = [{ [branchSortField]: branchDir }];

  const [rows, total] = await Promise.all([
    prisma.clinicBranch.findMany({
      where,
      skip,
      take: limit,
      orderBy: branchOrderBy,
      include: { ...branchInclude, organization: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.clinicBranch.count({ where }),
  ]);

  // `missingPhone` can't be expressed as a Prisma where-filter alongside the
  // other independent flags without a raw query, so it's applied as an
  // in-memory post-filter on the already-paginated page. Acceptable for an
  // admin data-quality view (small page sizes), not for the public API.
  const items = query.missingPhone === 'true' ? rows.filter((r) => r.phones.length === 0) : rows;

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getBranchById(id: string) {
  return prisma.clinicBranch.findUnique({
    where: { id },
    include: { ...branchInclude, organization: { select: { id: true, name: true, slug: true } } },
  });
}

export async function getBranchByImportKey(importKey: string) {
  return prisma.clinicBranch.findUnique({ where: { importKey } });
}

export async function updateBranch(id: string, dto: Record<string, unknown>, updatedById: string) {
  return prisma.clinicBranch.update({
    where: { id },
    data: { ...dto, updatedById } as Prisma.ClinicBranchUpdateInput,
    include: branchInclude,
  });
}

export async function deleteBranch(id: string) {
  return prisma.clinicBranch.delete({ where: { id } });
}

export async function setBranchArchived(id: string, archived: boolean, actorId: string): Promise<void> {
  await prisma.clinicBranch.update({
    where: { id },
    data: archived
      ? { archivedAt: new Date(), archivedById: actorId, published: false }
      : { archivedAt: null, archivedById: null },
  });
}

type BranchWithRelated = Awaited<ReturnType<typeof getBranchById>>;

export async function duplicateBranch(
  source: NonNullable<BranchWithRelated>,
  overrides: { branchName: string; slug: string },
  createdById: string,
) {
  return prisma.clinicBranch.create({
    data: {
      organizationId: source.organizationId,
      branchName: overrides.branchName,
      slug: overrides.slug,
      address: source.address,
      area: source.area,
      cityCorporation: source.cityCorporation,
      district: source.district,
      postalCode: source.postalCode,
      latitude: source.latitude,
      longitude: source.longitude,
      googleMapUrl: source.googleMapUrl,
      email: source.email,
      timezone: source.timezone,
      emergencyAvailability: source.emergencyAvailability,
      open24Hours: source.open24Hours,
      appointmentRequired: source.appointmentRequired,
      accessibilityNotes: source.accessibilityNotes,
      published: false,
      verificationStatus: 'UNKNOWN',
      createdById,
      updatedById: createdById,
      phones: {
        create: source.phones.map((p) => ({
          phoneNumber: p.phoneNumber,
          label: p.label,
          isPrimary: p.isPrimary,
          whatsappAvailable: p.whatsappAvailable,
          sortOrder: p.sortOrder,
        })),
      },
      openingHours: {
        create: source.openingHours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          opensAt: h.opensAt,
          closesAt: h.closesAt,
          isClosed: h.isClosed,
          note: h.note,
        })),
      },
      services: {
        create: source.services.map((s) => ({ serviceName: s.serviceName, notes: s.notes })),
      },
      animalTypes: {
        create: source.animalTypes.map((a) => ({ animalType: a.animalType, note: a.note })),
      },
      facilities: {
        create: source.facilities.map((f) => ({ facilityType: f.facilityType, available: f.available, notes: f.notes })),
      },
    },
    include: branchInclude,
  });
}

export async function bulkSetBranchPublished(ids: string[], published: boolean, updatedById: string): Promise<number> {
  const result = await prisma.clinicBranch.updateMany({
    where: { id: { in: ids } },
    data: { published, updatedById },
  });
  return result.count;
}

export async function bulkSetBranchArchived(ids: string[], archived: boolean, actorId: string): Promise<number> {
  const result = await prisma.clinicBranch.updateMany({
    where: { id: { in: ids } },
    data: archived
      ? { archivedAt: new Date(), archivedById: actorId, published: false }
      : { archivedAt: null, archivedById: null },
  });
  return result.count;
}

export async function bulkSetOrganizationPublished(ids: string[], published: boolean, updatedById: string): Promise<number> {
  const result = await prisma.clinicOrganization.updateMany({
    where: { id: { in: ids } },
    data: { published, updatedById },
  });
  return result.count;
}

export async function bulkSetOrganizationArchived(ids: string[], archived: boolean, actorId: string): Promise<number> {
  const result = await prisma.clinicOrganization.updateMany({
    where: { id: { in: ids } },
    data: archived
      ? { archivedAt: new Date(), archivedById: actorId, published: false }
      : { archivedAt: null, archivedById: null },
  });
  return result.count;
}

/** Replaces whichever nested collections are present in `dto` inside one transaction. */
export async function replaceBranchRelated(branchId: string, dto: UpdateClinicBranchRelatedDto) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (dto.phones) {
    ops.push(prisma.clinicBranchPhone.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchPhone.createMany({
        data: dto.phones.map((p) => ({ ...p, branchId })),
      }),
    );
  }
  if (dto.socialLinks) {
    ops.push(prisma.clinicBranchSocialLink.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchSocialLink.createMany({
        data: dto.socialLinks.map((s) => ({ ...s, branchId })),
      }),
    );
  }
  if (dto.openingHours) {
    ops.push(prisma.clinicBranchOpeningHours.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchOpeningHours.createMany({
        data: dto.openingHours.map((h) => ({ ...h, branchId })),
      }),
    );
  }
  if (dto.closures) {
    ops.push(prisma.clinicBranchClosure.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchClosure.createMany({
        data: dto.closures.map((c) => ({ ...c, branchId })),
      }),
    );
  }
  if (dto.services) {
    ops.push(prisma.clinicBranchService.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchService.createMany({
        data: dto.services.map((s) => ({ ...s, branchId })),
      }),
    );
  }
  if (dto.animalTypes) {
    ops.push(prisma.clinicBranchAnimalType.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchAnimalType.createMany({
        data: dto.animalTypes.map((a) => ({ ...a, branchId })),
      }),
    );
  }
  if (dto.facilities) {
    ops.push(prisma.clinicBranchFacility.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchFacility.createMany({
        data: dto.facilities.map((f) => ({ ...f, branchId })),
      }),
    );
  }
  if (dto.images) {
    ops.push(prisma.clinicBranchImage.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchImage.createMany({
        data: dto.images.map((i) => ({ ...i, branchId })),
      }),
    );
  }
  if (dto.sources) {
    ops.push(prisma.clinicBranchSource.deleteMany({ where: { branchId } }));
    ops.push(
      prisma.clinicBranchSource.createMany({
        data: dto.sources.map((s) => ({ ...s, branchId })),
      }),
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  return getBranchById(branchId);
}

// ─── Atomic branch image operations (attach/remove/reorder) ───────────────

export async function addBranchImage(
  branchId: string,
  image: { url: string; mediaFileId?: string | null; isCover: boolean; sortOrder: number; altText?: string | null },
) {
  if (image.isCover) {
    await prisma.clinicBranchImage.updateMany({ where: { branchId }, data: { isCover: false } });
  }
  // The (branchId, mediaFileId) unique index (NULLs are distinct in
  // Postgres, so this never affects legacy/url-only rows) is what actually
  // enforces "no duplicate Media Library image in one gallery" — the
  // service layer catches P2002 from this and reports it as a friendly
  // conflict rather than a raw database error.
  await prisma.clinicBranchImage.create({ data: { ...image, branchId } });
  return getBranchById(branchId);
}

export async function removeBranchImage(branchId: string, imageId: string) {
  await prisma.clinicBranchImage.deleteMany({ where: { id: imageId, branchId } });
  return getBranchById(branchId);
}

export async function reorderBranchImages(branchId: string, order: string[]) {
  await prisma.$transaction(
    order.map((imageId, index) =>
      prisma.clinicBranchImage.updateMany({ where: { id: imageId, branchId }, data: { sortOrder: index } }),
    ),
  );
  return getBranchById(branchId);
}
