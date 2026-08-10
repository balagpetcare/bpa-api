import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── BPA Core Services (BpaProgram) ────────────────────────────────
// Only programs whose route genuinely exists on bpa_web today. Icons are
// left null — CoreServicesSection already falls back to a neutral icon, and
// no suitable icon-shaped asset exists in the media library yet (see report).
const PROGRAMS = [
  {
    key: 'vaccination-campaigns',
    titleEn: 'Vaccination Campaigns',
    descriptionEn: 'Nationwide preventive vaccination drives for cats and dogs, including rabies and core vaccine coverage.',
    ctaLabel: 'View Campaigns',
    ctaHref: '/campaigns',
    sortOrder: 0,
  },
  {
    key: 'spay-neuter',
    titleEn: 'Spay & Neuter',
    descriptionEn: 'Subsidised spay and neuter services at partner clinics, supporting responsible population management.',
    ctaLabel: 'Book a Service',
    ctaHref: '/spay-neuter',
    sortOrder: 1,
  },
  {
    key: 'find-a-clinic',
    titleEn: 'Find a Clinic',
    descriptionEn: 'Locate published veterinary clinics and partner service providers across Bangladesh.',
    ctaLabel: 'Find a Clinic',
    ctaHref: '/clinics',
    sortOrder: 2,
  },
  {
    key: 'community-pet-care',
    titleEn: 'Community Pet Care',
    descriptionEn: 'A community-funded initiative supporting shared veterinary care access through Care Partner contributions.',
    ctaLabel: 'Learn More',
    ctaHref: '/community-pet-care',
    sortOrder: 3,
  },
  {
    key: 'pet-census',
    titleEn: 'Pet Census 2026',
    descriptionEn: 'Register your pets to help BPA plan clinic capacity and community health services in your area.',
    ctaLabel: 'Register Now',
    ctaHref: '/pet-census-2026',
    sortOrder: 4,
  },
  {
    key: 'donate',
    titleEn: 'Donate',
    descriptionEn: 'Support vaccination, rescue, and community care programs with a direct contribution.',
    ctaLabel: 'Donate Now',
    ctaHref: '/donate',
    sortOrder: 5,
  },
  {
    key: 'awareness-resources',
    titleEn: 'Awareness & Education',
    descriptionEn: 'Video guides and resources on responsible pet ownership, health, and animal welfare.',
    ctaLabel: 'Watch Videos',
    ctaHref: '/videos',
    sortOrder: 6,
  },
] as const;

// ─── App Showcases ───────────────────────────────────────────────
// No Android/iOS store URLs are configured anywhere in this system, so
// every platform link is created as COMING_SOON with no storeUrl — never a
// fabricated store link. No app screenshots exist in the media library
// (verified: 16 total media rows, none are app UI screenshots) — screenshots
// are intentionally left empty; see the report for what to upload.

async function upsertPrograms() {
  const results = [];
  for (const p of PROGRAMS) {
    const row = await prisma.bpaProgram.upsert({
      where: { key: p.key },
      update: { ...p, isActive: true },
      create: { ...p, isActive: true },
    });
    results.push(row);
  }
  return results;
}

async function upsertBpaApp() {
  // BPA logo already used sitewide (favicon / header logo) — reused as the
  // app icon rather than uploading a new asset.
  const logo = await prisma.mediaFile.findFirst({ where: { originalName: 'favicon-32x32.png' } });

  const existing = await prisma.appShowcase.findUnique({ where: { appKey: 'bpa' } });
  const data = {
    name: 'Bangladesh Pet Association App',
    tagline: 'Access BPA campaigns, pet-care services and community programs from one place.',
    description:
      'The official BPA mobile app for campaign registration, Spay & Neuter booking, membership, and community programs.',
    relationshipLabel: 'Official BPA application',
    iconMediaId: logo?.id ?? null,
    isActive: true,
    sortOrder: 0,
  };

  if (existing) {
    await prisma.appShowcaseFeature.deleteMany({ where: { appShowcaseId: existing.id } });
    await prisma.appShowcasePlatformLink.deleteMany({ where: { appShowcaseId: existing.id } });
  }

  const features = [
    'Vaccination campaign registration',
    'Spay & Neuter booking',
    'Find a Clinic',
    'Community Care Membership',
    'My Pets / pet records',
    'Digital vaccination certificates',
    'Donation',
    'BPA updates',
  ];

  return prisma.appShowcase.upsert({
    where: { appKey: 'bpa' },
    update: {
      ...data,
      features: { create: features.map((label, i) => ({ label, sortOrder: i })) },
      platforms: {
        create: [
          { platform: 'ANDROID', availability: 'COMING_SOON', sortOrder: 0 },
          { platform: 'IOS', availability: 'COMING_SOON', sortOrder: 1 },
        ],
      },
    },
    create: {
      appKey: 'bpa',
      ...data,
      features: { create: features.map((label, i) => ({ label, sortOrder: i })) },
      platforms: {
        create: [
          { platform: 'ANDROID', availability: 'COMING_SOON', sortOrder: 0 },
          { platform: 'IOS', availability: 'COMING_SOON', sortOrder: 1 },
        ],
      },
    },
    include: { features: true, platforms: true },
  });
}

