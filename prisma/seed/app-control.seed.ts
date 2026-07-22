import { PrismaClient } from '@prisma/client';

const HOME_SECTIONS = [
  {
    title: 'HERO_SLIDER',
    subtitle: 'Hero Slider',
    description: 'Top-of-home promotional carousel and current priority messaging.',
    ctaText: null,
    destinationType: 'NONE',
    destinationValue: null,
    sortOrder: 0,
    isActive: true,
    status: 'published',
  },
  {
    title: 'QUICK_ACTIONS',
    subtitle: 'Quick Actions',
    description: 'Primary shortcuts for app users.',
    ctaText: null,
    destinationType: 'NONE',
    destinationValue: null,
    sortOrder: 1,
    isActive: true,
    status: 'published',
  },
  {
    title: 'ACTIVE_CAMPAIGNS',
    subtitle: 'Active Campaigns',
    description: 'Current campaigns and participation opportunities.',
    ctaText: 'View Campaigns',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 2,
    isActive: true,
    status: 'published',
  },
  {
    title: 'MEMBERSHIP_OFFER',
    subtitle: 'Membership Offer',
    description: 'Membership benefits and onboarding entry point.',
    ctaText: 'Explore Membership',
    destinationType: 'MEMBERSHIP',
    destinationValue: 'community_membership',
    sortOrder: 3,
    isActive: true,
    status: 'published',
  },
  {
    title: 'DONATION_CTA',
    subtitle: 'Support BPA',
    description: 'Donation-focused home callout block.',
    ctaText: 'Donate Now',
    destinationType: 'DONATION',
    destinationValue: 'general_fund',
    sortOrder: 4,
    isActive: true,
    status: 'published',
  },
  {
    title: 'PET_CENSUS_CTA',
    subtitle: 'Pet Census',
    description: 'Encourage pet census enrollment from the home screen.',
    ctaText: 'Join Census',
    destinationType: 'PET_CENSUS',
    destinationValue: 'pet_census_2026',
    sortOrder: 5,
    isActive: true,
    status: 'published',
  },
  {
    title: 'FEATURED_SERVICES',
    subtitle: 'Featured Services',
    description: 'Highlighted app services and partner offerings.',
    ctaText: null,
    destinationType: 'NONE',
    destinationValue: null,
    sortOrder: 6,
    isActive: true,
    status: 'published',
  },
  {
    title: 'OFFERS',
    subtitle: 'Offers & Promotions',
    description: 'Time-bound offers and promotional content.',
    ctaText: null,
    destinationType: 'NONE',
    destinationValue: null,
    sortOrder: 7,
    isActive: true,
    status: 'published',
  },
  {
    title: 'LATEST_UPDATES',
    subtitle: 'Latest Updates',
    description: 'Recent announcements and content updates.',
    ctaText: 'View Updates',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'app_dashboard',
    sortOrder: 8,
    isActive: true,
    status: 'published',
  },
  {
    title: 'PARTNER_CLINICS',
    subtitle: 'Partner Clinics',
    description: 'Partner clinic discovery and care access.',
    ctaText: 'Find Clinics',
    destinationType: 'SERVICE',
    destinationValue: 'partner_clinics',
    sortOrder: 9,
    isActive: true,
    status: 'published',
  },
  {
    title: 'EMERGENCY_NOTICE',
    subtitle: 'Emergency Notice',
    description: 'Reserved slot for emergency or urgent notices.',
    ctaText: null,
    destinationType: 'NONE',
    destinationValue: null,
    sortOrder: 10,
    isActive: false,
    status: 'draft',
  },
] as const;

const NAV_ITEMS = [
  {
    title: 'Home',
    subtitle: null,
    description: 'Main app home entry.',
    ctaText: null,
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'app_dashboard',
    sortOrder: 0,
    isActive: true,
    status: 'published',
  },
  {
    title: 'Campaigns',
    subtitle: null,
    description: 'Browse active campaigns.',
    ctaText: null,
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 1,
    isActive: true,
    status: 'published',
  },
  {
    title: 'Membership',
    subtitle: null,
    description: 'Community membership program.',
    ctaText: null,
    destinationType: 'MEMBERSHIP',
    destinationValue: 'community_membership',
    sortOrder: 2,
    isActive: true,
    status: 'published',
  },
  {
    title: 'Donate',
    subtitle: null,
    description: 'Support donation flows.',
    ctaText: null,
    destinationType: 'DONATION',
    destinationValue: 'general_fund',
    sortOrder: 3,
    isActive: true,
    status: 'published',
  },
  {
    title: 'Pet Census',
    subtitle: null,
    description: 'Pet census participation.',
    ctaText: null,
    destinationType: 'PET_CENSUS',
    destinationValue: 'pet_census_2026',
    sortOrder: 4,
    isActive: true,
    status: 'published',
  },
] as const;

