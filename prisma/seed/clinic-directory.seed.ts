import 'dotenv/config';
import {
  Prisma,
  PrismaClient,
  TriState,
  type ClinicClaimStatus,
  type ClinicVerificationStatus,
  type ClinicFacilityType,
  type ClinicAnimalType,
  type ClinicSocialPlatform,
} from '@prisma/client';
import { clinicDirectorySeedData } from './data/clinic-directory.seed-data';

type DbClient = PrismaClient | Prisma.TransactionClient;

type PhoneSeed = {
  phoneNumber: string;
  label: string | null;
  isPrimary: boolean;
  whatsappAvailable: TriState;
  sortOrder: number;
};

type OpeningHourSeed = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  note: string | null;
};

type BranchSourceSeed = {
  sourceUrl: string;
  label: string | null;
};

type SocialLinkSeed = {
  platform: ClinicSocialPlatform;
  url: string;
  label: string | null;
};

type BranchImageSeed = {
  url: string;
  mediaFileId: string | null;
  isCover: boolean;
  sortOrder: number;
  altText: string | null;
};

type BranchServiceSeed = {
  serviceName: string;
  notes: string | null;
};

type BranchAnimalTypeSeed = {
  animalType: ClinicAnimalType;
  note: string | null;
};

type BranchFacilitySeed = {
  facilityType: ClinicFacilityType;
  available: TriState;
  notes: string | null;
};

type ClinicBranchSeed = {
  slug: string;
  branchName: string;
  address: string | null;
  area: string | null;
  cityCorporation: string | null;
  district: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  googleMapUrl: string | null;
  email: string | null;
  timezone: string;
  emergencyAvailability: TriState;
  open24Hours: TriState;
  appointmentRequired: TriState;
  accessibilityNotes: string | null;
  verificationStatus: ClinicVerificationStatus;
  lastVerifiedAt: string | null;
  published: boolean;
  archivedAt: string | null;
  importNotes: string | null;
  importKey: string | null;
  phones: readonly PhoneSeed[];
  socialLinks?: readonly SocialLinkSeed[];
  openingHours?: readonly OpeningHourSeed[];
  closures?: readonly { startDate: string | null; endDate: string | null; reason: string | null }[];
  services?: readonly BranchServiceSeed[];
  animalTypes?: readonly BranchAnimalTypeSeed[];
  facilities?: readonly BranchFacilitySeed[];
  images?: readonly BranchImageSeed[];
  sources?: readonly BranchSourceSeed[];
};

type ClinicOrganizationSeed = {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  website: string | null;
  email: string | null;
  verificationStatus: ClinicVerificationStatus;
  claimedStatus: ClinicClaimStatus;
  published: boolean;
  featured: boolean;
  archivedAt: string | null;
  socialLinks?: readonly SocialLinkSeed[];
  branches: readonly ClinicBranchSeed[];
};

type ClinicDirectorySnapshot = {
  organizations: readonly ClinicOrganizationSeed[];
};

const seedData = clinicDirectorySeedData as ClinicDirectorySnapshot;

export type ClinicDirectorySeedResult = {
  organizations: number;
  branches: number;
  phones: number;
  openingHours: number;
  services: number;
  animalTypes: number;
  facilities: number;
  sources: number;
  socialLinks: number;
  images: number;
};

function normalizeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function normalizeDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function upsertOrganization(db: DbClient, org: ClinicOrganizationSeed): Promise<void> {
  const payload = {
    name: org.name,
    description: normalizeText(org.description),
    logoUrl: normalizeText(org.logoUrl),
    coverImageUrl: normalizeText(org.coverImageUrl),
    website: normalizeText(org.website),
    email: normalizeText(org.email),
    verificationStatus: org.verificationStatus,
    claimedStatus: org.claimedStatus,
    published: Boolean(org.published),
    featured: Boolean(org.featured),
    archivedAt: normalizeDate(org.archivedAt),
  };

  await db.clinicOrganization.upsert({
    where: { slug: org.slug },
    update: payload,
    create: {
      slug: org.slug,
      ...payload,
    },
  });
}