async function upsertFurtailApp() {
  const existing = await prisma.appShowcase.findUnique({ where: { appKey: 'furtail' } });
  const data = {
    name: 'Furtail',
    tagline: 'A connected pet community and digital pet-care platform.',
    description: 'Furtail is a companion platform for pet profiles, adoption, fundraising, and community features.',
    // Neutral, configurable relationship wording — no ownership/legal claim.
    relationshipLabel: 'Connected with the BPA digital ecosystem',
    iconMediaId: null,
    isActive: true,
    sortOrder: 1,
  };

  if (existing) {
    await prisma.appShowcaseFeature.deleteMany({ where: { appShowcaseId: existing.id } });
    await prisma.appShowcasePlatformLink.deleteMany({ where: { appShowcaseId: existing.id } });
  }

  const features = ['Pet profiles & registry', 'Adoption listings', 'Fundraising', 'Rescue & community reporting', 'Pet social/community feed'];

  return prisma.appShowcase.upsert({
    where: { appKey: 'furtail' },
    update: {
      ...data,
      features: { create: features.map((label, i) => ({ label, sortOrder: i })) },
      platforms: {
        create: [
          { platform: 'ANDROID', availability: 'COMING_SOON', sortOrder: 0 },
          { platform: 'IOS', availability: 'COMING_SOON', sortOrder: 1 },
        ],
      },
    },
    create: {
      appKey: 'furtail',
      ...data,
      features: { create: features.map((label, i) => ({ label, sortOrder: i })) },
      platforms: {
        create: [
          { platform: 'ANDROID', availability: 'COMING_SOON', sortOrder: 0 },
          { platform: 'IOS', availability: 'COMING_SOON', sortOrder: 1 },
        ],
      },
    },
    include: { features: true, platforms: true },
  });
}

// ─── Governance & Public Documents ─────────────────────────────────
// Only real, already-published, already-live bpa_web pages are referenced
// (via externalUrl, relative path — no new content invented). No
// constitution/registration/audit documents exist yet — deliberately not
// created; see the report for what an admin needs to upload.
const DOCUMENTS = [
  {
    key: 'privacy-policy',
    titleEn: 'Privacy Policy',
    category: 'POLICY' as const,
    summary: 'How BPA collects, uses, and protects personal information across its platforms.',
    externalUrl: '/privacy-policy',
    sortOrder: 0,
  },
  {
    key: 'terms-of-use',
    titleEn: 'Terms of Use',
    category: 'POLICY' as const,
    summary: 'The terms governing use of the BPA website and services.',
    externalUrl: '/terms',
    sortOrder: 1,
  },
  {
    key: 'refund-policy',
    titleEn: 'Refund Policy',
    category: 'POLICY' as const,
    summary: 'BPA\'s refund policy for donations, campaign registrations, and paid services.',
    externalUrl: '/refund-policy',
    sortOrder: 2,
  },
];

async function upsertDocuments() {
  const now = new Date();
  const results = [];
  for (const d of DOCUMENTS) {
    const row = await prisma.publicDocument.upsert({
      where: { key: d.key },
      update: { ...d, isActive: true, publishedAt: now },
      create: { ...d, isActive: true, publishedAt: now },
    });
    results.push(row);
  }
  return results;
}

// ─── Featured Clinics ────────────────────────────────────────────
// Existing published organizations only — no new clinic records. Selected
// for data completeness (phones, address, area, services) among currently
// published branches; none have a logo/cover image yet (verified: zero
// published organizations have logoMediaId/logoUrl set), so cards will
// render their built-in placeholder icon rather than a fabricated image.
const FEATURED_CLINIC_ORG_IDS = [
  '3c832a85-fa6b-46f4-949e-480d40845aee', // Bala G Pet Clinic
  '517138b3-45fe-4617-acf9-439114e9c83d', // Bangladesh Pet Association
  'fddf5b10-43a1-4151-be25-372acb9cc00a', // Care & Cure Veterinary Clinic
  '9b9ea7e1-ae15-4430-85ea-d29b2e23e1e7', // Central Veterinary Hospital
  '510dbd27-1791-4d08-a559-3bf1cabc59d2', // Dr. Sagir's Pet Clinic
  'b25c43b3-664b-4c48-9fd3-fcef0f511982', // Teaching & Training Pet Hospital and Research Center
];

async function featureClinics() {
  // Reset first so re-running this script never leaves a stale org featured
  // after the curated list changes.
  await prisma.clinicOrganization.updateMany({ where: { featured: true }, data: { featured: false } });
  const result = await prisma.clinicOrganization.updateMany({
    where: { id: { in: FEATURED_CLINIC_ORG_IDS }, published: true, archivedAt: null },
    data: { featured: true },
  });
  return result.count;
}

async function main() {
  console.log('');
  console.log('============================================================');
  console.log(' BPA Homepage Content Population Seeder');
  console.log('============================================================');

  const programs = await upsertPrograms();
  console.log(`Programs upserted: ${programs.length}`);

  const bpaApp = await upsertBpaApp();
  console.log(`BPA app upserted: ${bpaApp.name} (${bpaApp.platforms.length} platform links, ${bpaApp.features.length} features)`);

  const furtailApp = await upsertFurtailApp();
  console.log(`Furtail app upserted: ${furtailApp.name} (${furtailApp.platforms.length} platform links, ${furtailApp.features.length} features)`);

  const documents = await upsertDocuments();
  console.log(`Documents upserted: ${documents.length}`);

  const featuredCount = await featureClinics();
  console.log(`Clinic organizations marked featured: ${featuredCount}`);

  console.log('');
  console.log('Not populated (no safe/real source data found — see report):');
  console.log('  - Featured videos (0 published video records exist)');
  console.log('  - News/resources (0 published news records exist)');
  console.log('  - Governance/registration/constitution documents (none uploaded yet)');
  console.log('  - App store links (no Android/iOS URLs configured)');
  console.log('  - App screenshots (no screenshot assets in media library)');
}

main()
  .catch((error) => {
    console.error('[HOMEPAGE CONTENT SEED FAILED]', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