const PAGE_CONTENT_KEYS = [
  'app_dashboard',
  'home_page_builder',
  'banners_sliders',
  'quick_actions',
  'featured_services',
  'campaign_blocks',
  'offers_promotions',
  'page_cms',
  'app_navigation',
  'theme_branding',
  'push_notifications',
  'popup_notice',
  'version_control',
  'maintenance_mode',
  'audit_logs',
] as const;

const SAMPLE_BANNERS = [
  {
    title: 'Welcome to BPA App',
    subtitle: 'Draft Banner',
    description: 'Sample banner seeded disabled by default for editorial setup.',
    imageUrl: 'https://placehold.co/1200x600?text=BPA+Banner+1',
    mobileImageUrl: 'https://placehold.co/720x960?text=BPA+Banner+1+Mobile',
    ctaText: 'Learn More',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'app_dashboard',
    sortOrder: 0,
    isActive: false,
    status: 'draft',
  },
  {
    title: 'Campaign Spotlight',
    subtitle: 'Draft Banner',
    description: 'Second sample banner seeded disabled by default.',
    imageUrl: 'https://placehold.co/1200x600?text=BPA+Banner+2',
    mobileImageUrl: 'https://placehold.co/720x960?text=BPA+Banner+2+Mobile',
    ctaText: 'View Campaigns',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'campaign_blocks',
    sortOrder: 1,
    isActive: false,
    status: 'draft',
  },
] as const;

const HOME_SECTION_IDS: Record<(typeof HOME_SECTIONS)[number]['title'], string> = {
  HERO_SLIDER: '10000000-0000-0000-0000-000000000101',
  QUICK_ACTIONS: '10000000-0000-0000-0000-000000000102',
  ACTIVE_CAMPAIGNS: '10000000-0000-0000-0000-000000000103',
  MEMBERSHIP_OFFER: '10000000-0000-0000-0000-000000000104',
  DONATION_CTA: '10000000-0000-0000-0000-000000000105',
  PET_CENSUS_CTA: '10000000-0000-0000-0000-000000000106',
  FEATURED_SERVICES: '10000000-0000-0000-0000-000000000107',
  OFFERS: '10000000-0000-0000-0000-000000000108',
  LATEST_UPDATES: '10000000-0000-0000-0000-000000000109',
  PARTNER_CLINICS: '10000000-0000-0000-0000-000000000110',
  EMERGENCY_NOTICE: '10000000-0000-0000-0000-000000000111',
};

const NAV_ITEM_IDS: Record<(typeof NAV_ITEMS)[number]['title'], string> = {
  Home: '10000000-0000-0000-0000-000000000201',
  Campaigns: '10000000-0000-0000-0000-000000000202',
  Membership: '10000000-0000-0000-0000-000000000203',
  Donate: '10000000-0000-0000-0000-000000000204',
  'Pet Census': '10000000-0000-0000-0000-000000000205',
};

const PAGE_CONTENT_IDS: Record<(typeof PAGE_CONTENT_KEYS)[number], string> = {
  app_dashboard: '10000000-0000-0000-0000-000000000301',
  home_page_builder: '10000000-0000-0000-0000-000000000302',
  banners_sliders: '10000000-0000-0000-0000-000000000303',
  quick_actions: '10000000-0000-0000-0000-000000000304',
  featured_services: '10000000-0000-0000-0000-000000000305',
  campaign_blocks: '10000000-0000-0000-0000-000000000306',
  offers_promotions: '10000000-0000-0000-0000-000000000307',
  page_cms: '10000000-0000-0000-0000-000000000308',
  app_navigation: '10000000-0000-0000-0000-000000000309',
  theme_branding: '10000000-0000-0000-0000-000000000310',
  push_notifications: '10000000-0000-0000-0000-000000000311',
  popup_notice: '10000000-0000-0000-0000-000000000312',
  version_control: '10000000-0000-0000-0000-000000000313',
  maintenance_mode: '10000000-0000-0000-0000-000000000314',
  audit_logs: '10000000-0000-0000-0000-000000000315',
};

const BANNER_IDS: Record<(typeof SAMPLE_BANNERS)[number]['title'], string> = {
  'Welcome to BPA App': '10000000-0000-0000-0000-000000000401',
  'Campaign Spotlight': '10000000-0000-0000-0000-000000000402',
};

