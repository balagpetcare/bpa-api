import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { prisma } from '../src/database/prisma';

const OUTPUT_FILE = path.resolve(process.cwd(), 'prisma/seed/data/clinic-directory.seed-data.ts');

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function decimalOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sortBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
  return [...items].sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

async function main() {
  const organizations = await prisma.clinicOrganization.findMany({
    orderBy: { slug: 'asc' },
    select: {
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      website: true,
      email: true,
      verificationStatus: true,
      claimedStatus: true,
      published: true,
      featured: true,
      archivedAt: true,
      branches: {
        orderBy: { slug: 'asc' },
        select: {
          slug: true,
          branchName: true,
          address: true,
          area: true,
          cityCorporation: true,
          district: true,
          postalCode: true,
          latitude: true,
          longitude: true,
          googleMapUrl: true,
          email: true,
          timezone: true,
          emergencyAvailability: true,
          open24Hours: true,
          appointmentRequired: true,
          accessibilityNotes: true,
          verificationStatus: true,
          lastVerifiedAt: true,
          published: true,
          archivedAt: true,
          importNotes: true,
          importKey: true,
          phones: {
            orderBy: { sortOrder: 'asc' },
            select: { phoneNumber: true, label: true, isPrimary: true, whatsappAvailable: true, sortOrder: true },
          },
          socialLinks: {
            orderBy: [{ platform: 'asc' }, { url: 'asc' }],
            select: { platform: true, url: true, label: true },
          },
          openingHours: {
            orderBy: { dayOfWeek: 'asc' },
            select: { dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true, note: true },
          },
          closures: {
            orderBy: { startDate: 'asc' },
            select: { startDate: true, endDate: true, reason: true },
          },
          services: {
            orderBy: { serviceName: 'asc' },
            select: { serviceName: true, notes: true },
          },
          animalTypes: {
            orderBy: { animalType: 'asc' },
            select: { animalType: true, note: true },
          },
          facilities: {
            orderBy: { facilityType: 'asc' },
            select: { facilityType: true, available: true, notes: true },
          },
          images: {
            orderBy: { sortOrder: 'asc' },
            select: { url: true, mediaFileId: true, isCover: true, sortOrder: true, altText: true },
          },
          sources: {
            orderBy: { sourceUrl: 'asc' },
            select: { sourceUrl: true, label: true },
          },
        },
      },
      socialLinks: {
        orderBy: [{ platform: 'asc' }, { url: 'asc' }],
        select: { platform: true, url: true, label: true },
      },
    },
  });

  const payload = {
    organizations: organizations.map((org) => ({
      slug: org.slug,
      name: org.name,
      description: textOrNull(org.description),
      logoUrl: textOrNull(org.logoUrl),
      coverImageUrl: textOrNull(org.coverImageUrl),
      website: textOrNull(org.website),
      email: textOrNull(org.email),
      verificationStatus: org.verificationStatus,
      claimedStatus: org.claimedStatus,
      published: org.published,
      featured: org.featured,
      archivedAt: dateOrNull(org.archivedAt),
      socialLinks: sortBy(org.socialLinks, (item) => `${item.platform}:${item.url}`).map((item) => ({
        platform: item.platform,
        url: item.url,
        label: textOrNull(item.label),
      })),
      branches: org.branches.map((branch) => ({
        slug: branch.slug,
        branchName: branch.branchName,
        address: textOrNull(branch.address),
        area: textOrNull(branch.area),
        cityCorporation: textOrNull(branch.cityCorporation),
        district: textOrNull(branch.district),
        postalCode: textOrNull(branch.postalCode),
        latitude: decimalOrNull(branch.latitude),
        longitude: decimalOrNull(branch.longitude),
        googleMapUrl: textOrNull(branch.googleMapUrl),
        email: textOrNull(branch.email),
        timezone: branch.timezone,
        emergencyAvailability: branch.emergencyAvailability,
        open24Hours: branch.open24Hours,
        appointmentRequired: branch.appointmentRequired,
        accessibilityNotes: textOrNull(branch.accessibilityNotes),
        verificationStatus: branch.verificationStatus,
        lastVerifiedAt: dateOrNull(branch.lastVerifiedAt),
        published: branch.published,
        archivedAt: dateOrNull(branch.archivedAt),
        importNotes: textOrNull(branch.importNotes),
        importKey: textOrNull(branch.importKey),
        phones: branch.phones.map((phone) => ({
          phoneNumber: phone.phoneNumber,
          label: textOrNull(phone.label),
          isPrimary: phone.isPrimary,
          whatsappAvailable: phone.whatsappAvailable,
          sortOrder: phone.sortOrder,
        })),
        socialLinks: branch.socialLinks.map((item) => ({
          platform: item.platform,
          url: item.url,
          label: textOrNull(item.label),
        })),
        openingHours: branch.openingHours.map((item) => ({
          dayOfWeek: item.dayOfWeek,
          opensAt: textOrNull(item.opensAt),
          closesAt: textOrNull(item.closesAt),
          isClosed: item.isClosed,
          note: textOrNull(item.note),
        })),
        closures: branch.closures.map((item) => ({
          startDate: dateOrNull(item.startDate),
          endDate: dateOrNull(item.endDate),
          reason: textOrNull(item.reason),
        })),
        services: branch.services.map((item) => ({
          serviceName: item.serviceName,
          notes: textOrNull(item.notes),
        })),
        animalTypes: branch.animalTypes.map((item) => ({
          animalType: item.animalType,
          note: textOrNull(item.note),
        })),
        facilities: branch.facilities.map((item) => ({
          facilityType: item.facilityType,
          available: item.available,
          notes: textOrNull(item.notes),
        })),
        images: branch.images.map((item) => ({
          url: item.url,
          mediaFileId: item.mediaFileId,
          isCover: item.isCover,
          sortOrder: item.sortOrder,
          altText: textOrNull(item.altText),
        })),
        sources: branch.sources.map((item) => ({
          sourceUrl: item.sourceUrl,
          label: textOrNull(item.label),
        })),
      })),
    })),
  };

  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const fileContents = [
    '// Generated from the live BPA clinic directory snapshot.',
    '// Do not hand-edit; re-run scripts/export-clinic-seed.ts to regenerate.',
    '',
    'export const clinicDirectorySeedData = ',
    `${JSON.stringify(payload, null, 2)} as const;`,
    '',
  ].join('\n');

  writeFileSync(OUTPUT_FILE, fileContents, 'utf8');

  const counts = {
    organizations: organizations.length,
    branches: organizations.reduce((sum, org) => sum + org.branches.length, 0),
    phones: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.phones.length, 0), 0),
    openingHours: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.openingHours.length, 0), 0),
    services: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.services.length, 0), 0),
    animalTypes: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.animalTypes.length, 0), 0),
    facilities: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.facilities.length, 0), 0),
    sources: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.sources.length, 0), 0),
    socialLinks: organizations.reduce((sum, org) => sum + org.socialLinks.length + org.branches.reduce((branchSum, branch) => branchSum + branch.socialLinks.length, 0), 0),
    images: organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.images.length, 0), 0),
  };

  console.log(JSON.stringify({ outputFile: OUTPUT_FILE, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error('Clinic export failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