async function upsertBranch(db: DbClient, orgId: string, branch: ClinicBranchSeed): Promise<void> {
  const payload = {
    organizationId: orgId,
    branchName: branch.branchName,
    address: normalizeText(branch.address),
    area: normalizeText(branch.area),
    cityCorporation: normalizeText(branch.cityCorporation),
    district: normalizeText(branch.district),
    postalCode: normalizeText(branch.postalCode),
    latitude: normalizeDecimal(branch.latitude),
    longitude: normalizeDecimal(branch.longitude),
    googleMapUrl: normalizeText(branch.googleMapUrl),
    email: normalizeText(branch.email),
    timezone: branch.timezone,
    emergencyAvailability: branch.emergencyAvailability,
    open24Hours: branch.open24Hours,
    appointmentRequired: branch.appointmentRequired,
    accessibilityNotes: normalizeText(branch.accessibilityNotes),
    verificationStatus: branch.verificationStatus,
    lastVerifiedAt: normalizeDate(branch.lastVerifiedAt),
    published: Boolean(branch.published),
    archivedAt: normalizeDate(branch.archivedAt),
    importNotes: normalizeText(branch.importNotes),
    importKey: normalizeText(branch.importKey),
  };

  await db.clinicBranch.upsert({
    where: { slug: branch.slug },
    update: payload,
    create: {
      slug: branch.slug,
      ...payload,
    },
  });
}

async function upsertPhone(db: DbClient, branchId: string, phone: PhoneSeed): Promise<void> {
  await db.clinicBranchPhone.upsert({
    where: { branchId_phoneNumber: { branchId, phoneNumber: phone.phoneNumber } },
    update: {
      label: phone.label,
      isPrimary: phone.isPrimary,
      whatsappAvailable: phone.whatsappAvailable,
      sortOrder: phone.sortOrder,
    },
    create: {
      branchId,
      phoneNumber: phone.phoneNumber,
      label: phone.label,
      isPrimary: phone.isPrimary,
      whatsappAvailable: phone.whatsappAvailable,
      sortOrder: phone.sortOrder,
    },
  });
}

async function upsertOpeningHour(db: DbClient, branchId: string, item: OpeningHourSeed): Promise<void> {
  await db.clinicBranchOpeningHours.upsert({
    where: { branchId_dayOfWeek: { branchId, dayOfWeek: item.dayOfWeek } },
    update: {
      opensAt: normalizeText(item.opensAt),
      closesAt: normalizeText(item.closesAt),
      isClosed: Boolean(item.isClosed),
      note: normalizeText(item.note),
    },
    create: {
      branchId,
      dayOfWeek: item.dayOfWeek,
      opensAt: normalizeText(item.opensAt),
      closesAt: normalizeText(item.closesAt),
      isClosed: Boolean(item.isClosed),
      note: normalizeText(item.note),
    },
  });
}

async function upsertBranchService(db: DbClient, branchId: string, item: BranchServiceSeed): Promise<void> {
  await db.clinicBranchService.upsert({
    where: { branchId_serviceName: { branchId, serviceName: item.serviceName } },
    update: { notes: normalizeText(item.notes) },
    create: {
      branchId,
      serviceName: item.serviceName,
      notes: normalizeText(item.notes),
    },
  });
}

async function upsertBranchAnimalType(db: DbClient, branchId: string, item: BranchAnimalTypeSeed): Promise<void> {
  await db.clinicBranchAnimalType.upsert({
    where: { branchId_animalType: { branchId, animalType: item.animalType } },
    update: { note: normalizeText(item.note) },
    create: {
      branchId,
      animalType: item.animalType,
      note: normalizeText(item.note),
    },
  });
}

async function upsertBranchFacility(db: DbClient, branchId: string, item: BranchFacilitySeed): Promise<void> {
  await db.clinicBranchFacility.upsert({
    where: { branchId_facilityType: { branchId, facilityType: item.facilityType } },
    update: {
      available: item.available,
      notes: normalizeText(item.notes),
    },
    create: {
      branchId,
      facilityType: item.facilityType,
      available: item.available,
      notes: normalizeText(item.notes),
    },
  });
}

async function syncByNaturalKey(
  existing: { id: string; label: string | null } | null,
  create: () => Promise<void>,
  update: (id: string) => Promise<void>,
): Promise<void> {
  if (existing) {
    await update(existing.id);
    return;
  }
  await create();
}

async function upsertBranchSource(db: DbClient, branchId: string, item: BranchSourceSeed): Promise<void> {
  const existing = await db.clinicBranchSource.findFirst({
    where: { branchId, sourceUrl: item.sourceUrl },
    select: { id: true, label: true },
  });

  await syncByNaturalKey(
    existing,
    async () => {
      await db.clinicBranchSource.create({
        data: {
          branchId,
          sourceUrl: item.sourceUrl,
          label: normalizeText(item.label),
        },
      });
    },
    async (id) => {
      await db.clinicBranchSource.update({
        where: { id },
        data: { label: normalizeText(item.label) },
      });
    },
  );
}

