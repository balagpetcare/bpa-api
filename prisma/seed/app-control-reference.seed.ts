import { PrismaClient } from '@prisma/client';

const QUICK_ACTIONS = [
  {
    id: '10000000-0000-0000-0000-000000000501',
    title: 'Find Clinics',
    subtitle: 'Clinic Directory',
    description: 'Browse the clinic directory.',
    ctaText: 'Explore',
    destinationType: 'SERVICE',
    destinationValue: 'partner_clinics',
    sortOrder: 0,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
  },
  {
    id: '10000000-0000-0000-0000-000000000502',
    title: 'Join Membership',
    subtitle: 'Membership Plans',
    description: 'Open BPA membership plans and campaign details.',
    ctaText: 'View plans',
    destinationType: 'MEMBERSHIP',
    destinationValue: 'community_membership',
    sortOrder: 1,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
  },
  {
    id: '10000000-0000-0000-0000-000000000503',
    title: 'Donate',
    subtitle: 'Support BPA',
    description: 'Open donation flows and transparency content.',
    ctaText: 'Donate',
    destinationType: 'DONATION',
    destinationValue: 'general_fund',
    sortOrder: 2,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
  },
] as const;

const FEATURED_SERVICES = [
  {
    id: '10000000-0000-0000-0000-000000000601',
    title: 'Vaccination Campaigns',
    subtitle: 'Active campaigns',
    description: 'Browse live campaign blocks and upcoming sessions.',
    ctaText: 'Browse campaigns',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 0,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
  },
  {
    id: '10000000-0000-0000-0000-000000000602',
    title: 'Clinic Membership Benefits',
    subtitle: 'Plan-based care',
    description: 'Explore seeded membership benefits and care offerings.',
    ctaText: 'Open membership',
    destinationType: 'MEMBERSHIP',
    destinationValue: 'community_membership',
    sortOrder: 1,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
  },
] as const;

const OFFERS = [
  {
    id: '10000000-0000-0000-0000-000000000701',
    title: 'Founding Membership Offer',
    subtitle: 'Limited offer',
    description: 'Seeded membership offer for app surfaces.',
    ctaText: 'View offer',
    destinationType: 'MEMBERSHIP',
    destinationValue: 'community_membership',
    sortOrder: 0,
    isActive: true,
    status: 'published',
    targetAudience: 'all',
    startsAt: null,
    endsAt: new Date('2027-12-31T23:59:59.000Z'),
  },
] as const;

const TUTORIAL_GUIDES = [
  {
    id: '10000000-0000-0000-0000-000000000801',
    title: 'How vaccination booking works',
    subtitle: 'Campaign guide',
    description: 'Explains campaign discovery, booking, and QR check-in.',
    contentType: 'GUIDE',
    category: 'campaigns',
    language: 'en',
    ctaText: 'Open guide',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 0,
    isActive: true,
    status: 'published',
    publishedAt: new Date('2026-07-22T00:00:00.000Z'),
  },
  {
    id: '10000000-0000-0000-0000-000000000802',
    title: 'How clinic discovery works',
    subtitle: 'Clinic guide',
    description: 'Explains the clinic directory and partner clinic experience.',
    contentType: 'GUIDE',
    category: 'clinics',
    language: 'en',
    ctaText: 'Open guide',
    destinationType: 'SERVICE',
    destinationValue: 'partner_clinics',
    sortOrder: 1,
    isActive: true,
    status: 'published',
    publishedAt: new Date('2026-07-22T00:00:00.000Z'),
  },
] as const;

export async function seedAppControlReferenceData(prisma: PrismaClient) {
  let quickActions = 0;
  let featuredServices = 0;
  let offers = 0;
  let tutorialsGuides = 0;

  for (const item of QUICK_ACTIONS) {
    await prisma.appQuickAction.upsert({
      where: { id: item.id },
      update: { ...item, updatedById: null },
      create: { ...item, createdById: null, updatedById: null },
    });
    quickActions++;
  }

  for (const item of FEATURED_SERVICES) {
    await prisma.appFeaturedService.upsert({
      where: { id: item.id },
      update: { ...item, updatedById: null },
      create: { ...item, createdById: null, updatedById: null },
    });
    featuredServices++;
  }

  for (const item of OFFERS) {
    await prisma.appOffer.upsert({
      where: { id: item.id },
      update: { ...item, updatedById: null },
      create: { ...item, createdById: null, updatedById: null },
    });
    offers++;
  }

  for (const item of TUTORIAL_GUIDES) {
    await prisma.appTutorialGuide.upsert({
      where: { id: item.id },
      update: { ...item, updatedById: null },
      create: { ...item, createdById: null, updatedById: null },
    });
    tutorialsGuides++;
  }

  return { quickActions, featuredServices, offers, tutorialsGuides };
}
