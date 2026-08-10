import { PrismaClient } from '@prisma/client';

export const PLATFORM_SHOWCASE_SECTION_KEY = 'digital-ecosystem';

export const PLATFORM_SHOWCASE_ITEMS = [
  {
    platformKey: 'bpa-app',
    brandKey: 'bpa',
    platformType: 'APP' as const,
    name: 'Bangladesh Pet Association App',
    badgeText: 'Official BPA App',
    heading: 'Bangladesh Pet Association App',
    description: 'Access BPA campaigns, pet-care services, and community programs in one place.',
    featureBullets: [
      'Vaccination Campaign Registration',
      'Find a Clinic',
      'Spay & Neuter Booking',
      'Community Care Membership',
      'My Pets & Pet Records',
      'Digital Vaccination Certificates',
      'Donation',
      'BPA Updates',
    ],
    featured: true,
    sortOrder: 0,
  },
  {
    platformKey: 'furtail-app',
    brandKey: 'furtail',
    platformType: 'APP' as const,
    name: 'Furtail App',
    badgeText: 'Coming Soon',
    heading: 'Furtail App',
    description: 'Draft placeholder for the Furtail mobile app. Add approved content, media, and store links before publishing.',
    featureBullets: [],
    featured: false,
    sortOrder: 1,
  },
  {
    platformKey: 'furtail-website',
    brandKey: 'furtail',
    platformType: 'WEBSITE' as const,
    name: 'Furtail Website',
    badgeText: 'Coming Soon',
    heading: 'Furtail Website',
    description: 'Draft placeholder for the Furtail website. Add approved content, media, and a verified website URL before publishing.',
    featureBullets: [],
    featured: false,
    sortOrder: 2,
  },
  {
    platformKey: 'wpa-website',
    brandKey: 'wpa',
    platformType: 'WEBSITE' as const,
    name: 'WPA Website',
    badgeText: 'Coming Soon',
    heading: 'WPA Website',
    description: 'Draft placeholder for the WPA website. Add approved content, media, and a verified website URL before publishing.',
    featureBullets: [],
    featured: false,
    sortOrder: 3,
  },
] as const;

/**
 * Creates initial editorial drafts only. Existing rows are intentionally left
 * unchanged so re-running the master seed cannot overwrite admin-authored work.
 */
export async function seedPlatformShowcases(prisma: PrismaClient) {
  const section = await prisma.platformShowcaseSection.upsert({
    where: { key: PLATFORM_SHOWCASE_SECTION_KEY },
    update: {},
    create: {
      key: PLATFORM_SHOWCASE_SECTION_KEY,
      eyebrow: 'BPA Digital Ecosystem',
      title: 'Platforms connected to better pet care',
      description: 'Draft showcase content for BPA and related digital platforms.',
      layout: 'PREVIEW_LEFT',
      theme: 'default',
      status: 'draft',
      isActive: true,
      sortOrder: 0,
      logoMediaId: null,
    },
  });

  let created = 0;
  for (const item of PLATFORM_SHOWCASE_ITEMS) {
    const existing = await prisma.platformShowcaseItem.findUnique({
      where: { sectionId_platformKey: { sectionId: section.id, platformKey: item.platformKey } },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.platformShowcaseItem.create({
      data: {
        sectionId: section.id,
        ...item,
        featureBullets: [...item.featureBullets],
        isActive: true,
        logoMediaId: null,
        primaryPreviewMediaId: null,
        secondaryPreviewMediaId: null,
        previewMode: item.platformType === 'APP' ? 'DEVICE_FRAME' : 'RAW_IMAGE',
      },
    });
    created++;
  }

  return { section: 1, items: PLATFORM_SHOWCASE_ITEMS.length, created };
}