export async function seedAppControl(prisma: PrismaClient) {
  let homeSections = 0;
  let navigationItems = 0;
  let pageContents = 0;
  let banners = 0;

  for (const section of HOME_SECTIONS) {
    await prisma.appHomeSection.upsert({
      where: { id: HOME_SECTION_IDS[section.title] },
      update: { ...section, updatedById: null },
      create: {
        id: HOME_SECTION_IDS[section.title],
        ...section,
        createdById: null,
        updatedById: null,
      },
    });
    homeSections++;
  }

  for (const nav of NAV_ITEMS) {
    await prisma.appNavigationItem.upsert({
      where: { id: NAV_ITEM_IDS[nav.title] },
      update: { ...nav, updatedById: null },
      create: {
        id: NAV_ITEM_IDS[nav.title],
        ...nav,
        createdById: null,
        updatedById: null,
      },
    });
    navigationItems++;
  }

  for (const key of PAGE_CONTENT_KEYS) {
    await prisma.appPageContent.upsert({
      where: { id: PAGE_CONTENT_IDS[key] },
      update: {
        title: key,
        subtitle: key.replace(/_/g, ' '),
        description: `Default page content placeholder for ${key}.`,
        destinationType: 'INTERNAL_PAGE',
        destinationValue: key,
        sortOrder: 0,
        isActive: key !== 'maintenance_mode',
        status: key !== 'maintenance_mode' ? 'published' : 'draft',
        updatedById: null,
      },
      create: {
        id: PAGE_CONTENT_IDS[key],
        title: key,
        subtitle: key.replace(/_/g, ' '),
        description: `Default page content placeholder for ${key}.`,
        destinationType: 'INTERNAL_PAGE',
        destinationValue: key,
        sortOrder: 0,
        isActive: key !== 'maintenance_mode',
        status: key !== 'maintenance_mode' ? 'published' : 'draft',
        createdById: null,
        updatedById: null,
      },
    });
    pageContents++;
  }

  await prisma.appVersionSetting.upsert({
    where: { id: '10000000-0000-0000-0000-000000000001' },
    update: {
      title: 'Default App Version',
      subtitle: 'Initial version policy',
      description: 'Initial version settings for mobile bootstrap responses.',
      minimumVersion: '1.0.0',
      latestVersion: '1.0.0',
      forceUpdate: false,
      releaseNotes: 'Initial public app release.',
      ctaText: 'Update app',
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: true,
      status: 'published',
      updatedById: null,
    },
    create: {
      id: '10000000-0000-0000-0000-000000000001',
      title: 'Default App Version',
      subtitle: 'Initial version policy',
      description: 'Initial version settings for mobile bootstrap responses.',
      minimumVersion: '1.0.0',
      latestVersion: '1.0.0',
      forceUpdate: false,
      releaseNotes: 'Initial public app release.',
      ctaText: 'Update app',
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: true,
      status: 'published',
      createdById: null,
      updatedById: null,
    },
  });

  await prisma.appThemeSetting.upsert({
    where: { id: '10000000-0000-0000-0000-000000000002' },
    update: {
      title: 'Bangladesh Pet Association',
      subtitle: 'Care • Compassion • Community',
      description: 'Bangladesh Pet Association',
      primaryColor: '#0B7A2A',
      secondaryColor: '#0B7A2A',
      accentColor: '#F5B82E',
      fontFamily: null,
      logoUrl: null,
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: true,
      status: 'published',
      updatedById: null,
    },
    create: {
      id: '10000000-0000-0000-0000-000000000002',
      title: 'Bangladesh Pet Association',
      subtitle: 'Care • Compassion • Community',
      description: 'Bangladesh Pet Association',
      primaryColor: '#0B7A2A',
      secondaryColor: '#0B7A2A',
      accentColor: '#F5B82E',
      fontFamily: null,
      logoUrl: null,
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: true,
      status: 'published',
      createdById: null,
      updatedById: null,
    },
  });

  await prisma.appPopupNotice.upsert({
    where: { id: '10000000-0000-0000-0000-000000000003' },
    update: {
      title: 'Default Popup Notice',
      subtitle: 'Disabled by default',
      description: 'Seeded popup record for future editorial use.',
      ctaText: 'Dismiss',
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: false,
      status: 'draft',
      updatedById: null,
    },
    create: {
      id: '10000000-0000-0000-0000-000000000003',
      title: 'Default Popup Notice',
      subtitle: 'Disabled by default',
      description: 'Seeded popup record for future editorial use.',
      ctaText: 'Dismiss',
      destinationType: 'NONE',
      destinationValue: null,
      sortOrder: 0,
      isActive: false,
      status: 'draft',
      createdById: null,
      updatedById: null,
    },
  });

  for (const banner of SAMPLE_BANNERS) {
    await prisma.appBanner.upsert({
      where: { id: BANNER_IDS[banner.title] },
      update: { ...banner, updatedById: null },
      create: {
        id: BANNER_IDS[banner.title],
        ...banner,
        createdById: null,
        updatedById: null,
      },
    });
    banners++;
  }

  return {
    homeSections,
    navigationItems,
    pageContents,
    banners,
    versionSettings: 1,
    themeSettings: 1,
    popupNotices: 1,
    maintenanceDisabled: true,
  };
}