async function upsertOrganizationSocialLink(db: DbClient, organizationId: string, item: SocialLinkSeed): Promise<void> {
  const existing = await db.clinicOrganizationSocialLink.findFirst({
    where: { organizationId, platform: item.platform, url: item.url },
    select: { id: true, label: true },
  });

  await syncByNaturalKey(
    existing,
    async () => {
      await db.clinicOrganizationSocialLink.create({
        data: {
          organizationId,
          platform: item.platform,
          url: item.url,
          label: normalizeText(item.label),
        },
      });
    },
    async (id) => {
      await db.clinicOrganizationSocialLink.update({
        where: { id },
        data: { label: normalizeText(item.label) },
      });
    },
  );
}

async function upsertBranchSocialLink(db: DbClient, branchId: string, item: SocialLinkSeed): Promise<void> {
  const existing = await db.clinicBranchSocialLink.findFirst({
    where: { branchId, platform: item.platform, url: item.url },
    select: { id: true, label: true },
  });

  await syncByNaturalKey(
    existing,
    async () => {
      await db.clinicBranchSocialLink.create({
        data: {
          branchId,
          platform: item.platform,
          url: item.url,
          label: normalizeText(item.label),
        },
      });
    },
    async (id) => {
      await db.clinicBranchSocialLink.update({
        where: { id },
        data: { label: normalizeText(item.label) },
      });
    },
  );
}

async function upsertBranchImage(db: DbClient, branchId: string, item: BranchImageSeed): Promise<void> {
  if (!item.mediaFileId) return;
  await db.clinicBranchImage.upsert({
    where: { branchId_mediaFileId: { branchId, mediaFileId: item.mediaFileId } },
    update: {
      url: item.url,
      isCover: Boolean(item.isCover),
      sortOrder: item.sortOrder,
      altText: normalizeText(item.altText),
    },
    create: {
      branchId,
      url: item.url,
      mediaFileId: item.mediaFileId,
      isCover: Boolean(item.isCover),
      sortOrder: item.sortOrder,
      altText: normalizeText(item.altText),
    },
  });
}

export async function seedClinicDirectory(db: DbClient = new PrismaClient()): Promise<ClinicDirectorySeedResult> {
  const result: ClinicDirectorySeedResult = {
    organizations: 0,
    branches: 0,
    phones: 0,
    openingHours: 0,
    services: 0,
    animalTypes: 0,
    facilities: 0,
    sources: 0,
    socialLinks: 0,
    images: 0,
  };

  for (const org of seedData.organizations) {
    await upsertOrganization(db, org);
    result.organizations += 1;

    const persistedOrg = await db.clinicOrganization.findUniqueOrThrow({
      where: { slug: org.slug },
      select: { id: true },
    });

    for (const link of org.socialLinks ?? []) {
      await upsertOrganizationSocialLink(db, persistedOrg.id, link);
      result.socialLinks += 1;
    }

    const branches = [...(org.branches ?? [])].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const branch of branches) {
      await upsertBranch(db, persistedOrg.id, branch);
      result.branches += 1;

      const persistedBranch = await db.clinicBranch.findUniqueOrThrow({
        where: { slug: branch.slug },
        select: { id: true },
      });

      for (const phone of branch.phones ?? []) {
        await upsertPhone(db, persistedBranch.id, phone);
        result.phones += 1;
      }

      for (const item of branch.openingHours ?? []) {
        await upsertOpeningHour(db, persistedBranch.id, item);
        result.openingHours += 1;
      }

      for (const item of branch.services ?? []) {
        await upsertBranchService(db, persistedBranch.id, item);
        result.services += 1;
      }

      for (const item of branch.animalTypes ?? []) {
        await upsertBranchAnimalType(db, persistedBranch.id, item);
        result.animalTypes += 1;
      }

      for (const item of branch.facilities ?? []) {
        await upsertBranchFacility(db, persistedBranch.id, item);
        result.facilities += 1;
      }

      for (const item of branch.sources ?? []) {
        await upsertBranchSource(db, persistedBranch.id, item);
        result.sources += 1;
      }

      for (const item of branch.socialLinks ?? []) {
        await upsertBranchSocialLink(db, persistedBranch.id, item);
        result.socialLinks += 1;
      }

      for (const item of branch.images ?? []) {
        await upsertBranchImage(db, persistedBranch.id, item);
        result.images += 1;
      }
    }
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedClinicDirectory(prisma)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error('Clinic seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
