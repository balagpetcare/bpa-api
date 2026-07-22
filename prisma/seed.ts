import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const RESOURCES = [
  // Existing
  'users', 'roles', 'news', 'events', 'committee', 'volunteers', 'contacts',
  'media', 'seo', 'analytics', 'payments', 'members', 'sms_logs', 'email_logs',
  'homepage', 'hero_slides', 'partners', 'footer',
  // Campaign Management
  'locations', 'vaccine_catalog', 'certificate_templates',
  'pet_owners', 'pets', 'doctors',
  'campaigns', 'campaign_sessions', 'campaign_services',
  'campaign_checkin', 'campaign_certificates', 'campaign_analytics',
  'campaign_registrations', 'campaign_waitlist', 'vaccination_records',
  // Community Pet Care
  'community_zones', 'contribution_plans', 'care_contributions',
  'care_partner_cards', 'card_verification_logs',
  'pet_census', 'transparency_reports', 'pet_smart_solution',
  'community_fund_dashboard',
  // Community Care Membership Engine
  'community_membership_program', 'community_membership_tiers',
  'community_membership_services', 'community_membership_discounts',
  'community_membership_benefits', 'community_membership_purchases',
  'community_membership_cards', 'community_membership_upgrades',
  'community_membership_documents', 'community_membership_dashboard',
];

const ACTIONS = [
  'create', 'read', 'update', 'delete', 'publish', 'manage',
  'checkin', 'issue', 'assign', 'lifecycle',
];

async function upsertCityCorp(name: string, districtId: string) {
  const existing = await prisma.cityCorporation.findFirst({ where: { name, districtId } });
  if (existing) return existing;
  return prisma.cityCorporation.create({ data: { name, districtId } });
}

async function upsertZone(name: string, cityCorporationId: string) {
  const existing = await prisma.zone.findFirst({ where: { name, cityCorporationId } });
  if (existing) return existing;
  return prisma.zone.create({ data: { name, cityCorporationId } });
}

async function main(): Promise<void> {
  console.log('Seeding permissions...');
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action },
      });
    }
  }

  console.log('Seeding roles...');
  const allPermissions = await prisma.permission.findMany();

  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: {},
    create: {
      name: 'super_admin',
      description: 'Full system access',
      rolePermissions: { create: allPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const adminResources = [
    'news', 'events', 'committee', 'media', 'seo', 'volunteers', 'contacts', 'analytics',
    'payments', 'members', 'sms_logs', 'email_logs', 'homepage', 'hero_slides', 'partners', 'footer',
    'locations', 'vaccine_catalog', 'certificate_templates',
    'pet_owners', 'pets', 'doctors',
    'campaigns', 'campaign_sessions', 'campaign_services',
    'campaign_checkin', 'campaign_certificates', 'campaign_analytics',
    'community_zones', 'contribution_plans', 'care_contributions',
    'care_partner_cards', 'card_verification_logs',
    'pet_census', 'transparency_reports', 'pet_smart_solution',
    'community_fund_dashboard',
    'community_membership_program', 'community_membership_tiers',
    'community_membership_services', 'community_membership_discounts',
    'community_membership_benefits', 'community_membership_purchases',
    'community_membership_cards', 'community_membership_upgrades',
    'community_membership_documents', 'community_membership_dashboard',
    'community_membership_card_verification',
  ];
  const adminPermissions = allPermissions.filter((p) => adminResources.includes(p.resource));
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'All CMS and campaign modules, no role management',
      rolePermissions: { create: adminPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const editorPermissions = allPermissions.filter(
    (p) => ['news', 'events', 'committee', 'homepage', 'hero_slides', 'partners', 'footer'].includes(p.resource) && ['create', 'read', 'update', 'publish'].includes(p.action),
  );
  const editorRole = await prisma.role.upsert({
    where: { name: 'editor' },
    update: {},
    create: {
      name: 'editor',
      description: 'News, Events, Committee CMS only',
      rolePermissions: { create: editorPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const viewerPermissions = allPermissions.filter((p) => p.action === 'read');
  const viewerRole = await prisma.role.upsert({
    where: { name: 'viewer' },
    update: {},
    create: {
      name: 'viewer',
      description: 'Read-only dashboard access',
      rolePermissions: { create: viewerPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const campaignManagerResources = [
    'locations', 'vaccine_catalog', 'certificate_templates',
    'pet_owners', 'pets', 'doctors',
    'campaigns', 'campaign_sessions', 'campaign_services',
    'campaign_checkin', 'campaign_certificates', 'campaign_analytics',
    'campaign_registrations', 'campaign_waitlist',
    'analytics', 'sms_logs',
  ];
  const campaignManagerActions = ['create', 'read', 'update', 'assign', 'lifecycle', 'checkin', 'issue'];
  const campaignManagerPermissions = allPermissions.filter(
    (p) => campaignManagerResources.includes(p.resource) && campaignManagerActions.includes(p.action),
  );
  const campaignManagerRole = await prisma.role.upsert({
    where: { name: 'campaign_manager' },
    update: {},
    create: {
      name: 'campaign_manager',
      description: 'Campaign management — create, publish, and operate campaigns',
      rolePermissions: { create: campaignManagerPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const campaignVolunteerResources = [
    'campaigns', 'campaign_sessions', 'campaign_checkin', 'campaign_certificates', 'pets', 'pet_owners',
  ];
  const campaignVolunteerActions = ['read', 'checkin', 'issue'];
  const campaignVolunteerPermissions = allPermissions.filter(
    (p) => campaignVolunteerResources.includes(p.resource) && campaignVolunteerActions.includes(p.action),
  );
  const campaignVolunteerRole = await prisma.role.upsert({
    where: { name: 'campaign_volunteer' },
    update: {},
    create: {
      name: 'campaign_volunteer',
      description: 'Campaign volunteer — scan QR, check in, mark vaccinated, issue certificate',
      rolePermissions: { create: campaignVolunteerPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  console.log('Seeding super admin user...');
  // email must be lowercase and identical in where + create, otherwise upsert
  // never matches the row it just created → P2002 on every subsequent run.
  const adminEmail = 'admin@bpa.org';
  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  const superAdminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},   // never overwrite a changed password on re-seed
    create: {
      name: 'BPA Super Admin',
      email: adminEmail,
      passwordHash,
      isActive: true,
    },
  });

  // Upsert role separately so it is idempotent even when the user already existed.
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdminUser.id, roleId: superAdminRole.id },
  });

  console.log('Seeding news categories and tags...');
  const newsCategories = [
    { name: 'Association News', slug: 'association-news' },
    { name: 'Pet Health', slug: 'pet-health' },
    { name: 'Events & Activities', slug: 'events-activities' },
    { name: 'Adoption', slug: 'adoption' },
    { name: 'Announcements', slug: 'announcements' },
  ];
  for (const cat of newsCategories) {
    await prisma.newsCategory.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  const newsTags = [
    { name: 'dogs', slug: 'dogs' }, { name: 'cats', slug: 'cats' },
    { name: 'birds', slug: 'birds' }, { name: 'rabbits', slug: 'rabbits' },
    { name: 'veterinary', slug: 'veterinary' }, { name: 'adoption', slug: 'adoption' },
    { name: 'welfare', slug: 'welfare' }, { name: 'training', slug: 'training' },
  ];
  for (const tag of newsTags) {
    await prisma.newsTag.upsert({ where: { slug: tag.slug }, update: {}, create: tag });
  }

  // ─── Location Hierarchy ───────────────────────────────────────────

  console.log('Seeding location hierarchy...');

  const bangladesh = await prisma.country.upsert({
    where: { code: 'BD' },
    update: {},
    create: { name: 'Bangladesh', code: 'BD' },
  });

  const existingDhakaDivision = await prisma.division.findFirst({ where: { name: 'Dhaka', countryId: bangladesh.id } });
  const dhakaDiv = existingDhakaDivision ?? await prisma.division.create({ data: { name: 'Dhaka', countryId: bangladesh.id } });

  const existingDhakaDistrict = await prisma.district.findFirst({ where: { name: 'Dhaka District', divisionId: dhakaDiv.id } });
  const dhakaDistrict = existingDhakaDistrict ?? await prisma.district.create({ data: { name: 'Dhaka District', divisionId: dhakaDiv.id } });

  const dncc = await upsertCityCorp('DNCC', dhakaDistrict.id);
  const dscc = await upsertCityCorp('DSCC', dhakaDistrict.id);

  const dnccZones = [
    'Zone-1 (Uttara)', 'Zone-2 (Mirpur)', 'Zone-3 (Mohammadpur)', 'Zone-4 (Kafrul)',
    'Zone-5 (Gulshan)', 'Zone-6 (Banani)', 'Zone-7 (Demra)', 'Zone-8 (Sabujbagh)',
    'Zone-9 (Khaijuri)', 'Zone-10 (Cantonment)',
  ];
  for (const name of dnccZones) {
    await upsertZone(name, dncc.id);
  }

  const dsccZones = [
    'Zone-1 (Lalbagh)', 'Zone-2 (Chawkbazar)', 'Zone-3 (Sutrapur)', 'Zone-4 (Motijheel)',
    'Zone-5 (Hazaribagh)', 'Zone-6 (Dhanmondi)', 'Zone-7 (Khilgaon)', 'Zone-8 (Shyampur)',
    'Zone-9 (Kadamtali)', 'Zone-10 (Demra)',
  ];
  for (const name of dsccZones) {
    await upsertZone(name, dscc.id);
  }

  // ─── Community Fund Roles ─────────────────────────────────────────

  const communityFundResources = [
    'community_zones', 'contribution_plans', 'care_contributions',
    'care_partner_cards', 'card_verification_logs',
    'pet_census', 'transparency_reports', 'pet_smart_solution',
    'community_fund_dashboard', 'payments', 'analytics', 'sms_logs',
    'community_membership_program', 'community_membership_tiers',
    'community_membership_services', 'community_membership_discounts',
    'community_membership_benefits', 'community_membership_purchases',
    'community_membership_cards', 'community_membership_upgrades',
    'community_membership_documents', 'community_membership_dashboard',
    'community_membership_card_verification',
  ];
  const communityFundAdminActions = ['create', 'read', 'update', 'delete', 'publish', 'manage'];
  const communityFundAdminPermissions = allPermissions.filter(
    (p) => communityFundResources.includes(p.resource) && communityFundAdminActions.includes(p.action),
  );
  const communityFundAdminRole = await prisma.role.upsert({
    where: { name: 'community_fund_admin' },
    update: {},
    create: {
      name: 'community_fund_admin',
      description: 'Community Pet Care fund — full management of zones, contributions, cards, census, and transparency reports',
      rolePermissions: { create: communityFundAdminPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  const communityFundViewerPermissions = allPermissions.filter(
    (p) => communityFundResources.includes(p.resource) && p.action === 'read',
  );
  const communityFundViewerRole = await prisma.role.upsert({
    where: { name: 'community_fund_viewer' },
    update: {},
    create: {
      name: 'community_fund_viewer',
      description: 'Community Pet Care fund — read-only dashboard access',
      rolePermissions: { create: communityFundViewerPermissions.map((p) => ({ permissionId: p.id })) },
    },
  });

  void communityFundAdminRole; void communityFundViewerRole;

  // ─── Vaccine Catalog ──────────────────────────────────────────────

  console.log('Seeding vaccine catalog...');
  const vaccines = [
    { name: 'Rabies Vaccine', species: 'all', standardIntervalDays: 365, manufacturer: 'Merial', description: 'Annual rabies vaccination for dogs and cats' },
    { name: 'FVRCP Combo', species: 'cat', standardIntervalDays: 365, manufacturer: 'Zoetis', description: 'Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia' },
    { name: 'DHPPiL Combo', species: 'dog', standardIntervalDays: 365, manufacturer: 'Merck', description: 'Distemper, Hepatitis, Parvovirus, Parainfluenza, Leptospira' },
    { name: 'Deworming', species: 'all', standardIntervalDays: 90, manufacturer: null, description: 'Broad-spectrum deworming treatment' },
    { name: 'Bordetella', species: 'dog', standardIntervalDays: 365, manufacturer: null, description: 'Kennel cough prevention (Bordetella bronchiseptica)' },
  ];
  for (const v of vaccines) {
    const existing = await prisma.vaccineCatalog.findFirst({ where: { name: v.name } });
    if (!existing) await prisma.vaccineCatalog.create({ data: v });
  }

  // ─── Contribution Plan ────────────────────────────────────────────

  console.log('Seeding contribution plan...');
  const LEGAL_DISCLAIMER = [
    'This Care Partner Card is a contribution recognition and community service benefit card only.',
    'It does not represent ownership, equity, profit-sharing, or any form of investment in BPA or any clinic.',
    'Discounts on products, medicines, food, accessories, or any third-party costs are not guaranteed.',
    'Benefits are subject to availability and BPA policy at the time of service.',
  ].join(' ');

  await prisma.contributionPlan.upsert({
    where: { slug: 'standard-care-partner-3000' },
    update: {},
    create: {
      title: 'Standard Care Partner',
      slug: 'standard-care-partner-3000',
      contributionType: 'care_partner',
      amountBdt: 3000,
      currency: 'BDT',
      description: 'Contribute ৳3,000 to support the establishment of BPA Community 24/7 Pet Clinics in Dhaka. Your contribution helps provide accessible veterinary care for all pets regardless of owner income.',
      benefitsSummaryJson: [
        'Priority service access at BPA Community Pet Clinics (subject to availability)',
        'Digital Care Partner Card with QR verification',
        'Recognition as a founding Care Partner of BPA Community Pet Clinics',
        'Annual transparency report on fund utilisation',
      ],
      legalDisclaimerText: LEGAL_DISCLAIMER,
      isActive: true,
      sortOrder: 0,
    },
  });

  // ─── Community Zones (8 Dhaka Zones) ─────────────────────────────

  console.log('Seeding community zones...');
  const communityZones = [
    {
      name: 'Zone 1 – Uttara & Turag',
      slug: 'zone-1-uttara-turag',
      description: 'Covering Uttara, Turag, and surrounding areas of northern Dhaka.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 1,
    },
    {
      name: 'Zone 2 – Mirpur & Pallabi',
      slug: 'zone-2-mirpur-pallabi',
      description: 'Covering Mirpur, Pallabi, Kafrul, and Shah Ali areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 2,
    },
    {
      name: 'Zone 3 – Mohammadpur & Adabor',
      slug: 'zone-3-mohammadpur-adabor',
      description: 'Covering Mohammadpur, Adabor, Sher-e-Bangla Nagar, and Shyamoli areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 3,
    },
    {
      name: 'Zone 4 – Gulshan & Banani',
      slug: 'zone-4-gulshan-banani',
      description: 'Covering Gulshan, Banani, Baridhara, and Niketon areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 4,
    },
    {
      name: 'Zone 5 – Dhanmondi & Kalabagan',
      slug: 'zone-5-dhanmondi-kalabagan',
      description: 'Covering Dhanmondi, Kalabagan, Hazaribagh, and Lalbagh areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 5,
    },
    {
      name: 'Zone 6 – Rampura & Badda',
      slug: 'zone-6-rampura-badda',
      description: 'Covering Rampura, Badda, Khilgaon, and Bashabo areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 6,
    },
    {
      name: 'Zone 7 – Motijheel & Wari',
      slug: 'zone-7-motijheel-wari',
      description: 'Covering Motijheel, Wari, Sutrapur, and Kotwali areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 7,
    },
    {
      name: 'Zone 8 – Demra & Shyampur',
      slug: 'zone-8-demra-shyampur',
      description: 'Covering Demra, Shyampur, Kadamtali, and Jatrabari areas.',
      city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
      sortOrder: 8,
    },
  ];

  for (const zone of communityZones) {
    await prisma.communityZone.upsert({
      where: { slug: zone.slug },
      update: {},
      create: {
        ...zone,
        targetContributors: 10000,
        currentContributors: 0,
        targetAmountBdt: 30000000, // 10,000 × ৳3,000
        currentAmountBdt: 0,
        status: 'active',
        isActive: true,
      },
    });
  }

  // ─── Pet Smart Solution Placeholder Settings ──────────────────────

  console.log('Seeding Pet Smart Solution placeholder settings...');
  const pssSettings = [
    { settingKey: 'PSS_API_BASE_URL', description: 'Future Pet Smart Solution API base URL', isSecret: false },
    { settingKey: 'PSS_API_KEY', description: 'Pet Smart Solution API key (keep secret)', isSecret: true },
    { settingKey: 'PSS_SYNC_ENABLED', description: 'Master toggle — set to true to enable sync', isSecret: false },
    { settingKey: 'PSS_SYNC_ENTITIES', description: 'Comma-separated entity types to sync (e.g. care_partner_card)', isSecret: false },
    { settingKey: 'PSS_WEBHOOK_SECRET', description: 'Incoming webhook signature secret from Pet Smart Solution', isSecret: true },
  ];
  for (const s of pssSettings) {
    await prisma.petSmartSyncSetting.upsert({
      where: { settingKey: s.settingKey },
      update: {},
      create: { settingKey: s.settingKey, description: s.description, isSecret: s.isSecret, isActive: false, status: 'not_configured' },
    });
  }

  console.log('─────────────────────────────────────────────');
  console.log('Seed complete.');
  console.log('Roles: super_admin, admin, editor, viewer, campaign_manager, campaign_volunteer');
  console.log(`Default admin: ${adminEmail} / Admin@1234`);
  console.log(`Location: Bangladesh › Dhaka › Dhaka District › DNCC (10 zones) + DSCC (10 zones)`);
  console.log(`Vaccines seeded: ${vaccines.length}`);

  void adminRole; void editorRole; void viewerRole; void campaignManagerRole; void campaignVolunteerRole;

  // ─── Community Care Membership Engine ────────────────────────────

  console.log('Seeding Community Care Membership Program...');

  await prisma.communityMembershipProgram.upsert({
    where: { id: 'default' },
    update: {
      nameEn: 'BPA Community Care Partner Card Program',
      nameBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রাম',
      slug: 'community-care-partner-card',
      descriptionEn: 'Join BPA Community Care Partner Card Program and get exclusive benefits for your pets.',
      descriptionBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রামে যোগ দিন এবং আপনার পোষা প্রাণীর জন্য এক্সক্লুসিভ সুবিধা পান।',
      cardValidityLabel: '5-Year Card Validity',
      legalDisclaimer: 'BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return. Service discounts and third-party benefits are subject to availability and partner terms. Clinic zone establishment is subject to sufficient member demand and BPA operational planning.',
    },
    create: {
      id: 'default',
      nameEn: 'BPA Community Care Partner Card Program',
      nameBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রাম',
      slug: 'community-care-partner-card',
      descriptionEn: 'Join BPA Community Care Partner Card Program and get exclusive benefits for your pets.',
      descriptionBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রামে যোগ দিন এবং আপনার পোষা প্রাণীর জন্য এক্সক্লুসিভ সুবিধা পান।',
      offerStartAt: new Date('2026-01-01'),
      offerEndAt: new Date('2027-12-31'),
      priceAfterOffer: 'USE_REGULAR_PRICE',
      offerBannerEn: 'Founding Member Offer — Limited Time!',
      offerBannerBn: 'প্রতিষ্ঠাতা সদস্য অফার — সীমিত সময়!',
      cardValidityLabel: '5-Year Card Validity',
      legalDisclaimer: 'BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return. Service discounts and third-party benefits are subject to availability and partner terms. Clinic zone establishment is subject to sufficient member demand and BPA operational planning.',
      isActive: true,
    },
  });

  // ─── Tiers ────────────────────────────────────────────────────────

  console.log('Seeding membership tiers...');

  const primaryTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'primary' },
    update: { validityMonths: 60 },
    create: {
      nameEn: 'Primary Card', nameBn: 'প্রাইমারি কার্ড', slug: 'primary',
      launchPriceBdt: 3000, regularPriceBdt: 10000,
      petLimitMin: 1, petLimitMax: 3, validityMonths: 60,
      badgeTextEn: 'Best Value', badgeTextBn: 'সেরা মূল্য',
      shortDescEn: 'Essential care for up to 3 pets with core benefits and service discounts.',
      shortDescBn: '৩টি পোষা প্রাণীর জন্য প্রয়োজনীয় যত্ন ও পরিষেবা ছাড়।',
      fullDescEn: 'The Primary Card is perfect for pet owners with up to 3 pets. Enjoy core veterinary services, diagnostics discounts, and digital membership benefits.',
      fullDescBn: 'প্রাইমারি কার্ডটি ৩টি পর্যন্ত পোষা প্রাণীর মালিকদের জন্য উপযুক্ত। মূল ভেটেরিনারি পরিষেবা, ডায়াগনস্টিক ছাড় এবং ডিজিটাল সদস্যপদ সুবিধা উপভোগ করুন।',
      cardTheme: 'primary', isActive: true, sortOrder: 1,
    },
  });

  const premiumTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'premium' },
    update: { validityMonths: 60 },
    create: {
      nameEn: 'Premium Card', nameBn: 'প্রিমিয়াম কার্ড', slug: 'premium',
      launchPriceBdt: 5000, regularPriceBdt: 18000,
      petLimitMin: 7, petLimitMax: 10, validityMonths: 60,
      badgeTextEn: 'Most Popular', badgeTextBn: 'সবচেয়ে জনপ্রিয়',
      shortDescEn: 'Extended care for up to 10 pets with premium discounts and priority services.',
      shortDescBn: '১০টি পোষা প্রাণীর জন্য বর্ধিত যত্ন ও প্রিমিয়াম ছাড়।',
      fullDescEn: 'The Premium Card offers comprehensive coverage for households with up to 10 pets. Includes higher service discounts, priority clinic access, and exclusive social impact program participation.',
      fullDescBn: 'প্রিমিয়াম কার্ডটি ১০টি পর্যন্ত পোষা প্রাণীর জন্য ব্যাপক কভারেজ অফার করে। উচ্চতর পরিষেবা ছাড়, অগ্রাধিকার ক্লিনিক অ্যাক্সেস এবং এক্সক্লুসিভ সামাজিক প্রভাব প্রোগ্রাম অন্তর্ভুক্ত।',
      cardTheme: 'premium', isActive: true, sortOrder: 2,
    },
  });

  const enterpriseTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'enterprise' },
    update: { validityMonths: 60 },
    create: {
      nameEn: 'Enterprise Card', nameBn: 'এন্টারপ্রাইজ কার্ড', slug: 'enterprise',
      launchPriceBdt: 10000, regularPriceBdt: 30000,
      petLimitMin: 20, petLimitMax: 50, validityMonths: 60,
      badgeTextEn: 'Ultimate Care', badgeTextBn: 'আল্টিমেট কেয়ার',
      shortDescEn: 'Maximum coverage for 20-50 pets with highest discounts and VIP services.',
      shortDescBn: '২০-৫০টি পোষা প্রাণীর জন্য সর্বোচ্চ কভারেজ ও ভিআইপি পরিষেবা।',
      fullDescEn: 'The Enterprise Card is designed for breeders, shelters, and multi-pet households. Features maximum service discounts, VIP clinic access, dedicated support, and all future platform benefits.',
      fullDescBn: 'এন্টারপ্রাইজ কার্ডটি ব্রিডার, শেল্টার এবং বহু-পোষা পরিবারের জন্য ডিজাইন করা হয়েছে। সর্বোচ্চ পরিষেবা ছাড়, ভিআইপি ক্লিনিক অ্যাক্সেস এবং সমস্ত ভবিষ্যত প্ল্যাটফর্ম সুবিধা রয়েছে।',
      cardTheme: 'enterprise', isActive: true, sortOrder: 3,
    },
  });

  // ─── Services ──────────────────────────────────────────────────────

  console.log('Seeding membership services...');

  const serviceData = [
    { nameEn: 'General Checkup', nameBn: 'সাধারণ চেকআপ', category: 'HEALTH_CHECKUP' as const, basePriceBdt: 500 },
    { nameEn: 'Vaccination', nameBn: 'টিকা', category: 'VACCINATION' as const, basePriceBdt: 800 },
    { nameEn: 'Deworming', nameBn: 'কৃমিনাশক', category: 'DEWORMING' as const, basePriceBdt: 300 },
    { nameEn: 'Microchipping', nameBn: 'মাইক্রোচিপিং', category: 'MICROCHIP' as const, basePriceBdt: 1000 },
    { nameEn: 'Blood Test', nameBn: 'রক্ত পরীক্ষা', category: 'LAB_TEST' as const, basePriceBdt: 1200 },
    { nameEn: 'X-Ray', nameBn: 'এক্স-রে', category: 'IMAGING' as const, basePriceBdt: 1500 },
    { nameEn: 'Ultrasound', nameBn: 'আল্ট্রাসাউন্ড', category: 'IMAGING' as const, basePriceBdt: 2000 },
    { nameEn: 'Surgery', nameBn: 'অপারেশন', category: 'SURGERY' as const, basePriceBdt: 5000 },
    { nameEn: 'Grooming', nameBn: 'গ্রুমিং', category: 'GROOMING' as const, basePriceBdt: 600 },
    { nameEn: 'Emergency Care', nameBn: 'জরুরি সেবা', category: 'EMERGENCY' as const, basePriceBdt: 3000 },
  ];

  const serviceIds: string[] = [];
  for (const s of serviceData) {
    const existing = await prisma.communityMembershipService.findFirst({ where: { nameEn: s.nameEn } });
    if (existing) { serviceIds.push(existing.id); continue; }
    const created = await prisma.communityMembershipService.create({
      data: { ...s, sortOrder: serviceData.indexOf(s) + 1 },
    });
    serviceIds.push(created.id);
  }

  // ─── Discounts ─────────────────────────────────────────────────────

  console.log('Seeding tier service discounts...');

  const services = await prisma.communityMembershipService.findMany({ where: { isActive: true } });
  const discountConfig = [
    { tierId: primaryTier.id, discountType: 'PERCENTAGE' as const, discountValue: 15, minDiscount: null, maxDiscount: null },
    { tierId: premiumTier.id, discountType: 'PERCENTAGE' as const, discountValue: 20, minDiscount: null, maxDiscount: null },
    { tierId: enterpriseTier.id, discountType: 'PERCENTAGE' as const, discountValue: 25, minDiscount: null, maxDiscount: null },
  ];

  for (const svc of services) {
    for (const cfg of discountConfig) {
      await prisma.communityTierServiceDiscount.upsert({
        where: { tierId_serviceId: { tierId: cfg.tierId, serviceId: svc.id } },
        update: { discountValue: cfg.discountValue },
        create: {
          tierId: cfg.tierId, serviceId: svc.id,
          discountType: cfg.discountType, discountValue: cfg.discountValue,
          minDiscount: cfg.minDiscount, maxDiscount: cfg.maxDiscount,
        },
      });
    }
  }

  // ─── Benefits ─────────────────────────────────────────────────────

  console.log('Seeding tier benefits...');

  // Clear existing tier benefit mappings to start fresh
  await prisma.communityTierBenefitMapping.deleteMany({
    where: {
      tierId: { in: [primaryTier.id, premiumTier.id, enterpriseTier.id] },
    },
  });

  // Delete old benefits that don't match our new naming
  const oldBenefitTitles = [
    'Digital Membership Card',
    'Service Discounts',
    'Priority Clinic Access',
    'Free Health Checkup',
    'VIP Support Line',
    'Event Priority Registration',
    'PDF Membership Document',
  ];
  for (const title of oldBenefitTitles) {
    const old = await prisma.communityMembershipBenefit.findFirst({ where: { titleEn: title } });
    if (old) {
      await prisma.communityTierBenefitMapping.deleteMany({ where: { benefitId: old.id } });
      await prisma.communityMembershipBenefit.delete({ where: { id: old.id } });
    }
  }

  // ── Primary benefits ──
  const primaryBenefits = [
    { titleEn: 'Digital BPA Community Care Partner Card', titleBn: 'ডিজিটাল বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড', icon: 'mdi:card-account-details' },
    { titleEn: 'QR Code Verification', titleBn: 'কিউআর কোড ভেরিফিকেশন', icon: 'mdi:qrcode' },
    { titleEn: 'Preferred Clinic Zone Vote', titleBn: 'পছন্দের ক্লিনিক জোন ভোট', icon: 'mdi:vote-outline' },
    { titleEn: 'Partner Clinic Service Discounts', titleBn: 'পার্টনার ক্লিনিক সেবা ডিসকাউন্ট', icon: 'mdi:percent' },
    { titleEn: '5-Year Card Validity', titleBn: '৫ বছর কার্ড বৈধতা', icon: 'mdi:calendar-check' },
  ];

  // ── Premium benefits (all primary + additional) ──
  const premiumAdditional = [
    { titleEn: 'Higher Service Discount', titleBn: 'উচ্চতর সেবা ডিসকাউন্ট', icon: 'mdi:sale' },
    { titleEn: 'Priority Service Support', titleBn: 'অগ্রাধিকার সেবা সহায়তা', icon: 'mdi:headphones' },
    { titleEn: 'Coverage for Up to 10 Pets', titleBn: '১০টি পোষা প্রাণী পর্যন্ত কভারেজ', icon: 'mdi:paw' },
    { titleEn: 'Preferred Clinic/Branch Priority', titleBn: 'পছন্দের ক্লিনিক/শাখা অগ্রাধিকার', icon: 'mdi:hospital-box' },
  ];

  // ── Enterprise benefits (all premium + additional) ──
  const enterpriseAdditional = [
    { titleEn: 'Highest Service Discount', titleBn: 'সর্বোচ্চ সেবা ডিসকাউন্ট', icon: 'mdi:sale' },
    { titleEn: 'Multi-Pet/Family/Shelter Support', titleBn: 'একাধিক পোষা/পরিবার/শেল্টার সমর্থন', icon: 'mdi:home-heart' },
    { titleEn: 'Priority Branch Service', titleBn: 'অগ্রাধিকার শাখা সেবা', icon: 'mdi:star' },
    { titleEn: 'Extended Pet Coverage', titleBn: 'বর্ধিত পোষা প্রাণী কভারেজ', icon: 'mdi:shield-check' },
  ];

  async function createBenefitIfNotExists(data: { titleEn: string; titleBn: string; icon: string }) {
    const existing = await prisma.communityMembershipBenefit.findFirst({ where: { titleEn: data.titleEn } });
    if (existing) return existing.id;
    const benefit = await prisma.communityMembershipBenefit.create({
      data: { titleEn: data.titleEn, titleBn: data.titleBn, icon: data.icon, sortOrder: 0 },
    });
    return benefit.id;
  }

  async function assignBenefitToTier(benefitId: string, tierId: string) {
    await prisma.communityTierBenefitMapping.upsert({
      where: { tierId_benefitId: { tierId, benefitId } },
      update: {},
      create: { tierId, benefitId },
    });
  }

  // Assign Primary benefits to Primary tier
  for (const b of primaryBenefits) {
    const id = await createBenefitIfNotExists(b);
    await assignBenefitToTier(id, primaryTier.id);
    await assignBenefitToTier(id, premiumTier.id);
    await assignBenefitToTier(id, enterpriseTier.id);
  }

  // Assign Premium-specific benefits to Premium and Enterprise
  for (const b of premiumAdditional) {
    const id = await createBenefitIfNotExists(b);
    await assignBenefitToTier(id, premiumTier.id);
    await assignBenefitToTier(id, enterpriseTier.id);
  }

  // Assign Enterprise-specific benefits to Enterprise only
  for (const b of enterpriseAdditional) {
    const id = await createBenefitIfNotExists(b);
    await assignBenefitToTier(id, enterpriseTier.id);
  }

  // ─── Document Templates ──────────────────────────────────────────

  console.log('Seeding default membership documents...');

  const documents = [
    {
      documentType: 'terms_and_conditions',
      titleEn: 'Terms & Conditions', titleBn: 'শর্তাবলী',
      contentEn: '1. This membership is non-transferable.\n2. Benefits are subject to availability at BPA-partnered clinics.\n3. BPA reserves the right to modify benefits with prior notice.\n4. Membership fees are non-refundable except as per the refund policy.',
      contentBn: '১. এই সদস্যপদ হস্তান্তরযোগ্য নয়।\n২. সুবিধাগুলি বিপিএ-এর অংশীদার ক্লিনিকগুলিতে প্রাপ্যতা সাপেক্ষে।\n৩. বিপিএ পূর্ব বিজ্ঞপ্তি সহ সুবিধা পরিবর্তনের অধিকার রাখে।\n৪. ফেরত নীতি অনুযায়ী ছাড়া সদস্যপদ ফি ফেরতযোগ্য নয়।',
    },
    {
      documentType: 'refund_policy',
      titleEn: 'Refund Policy', titleBn: 'ফেরত নীতি',
      contentEn: 'Membership fees are refundable within 14 days of purchase if no benefits have been utilized. After 14 days, no refund shall be provided. Processing fees may apply.',
      contentBn: 'কোনো সুবিধা ব্যবহার না করা হলে ক্রয়ের ১৪ দিনের মধ্যে সদস্যপদ ফি ফেরতযোগ্য। ১৪ দিন পর কোন ফেরত প্রদান করা হবে না। প্রক্রিয়াকরণ ফি প্রযোজ্য হতে পারে।',
    },
    {
      documentType: 'service_availability_policy',
      titleEn: 'Service Availability Policy', titleBn: 'পরিষেবার প্রাপ্যতা নীতি',
      contentEn: 'Services are provided at BPA-partnered veterinary clinics. Availability varies by location and clinic capacity. Emergency services are subject to clinic availability.',
      contentBn: 'পরিষেবাগুলি বিপিএ-এর অংশীদার ভেটেরিনারি ক্লিনিকে প্রদান করা হয়। অবস্থান এবং ক্লিনিক সক্ষমতা অনুযায়ী প্রাপ্যতা পরিবর্তিত হয়। জরুরি সেবা ক্লিনিকের প্রাপ্যতা সাপেক্ষে।',
    },
    {
      documentType: 'discount_policy',
      titleEn: 'Discount Policy', titleBn: 'ডিসকাউন্ট নীতি',
      contentEn: 'Tier-based discounts apply to listed services at partner clinics. Discounts cannot be combined with other offers. BPA reserves the right to change discount rates with 30 days notice.',
      contentBn: 'টিয়ার-ভিত্তিক ডিসকাউন্ট অংশীদার ক্লিনিকগুলিতে তালিকাভুক্ত পরিষেবাগুলিতে প্রযোজ্য। ডিসকাউন্ট অন্যান্য অফারের সাথে একত্রিত করা যাবে না। বিপিএ ৩০ দিনের নোটিশে ডিসকাউন্ট হার পরিবর্তনের অধিকার রাখে।',
    },
    {
      documentType: 'welcome_letter',
      titleEn: 'Welcome to BPA Community Care', titleBn: 'বিপিএ কমিউনিটি কেয়ারে স্বাগতম',
      contentEn: 'Dear Member,\n\nWelcome to the BPA Community Care Partnership Program! We are delighted to have you as a valued member of our community. Your membership helps us provide better veterinary care for pets across Bangladesh.\n\nYour digital card and benefits are now active. Please keep your card number and QR code secure.\n\nThank you for your support!\n\n— BPA Team',
      contentBn: 'প্রিয় সদস্য,\n\nবিপিএ কমিউনিটি কেয়ার পার্টনারশিপ প্রোগ্রামে স্বাগতম! আমাদের সম্প্রদায়ের একজন মূল্যবান সদস্য হিসেবে আপনাকে পেয়ে আমরা আনন্দিত। আপনার সদস্যপদ বাংলাদেশ জুড়ে পোষা প্রাণীদের জন্য আরও ভাল ভেটেরিনারি সেবা প্রদানে সহায়তা করে।\n\nআপনার ডিজিটাল কার্ড এবং সুবিধাগুলি এখন সক্রিয়। অনুগ্রহ করে আপনার কার্ড নম্বর এবং কিউআর কোড নিরাপদে রাখুন।\n\nআপনার সমর্থনের জন্য ধন্যবাদ!\n\n— বিপিএ টিম',
    },
  ];

  for (const doc of documents) {
    const existing = await prisma.communityMembershipDocument.findFirst({
      where: { documentType: doc.documentType, isActive: true },
    });
    if (!existing) {
      await prisma.communityMembershipDocument.create({ data: doc });
    }
  }

  console.log('Community Membership Engine seed complete.');
  console.log('Tiers: Primary (৳3,000 → ৳10,000), Premium (৳5,000 → ৳18,000), Enterprise (৳10,000 → ৳30,000)');
  console.log(`Services: ${serviceData.length}`);
  console.log(`Discounts: ${services.length * 3} configured`);
  console.log('Document templates: 5 types');

  // ─── Diagnostic Center Services (Clinical Tests) ─────────────────

  console.log('Seeding diagnostic center services (clinical tests)...');

  const diagnosticServices = [
    // LAB
    { titleEn: 'Complete Blood Count (CBC)', titleBn: 'কমপ্লিট ব্লাড কাউন্ট (সিবিসি)', category: 'LAB' as const, descriptionEn: 'Full blood panel including red cells, white cells, and platelets.', descriptionBn: 'লোহিত কণিকা, শ্বেত কণিকা ও প্লেটলেট সহ সম্পূর্ণ রক্ত পরীক্ষা।', icon: 'mdi:blood-bag', sortOrder: 1 },
    { titleEn: 'Blood Chemistry Panel', titleBn: 'ব্লাড কেমিস্ট্রি প্যানেল', category: 'LAB' as const, descriptionEn: 'Liver function, kidney function, glucose, and electrolyte analysis.', descriptionBn: 'লিভার, কিডনি, গ্লুকোজ ও ইলেক্ট্রোলাইট পরীক্ষা।', icon: 'mdi:test-tube', sortOrder: 2 },
    { titleEn: 'Urinalysis', titleBn: 'প্রস্রাব পরীক্ষা', category: 'LAB' as const, descriptionEn: 'Urine analysis for infection, crystals, and kidney health markers.', descriptionBn: 'সংক্রমণ, ক্রিস্টাল ও কিডনি স্বাস্থ্য সূচকের জন্য প্রস্রাব বিশ্লেষণ।', icon: 'mdi:flask', sortOrder: 3 },
    { titleEn: 'Fecal Examination', titleBn: 'মলমূত্র পরীক্ষা', category: 'LAB' as const, descriptionEn: 'Stool test to detect parasites, worm eggs, and intestinal infections.', descriptionBn: 'পরজীবী, কৃমির ডিম ও অন্ত্রের সংক্রমণ সনাক্তের জন্য মল পরীক্ষা।', icon: 'mdi:microscope', sortOrder: 4 },
    { titleEn: 'Thyroid Function Test (T4)', titleBn: 'থাইরয়েড ফাংশন টেস্ট (T4)', category: 'LAB' as const, descriptionEn: 'Thyroid hormone level check — important for cats and senior dogs.', descriptionBn: 'থাইরয়েড হরমোন স্তর পরীক্ষা — বিড়াল ও বয়স্ক কুকুরের জন্য গুরুত্বপূর্ণ।', icon: 'mdi:dna', sortOrder: 5 },
    { titleEn: 'FIV / FeLV Rapid Test', titleBn: 'FIV/FeLV র‍্যাপিড টেস্ট', category: 'LAB' as const, descriptionEn: 'Rapid test for Feline Immunodeficiency Virus and Feline Leukemia Virus in cats.', descriptionBn: 'বিড়ালের ইমিউনোডিফিসিয়েন্সি ভাইরাস ও লিউকেমিয়া ভাইরাসের দ্রুত পরীক্ষা।', icon: 'mdi:virus', sortOrder: 6 },
    { titleEn: 'Parvovirus Rapid Test', titleBn: 'পারভোভাইরাস র‍্যাপিড টেস্ট', category: 'LAB' as const, descriptionEn: 'Quick diagnosis of canine parvovirus from fecal sample.', descriptionBn: 'মলের নমুনা থেকে কুকুরের পারভোভাইরাসের দ্রুত নির্ণয়।', icon: 'mdi:virus-outline', sortOrder: 7 },
    // IMAGING
    { titleEn: 'Digital X-Ray', titleBn: 'ডিজিটাল এক্স-রে', category: 'IMAGING' as const, descriptionEn: 'Digital radiography for bones, chest, and abdominal organs.', descriptionBn: 'হাড়, বুক ও পেটের অঙ্গের জন্য ডিজিটাল রেডিওগ্রাফি।', icon: 'mdi:radiology-box-outline', sortOrder: 8 },
    { titleEn: 'Ultrasound (Abdomen)', titleBn: 'আল্ট্রাসাউন্ড (পেট)', category: 'IMAGING' as const, descriptionEn: 'Abdominal ultrasound for liver, spleen, bladder, and reproductive organs.', descriptionBn: 'লিভার, প্লীহা, মূত্রথলি ও প্রজনন অঙ্গের আল্ট্রাসাউন্ড।', icon: 'mdi:ultrasound', sortOrder: 9 },
    { titleEn: 'Echocardiography', titleBn: 'ইকোকার্ডিওগ্রাফি', category: 'IMAGING' as const, descriptionEn: 'Cardiac ultrasound to evaluate heart structure and function.', descriptionBn: 'হার্টের গঠন ও কার্যকারিতা মূল্যায়নের জন্য কার্ডিয়াক আল্ট্রাসাউন্ড।', icon: 'mdi:heart-pulse', sortOrder: 10 },
    // SPECIALIST
    { titleEn: 'Orthopedic Consultation', titleBn: 'অর্থোপেডিক পরামর্শ', category: 'SPECIALIST' as const, descriptionEn: 'Specialist evaluation for joint, bone, and musculoskeletal issues.', descriptionBn: 'জয়েন্ট, হাড় ও পেশীতন্ত্রের সমস্যার জন্য বিশেষজ্ঞ মূল্যায়ন।', icon: 'mdi:bone', sortOrder: 11 },
    { titleEn: 'Dermatology Consultation', titleBn: 'ডার্মাটোলজি পরামর্শ', category: 'SPECIALIST' as const, descriptionEn: 'Skin disease diagnosis including allergies, infections, and coat conditions.', descriptionBn: 'অ্যালার্জি, সংক্রমণ ও লোমের সমস্যা সহ চর্মরোগ নির্ণয়।', icon: 'mdi:emoticon-poop', sortOrder: 12 },
    { titleEn: 'Ophthalmology Examination', titleBn: 'চক্ষু পরীক্ষা', category: 'SPECIALIST' as const, descriptionEn: 'Eye examination for cataracts, glaucoma, corneal ulcers, and retinal issues.', descriptionBn: 'ছানি, গ্লুকোমা, কর্নিয়াল আলসার ও রেটিনা সমস্যার জন্য চক্ষু পরীক্ষা।', icon: 'mdi:eye-outline', sortOrder: 13 },
    { titleEn: 'Dental Examination & Scaling', titleBn: 'দাঁত পরীক্ষা ও স্কেলিং', category: 'SPECIALIST' as const, descriptionEn: 'Oral health check and professional teeth cleaning under sedation.', descriptionBn: 'মৌখিক স্বাস্থ্য পরীক্ষা এবং সেডেশনের অধীনে পেশাদার দাঁত পরিষ্কার।', icon: 'mdi:tooth-outline', sortOrder: 14 },
    // EMERGENCY
    { titleEn: 'Emergency Triage & Stabilisation', titleBn: 'জরুরি ট্রিয়াজ ও স্থিতিশীলকরণ', category: 'EMERGENCY' as const, descriptionEn: 'Immediate assessment and stabilisation for critical or injured animals.', descriptionBn: 'সংকটজনক বা আহত প্রাণীর জন্য তাৎক্ষণিক মূল্যায়ন ও স্থিতিশীলকরণ।', icon: 'mdi:ambulance', sortOrder: 15 },
    { titleEn: 'IV Fluid Therapy', titleBn: 'আইভি ফ্লুইড থেরাপি', category: 'EMERGENCY' as const, descriptionEn: 'Intravenous fluid support for dehydration, shock, or post-surgical recovery.', descriptionBn: 'পানিশূন্যতা, শক বা অস্ত্রোপচারের পরে পুনরুদ্ধারের জন্য শিরায় তরল সহায়তা।', icon: 'mdi:iv-bag', sortOrder: 16 },
    { titleEn: '24/7 Emergency Care', titleBn: '২৪/৭ জরুরি সেবা', category: 'EMERGENCY' as const, descriptionEn: 'Round-the-clock emergency veterinary care for life-threatening conditions.', descriptionBn: 'জীবন-হুমকির পরিস্থিতির জন্য সার্বক্ষণিক জরুরি ভেটেরিনারি সেবা।', icon: 'mdi:hospital-box', sortOrder: 17 },
    // FUTURE_TECH
    { titleEn: 'DNA / Breed Profiling', titleBn: 'ডিএনএ / ব্রিড প্রোফাইলিং', category: 'FUTURE_TECH' as const, descriptionEn: 'Genetic breed identification and inherited disease screening (coming soon).', descriptionBn: 'জেনেটিক ব্রিড সনাক্তকরণ ও বংশগত রোগ স্ক্রিনিং (শীঘ্রই আসছে)।', icon: 'mdi:dna', sortOrder: 18 },
    { titleEn: 'Microbiome Analysis', titleBn: 'মাইক্রোবায়োম বিশ্লেষণ', category: 'FUTURE_TECH' as const, descriptionEn: 'Gut microbiome profiling for nutrition and digestive health optimisation (coming soon).', descriptionBn: 'পুষ্টি ও পাচন স্বাস্থ্য অপ্টিমাইজেশনের জন্য গাট মাইক্রোবায়োম প্রোফাইলিং (শীঘ্রই)।', icon: 'mdi:bacteria-outline', sortOrder: 19 },
  ];

  for (const ds of diagnosticServices) {
    const existing = await prisma.diagnosticCenterService.findFirst({
      where: { titleEn: ds.titleEn },
    });
    if (!existing) {
      await prisma.diagnosticCenterService.create({ data: ds });
    }
  }

  console.log(`Diagnostic center services seeded: ${diagnosticServices.length}`);

  // ─── Care Partner Benefits ────────────────────────────────────────

  console.log('Seeding care partner benefits...');

  const carePartnerBenefits = [
    // SERVICE
    { titleEn: 'Priority Service at BPA Community Clinics', titleBn: 'বিপিএ কমিউনিটি ক্লিনিকে অগ্রাধিকার সেবা', category: 'SERVICE' as const, icon: 'mdi:hospital-building', descriptionEn: 'Fast-track access to veterinary services at all BPA-partnered community clinics.', descriptionBn: 'সব বিপিএ-অংশীদার কমিউনিটি ক্লিনিকে ভেটেরিনারি সেবায় দ্রুত প্রবেশাধিকার।', sortOrder: 1 },
    { titleEn: 'Free General Health Checkup (Annual)', titleBn: 'বিনামূল্যে বার্ষিক স্বাস্থ্য পরীক্ষা', category: 'SERVICE' as const, icon: 'mdi:stethoscope', descriptionEn: 'One free general health checkup per registered pet per year.', descriptionBn: 'প্রতি বছর প্রতিটি নিবন্ধিত পোষা প্রাণীর জন্য একটি বিনামূল্যে সাধারণ স্বাস্থ্য পরীক্ষা।', sortOrder: 2 },
    // DISCOUNT
    { titleEn: 'Discount on Veterinary Consultations', titleBn: 'ভেটেরিনারি পরামর্শে ছাড়', category: 'DISCOUNT' as const, icon: 'mdi:percent', descriptionEn: 'Flat percentage discount on consultation fees at partner clinics.', descriptionBn: 'অংশীদার ক্লিনিকে পরামর্শ ফিতে নির্দিষ্ট শতাংশ ছাড়।', sortOrder: 3 },
    { titleEn: 'Discount on Vaccines & Medicines', titleBn: 'টিকা ও ওষুধে ছাড়', category: 'DISCOUNT' as const, icon: 'mdi:needle', descriptionEn: 'Preferential pricing on all routine vaccinations and prescribed medicines.', descriptionBn: 'সব নিয়মিত টিকা ও প্রেসক্রাইবড ওষুধে অগ্রাধিকারমূলক মূল্য নির্ধারণ।', sortOrder: 4 },
    { titleEn: 'Discount on Diagnostic Tests', titleBn: 'ডায়াগনস্টিক পরীক্ষায় ছাড়', category: 'DIAGNOSTIC' as const, icon: 'mdi:test-tube', descriptionEn: 'Discounted rates on blood tests, imaging, and other laboratory services.', descriptionBn: 'রক্ত পরীক্ষা, ইমেজিং ও অন্যান্য ল্যাবরেটরি সেবায় ছাড়কৃত মূল্য।', sortOrder: 5 },
    // DIGITAL
    { titleEn: 'Digital BPA Care Partner Card', titleBn: 'ডিজিটাল বিপিএ কেয়ার পার্টনার কার্ড', category: 'DIGITAL' as const, icon: 'mdi:card-account-details', descriptionEn: 'A digital card with QR code that proves your Care Partner status at any clinic.', descriptionBn: 'QR কোড সহ একটি ডিজিটাল কার্ড যা যেকোনো ক্লিনিকে কেয়ার পার্টনার স্ট্যাটাস প্রমাণ করে।', sortOrder: 6 },
    { titleEn: 'BPA Member Portal Access', titleBn: 'বিপিএ সদস্য পোর্টাল অ্যাক্সেস', category: 'DIGITAL' as const, icon: 'mdi:account-circle-outline', descriptionEn: 'Access to your personal dashboard with pet records, vaccination history, and reports.', descriptionBn: 'পোষা প্রাণীর রেকর্ড, টিকার ইতিহাস ও রিপোর্ট সহ ব্যক্তিগত ড্যাশবোর্ডে প্রবেশাধিকার।', sortOrder: 7 },
    // WELFARE
    { titleEn: 'Founding Clinic Zone Vote', titleBn: 'প্রতিষ্ঠাতা ক্লিনিক জোন ভোট', category: 'WELFARE' as const, icon: 'mdi:vote', descriptionEn: 'Vote on which Dhaka zone gets the first BPA Community Clinic. Your contribution decides the location.', descriptionBn: 'কোন ঢাকা জোনে প্রথম বিপিএ কমিউনিটি ক্লিনিক হবে তা ভোট দিন।', sortOrder: 8 },
    { titleEn: 'Annual Transparency Report', titleBn: 'বার্ষিক স্বচ্ছতা রিপোর্ট', category: 'WELFARE' as const, icon: 'mdi:file-chart-outline', descriptionEn: 'Annual report showing how contributions have been utilised for community pet care.', descriptionBn: 'কমিউনিটি পোষা প্রাণী সেবায় অবদান কীভাবে ব্যবহার করা হয়েছে তা দেখানো বার্ষিক রিপোর্ট।', sortOrder: 9 },
    // MEMBERSHIP
    { titleEn: 'Recognition as Founding Care Partner', titleBn: 'প্রতিষ্ঠাতা কেয়ার পার্টনার হিসেবে স্বীকৃতি', category: 'MEMBERSHIP' as const, icon: 'mdi:star-circle-outline', descriptionEn: 'Your name listed as a founding contributor in BPA Community Clinic dedication records.', descriptionBn: 'বিপিএ কমিউনিটি ক্লিনিক উৎসর্গ রেকর্ডে প্রতিষ্ঠাতা অবদানকারী হিসেবে আপনার নাম।', sortOrder: 10 },
    // FUTURE
    { titleEn: 'Future Platform Benefits', titleBn: 'ভবিষ্যত প্ল্যাটফর্ম সুবিধা', category: 'FUTURE' as const, icon: 'mdi:rocket-launch-outline', descriptionEn: 'All future BPA platform benefits, programs, and features automatically included (details TBA).', descriptionBn: 'সমস্ত ভবিষ্যত বিপিএ প্ল্যাটফর্ম সুবিধা, প্রোগ্রাম এবং ফিচার স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত।', sortOrder: 11 },
  ];

  for (const b of carePartnerBenefits) {
    const existing = await prisma.carePartnerBenefit.findFirst({ where: { titleEn: b.titleEn } });
    if (!existing) {
      await prisma.carePartnerBenefit.create({ data: { ...b, isActive: true } });
    }
  }

  console.log(`Care partner benefits seeded: ${carePartnerBenefits.length}`);

  // ─── Social Impact Programs ───────────────────────────────────────

  console.log('Seeding social impact programs...');

  const socialImpactPrograms = [
    { titleEn: 'Stray Animal Medical Treatment', titleBn: 'পথ-প্রাণীর চিকিৎসা কর্মসূচি', impactType: 'STRAY_TREATMENT' as const, icon: 'mdi:paw', descriptionEn: 'Free medical treatment for injured and sick stray dogs and cats in Dhaka city.', descriptionBn: 'ঢাকা শহরের আহত ও অসুস্থ পথ-কুকুর ও বিড়ালের বিনামূল্যে চিকিৎসা।', sortOrder: 1 },
    { titleEn: 'Community Feeding Programme', titleBn: 'কমিউনিটি খাদ্য সহায়তা কর্মসূচি', impactType: 'FEEDING' as const, icon: 'mdi:bowl-mix-outline', descriptionEn: 'Regular feeding stations for stray animals across Dhaka, managed by BPA volunteers.', descriptionBn: 'বিপিএ স্বেচ্ছাসেবকদের দ্বারা পরিচালিত ঢাকা জুড়ে পথ-প্রাণীর জন্য নিয়মিত খাদ্য কেন্দ্র।', sortOrder: 2 },
    { titleEn: 'Mass Vaccination Drive', titleBn: 'গণ টিকাদান অভিযান', impactType: 'VACCINATION' as const, icon: 'mdi:needle', descriptionEn: 'Large-scale subsidised vaccination campaigns for pets in low-income communities.', descriptionBn: 'নিম্ন-আয়ের সম্প্রদায়ে পোষা প্রাণীদের জন্য বড় আকারের ভর্তুকিযুক্ত টিকাদান প্রচারণা।', sortOrder: 3 },
    { titleEn: 'Animal Rescue & Rehabilitation', titleBn: 'প্রাণী উদ্ধার ও পুনর্বাসন', impactType: 'RESCUE' as const, icon: 'mdi:dog-service', descriptionEn: 'Emergency rescue and short-term rehabilitation for abused or abandoned pets.', descriptionBn: 'নির্যাতিত বা পরিত্যক্ত পোষা প্রাণীর জন্য জরুরি উদ্ধার ও স্বল্পমেয়াদী পুনর্বাসন।', sortOrder: 4 },
    { titleEn: 'Temporary Shelter Support', titleBn: 'অস্থায়ী আশ্রয় সহায়তা', impactType: 'SHELTER' as const, icon: 'mdi:home-heart', descriptionEn: 'Support for partner shelters providing temporary housing for rescued animals.', descriptionBn: 'উদ্ধারকৃত প্রাণীদের অস্থায়ী আবাসন প্রদানকারী অংশীদার আশ্রয়ের সহায়তা।', sortOrder: 5 },
    { titleEn: 'Low-Income Family Pet Care Support', titleBn: 'নিম্ন-আয়ী পরিবারের পোষা প্রাণী সেবা সহায়তা', impactType: 'LOW_INCOME_SUPPORT' as const, icon: 'mdi:hand-heart-outline', descriptionEn: 'Subsidised or free veterinary care for pets owned by low-income families.', descriptionBn: 'নিম্ন-আয়ের পরিবারের পোষা প্রাণীর জন্য ভর্তুকিযুক্ত বা বিনামূল্যে ভেটেরিনারি সেবা।', sortOrder: 6 },
    { titleEn: 'Pet Welfare Education', titleBn: 'পোষা প্রাণী কল্যাণ শিক্ষা', impactType: 'EDUCATION' as const, icon: 'mdi:school-outline', descriptionEn: 'Community workshops, school programmes, and online resources on responsible pet ownership.', descriptionBn: 'দায়িত্বশীল পোষা প্রাণী পালন সম্পর্কে কমিউনিটি কর্মশালা, স্কুল প্রোগ্রাম ও অনলাইন সম্পদ।', sortOrder: 7 },
  ];

  for (const sp of socialImpactPrograms) {
    const existing = await prisma.socialImpactProgram.findFirst({ where: { titleEn: sp.titleEn } });
    if (!existing) {
      await prisma.socialImpactProgram.create({ data: { ...sp, isActive: true } });
    }
  }

  console.log(`Social impact programs seeded: ${socialImpactPrograms.length}`);

  // ─── Roadmap Items ────────────────────────────────────────────────

  console.log('Seeding roadmap items...');

  const roadmapItems = [
    { phase: 'Phase 1', year: 2026, titleEn: 'Launch BPA Community Care Partner Card', titleBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড চালু', status: 'IN_PROGRESS' as const, descriptionEn: 'Online registration and digital card issuance for founding Care Partners across Dhaka.', descriptionBn: 'ঢাকা জুড়ে প্রতিষ্ঠাতা কেয়ার পার্টনারদের জন্য অনলাইন নিবন্ধন ও ডিজিটাল কার্ড ইস্যু।', sortOrder: 1 },
    { phase: 'Phase 1', year: 2026, titleEn: 'Pet Census 2026 — Dhaka Household Survey', titleBn: 'পেট সেনসাস ২০২৬ — ঢাকা পরিবার জরিপ', status: 'IN_PROGRESS' as const, descriptionEn: 'First-ever structured census of pets in Dhaka to guide clinic placement and resource allocation.', descriptionBn: 'ক্লিনিক স্থাপন ও সম্পদ বরাদ্দ নির্দেশিকা তৈরির জন্য ঢাকায় পোষা প্রাণীর প্রথম কাঠামোগত আদমশুমারি।', sortOrder: 2 },
    { phase: 'Phase 2', year: 2026, titleEn: 'Establish First BPA Community Clinic (Pilot Zone)', titleBn: 'প্রথম বিপিএ কমিউনিটি ক্লিনিক স্থাপন (পাইলট জোন)', status: 'PLANNED' as const, descriptionEn: 'Open the first BPA Community 24/7 Pet Clinic in the zone with highest member demand.', descriptionBn: 'সর্বোচ্চ সদস্য চাহিদার জোনে প্রথম বিপিএ কমিউনিটি ২৪/৭ পেট ক্লিনিক খোলা।', sortOrder: 3 },
    { phase: 'Phase 2', year: 2026, titleEn: 'Partner Clinic Network — Discount Integration', titleBn: 'পার্টনার ক্লিনিক নেটওয়ার্ক — ডিসকাউন্ট ইন্টিগ্রেশন', status: 'PLANNED' as const, descriptionEn: 'On-board existing vetinary clinics as partner clinics offering Care Partner card discounts.', descriptionBn: 'বিদ্যমান ভেটেরিনারি ক্লিনিকগুলিকে কেয়ার পার্টনার কার্ড ছাড় প্রদানকারী পার্টনার ক্লিনিক হিসেবে যুক্ত করা।', sortOrder: 4 },
    { phase: 'Phase 3', year: 2027, titleEn: 'Expand to 3 Additional Clinic Zones', titleBn: 'আরও ৩টি ক্লিনিক জোনে সম্প্রসারণ', status: 'PLANNED' as const, descriptionEn: 'Scale the community clinic model to three more Dhaka zones based on census data and member demand.', descriptionBn: 'আদমশুমারি তথ্য ও সদস্য চাহিদার উপর ভিত্তি করে ঢাকার আরও তিনটি জোনে কমিউনিটি ক্লিনিক মডেল সম্প্রসারণ।', sortOrder: 5 },
    { phase: 'Phase 3', year: 2027, titleEn: 'Pet Smart Solution Platform Integration', titleBn: 'পেট স্মার্ট সলিউশন প্ল্যাটফর্ম ইন্টিগ্রেশন', status: 'PLANNED' as const, descriptionEn: 'Full integration with Pet Smart Solution for advanced pet health tracking and smart clinic management.', descriptionBn: 'উন্নত পোষা প্রাণী স্বাস্থ্য ট্র্যাকিং ও স্মার্ট ক্লিনিক ব্যবস্থাপনার জন্য পেট স্মার্ট সলিউশনের সাথে সম্পূর্ণ ইন্টিগ্রেশন।', sortOrder: 6 },
    { phase: 'Phase 4', year: 2028, titleEn: 'All 8 Dhaka Zones — Full Clinic Coverage', titleBn: 'সব ৮টি ঢাকা জোন — সম্পূর্ণ ক্লিনিক কভারেজ', status: 'PLANNED' as const, descriptionEn: 'Complete the BPA Community Clinic network across all 8 defined zones of Dhaka city.', descriptionBn: 'ঢাকা শহরের সমস্ত ৮টি নির্ধারিত জোন জুড়ে বিপিএ কমিউনিটি ক্লিনিক নেটওয়ার্ক সম্পূর্ণ করা।', sortOrder: 7 },
  ];

  for (const ri of roadmapItems) {
    const existing = await prisma.roadmapItem.findFirst({ where: { titleEn: ri.titleEn } });
    if (!existing) {
      await prisma.roadmapItem.create({ data: { ...ri, isActive: true } });
    }
  }

  console.log(`Roadmap items seeded: ${roadmapItems.length}`);

  // ─── Donation Impact Stories ────────────────────────────────────

  console.log('Seeding donation impact stories...');

  const impactStories = [
    {
      titleEn: '200 Dogs Vaccinated in Uttara',
      titleBn: 'উত্তরায় ২০০ কুকুরকে টিকা প্রদান',
      slug: '200-dogs-vaccinated-uttara',
      storyType: 'VACCINATION' as const,
      location: 'Uttara, Dhaka',
      animalType: 'Dog',
      shortDescriptionEn: 'Our team vaccinated 200 street dogs in Uttara against rabies, protecting both animals and the community.',
      shortDescriptionBn: 'আমাদের দল উত্তরায় ২০০টি রাস্তার কুকুরকে জলাতঙ্কের বিরুদ্ধে টিকা দিয়েছে, যা প্রাণী ও সম্প্রদায় উভয়কেই রক্ষা করেছে।',
      fullStoryEn: 'In a major outreach effort this March, BPA\'s mobile veterinary team set up vaccination stations across 5 locations in Uttara. Over two weeks, we vaccinated 200 street dogs against rabies and provided basic health checkups. The campaign was supported by local volunteers who helped identify dog populations and coordinate with community members. Each vaccinated dog was marked for identification, and owners in the area received educational materials about rabies prevention and responsible pet care. This initiative significantly reduces the risk of rabies transmission in the Uttara area and brings us closer to our goal of a rabies-free Dhaka.',
      fullStoryBn: 'এই মার্চ মাসে একটি বড় আউটরিচ উদ্যোগে, বিপিএর মোবাইল ভেটেরিনারি টিম উত্তরার ৫টি স্থানে টিকাদান কেন্দ্র স্থাপন করে। দুই সপ্তাহ ধরে, আমরা ২০০টি রাস্তার কুকুরকে জলাতঙ্কের বিরুদ্ধে টিকা দিয়েছি এবং প্রাথমিক স্বাস্থ্য পরীক্ষা করেছি। এই প্রচারণা স্থানীয় স্বেচ্ছাসেবকদের দ্বারা সমর্থিত হয়েছিল যারা কুকুরের জনসংখ্যা চিহ্নিত করতে এবং সম্প্রদায়ের সদস্যদের সাথে সমন্বয় করতে সাহায্য করেছিল। প্রতিটি টিকাপ্রাপ্ত কুকুরকে শনাক্তকরণের জন্য চিহ্নিত করা হয়েছিল এবং এলাকার মালিকরা জলাতঙ্ক প্রতিরোধ ও দায়িত্বশীল পোষা প্রাণীর যত্ন সম্পর্কে শিক্ষামূলক উপকরণ পেয়েছেন। এই উদ্যোগ উত্তরাঞ্চলে জলাতঙ্ক সংক্রমণের ঝুঁকি উল্লেখযোগ্যভাবে হ্রাস করে এবং আমাদের জলাতঙ্কমুক্ত ঢাকা গড়ার লক্ষ্যের কাছাকাছি নিয়ে আসে।',
      status: 'PUBLISHED',
      showOnDonationPage: true,
      sortOrder: 1,
      storyDate: new Date('2026-03-15'),
      costUsed: 45000,
    },
    {
      titleEn: 'Injured Cat Rescued and Treated',
      titleBn: 'আহত বিড়াল উদ্ধার ও চিকিৎসা',
      slug: 'injured-cat-rescued-treated',
      storyType: 'RESCUE' as const,
      location: 'Mirpur, Dhaka',
      animalType: 'Cat',
      shortDescriptionEn: 'A severely injured cat found on the streets of Mirpur received emergency surgery and made a full recovery.',
      shortDescriptionBn: 'মিরপুরের রাস্তায় গুরুতর আহত অবস্থায় পাওয়া একটি বিড়াল জরুরি অস্ত্রোপচার পেয়ে সম্পূর্ণ সুস্থ হয়ে উঠেছে।',
      fullStoryEn: 'A Good Samaritan found a young cat with a severe leg injury on the streets of Mirpur and immediately contacted BPA. Our rescue team rushed to the location and brought the cat to our partner veterinary clinic. The cat, whom we named "Mishu," had a fractured leg that required immediate surgery. Thanks to generous donations from our supporters, we were able to cover the full cost of the surgery, medication, and rehabilitation. After 6 weeks of careful treatment and love from our foster volunteers, Mishu made a full recovery. She has since been adopted by a loving family in Banani and is thriving in her forever home. Stories like Mishu\'s remind us why every donation matters — it literally saves lives.',
      fullStoryBn: 'একজন সদয় ব্যক্তি মিরপুরের রাস্তায় গুরুতর পায়ের আঘাতসহ একটি তরুণ বিড়াল খুঁজে পেয়ে অবিলম্বে বিপিএতে যোগাযোগ করেন। আমাদের উদ্ধার দল ঘটনাস্থলে ছুটে যায় এবং বিড়ালটিকে আমাদের পার্টনার ভেটেরিনারি ক্লিনিকে নিয়ে আসে। বিড়ালটি, যার নাম আমরা রেখেছিলাম "মিশু," তার পা ভেঙে গিয়েছিল যার জরুরি অস্ত্রোপচারের প্রয়োজন ছিল। আমাদের সমর্থকদের উদার দানের জন্য, আমরা অস্ত্রোপচার, ওষুধ ও পুনর্বাসনের সম্পূর্ণ ব্যয় বহন করতে পেরেছি। আমাদের ফস্টার স্বেচ্ছাসেবকদের যত্নশীল চিকিৎসা ও ভালোবাসার ৬ সপ্তাহ পর, মিশু সম্পূর্ণ সুস্থ হয়ে ওঠে। তাকে পরবর্তীতে বনানীর একটি প্রেমময় পরিবার দত্তক নিয়েছে এবং তার চিরকালের বাড়িতে সে ভালো আছে। মিশুর মতো গল্পগুলো আমাদের মনে করিয়ে দেয় কেন প্রতিটি দান গুরুত্বপূর্ণ — এটি আক্ষরিক অর্থেই জীবন বাঁচায়।',
      status: 'PUBLISHED',
      showOnDonationPage: true,
      sortOrder: 2,
      storyDate: new Date('2026-02-20'),
      costUsed: 12000,
    },
    {
      titleEn: 'Street Puppies Given Second Chance',
      titleBn: 'রাস্তার কুকুরছানাদের দ্বিতীয় সুযোগ',
      slug: 'street-puppies-second-chance',
      storyType: 'RESCUE' as const,
      location: 'Mohammadpur, Dhaka',
      animalType: 'Dog',
      shortDescriptionEn: 'A litter of 6 newborn puppies abandoned on the street were rescued, nursed to health, and all found loving homes.',
      shortDescriptionBn: 'রাস্তায় পরিত্যক্ত ৬টি নবজাতক কুকুরছানাকে উদ্ধার করে, সুস্থ করে তোলা হয়েছে এবং সবাই প্রেমময় পরিবার পেয়েছে।',
      fullStoryEn: 'In February, BPA received a distress call about a litter of 6 newborn puppies found abandoned in a cardboard box near a construction site in Mohammadpur. They were only days old, dehydrated, and in critical condition. Our rescue team immediately brought them to our care facility where they received round-the-clock attention. For the first few weeks, our volunteers bottle-fed the puppies every 2 hours. As they grew stronger, we provided all necessary vaccinations, deworming, and health checkups. All 6 puppies were spayed/neutered before adoption to prevent future street animal overpopulation. Through our adoption drive and social media campaign, we found responsible, loving homes for all 6 puppies. They are now healthy, happy, and part of caring families across Dhaka.',
      fullStoryBn: 'ফেব্রুয়ারিতে, বিপিএ মোহাম্মদপুরের একটি নির্মাণ সাইটের কাছে একটি কার্ডবোর্ডের বাক্সে পরিত্যক্ত ৬টি নবজাতক কুকুরছানার বিষয়ে একটি জরুরি কল পায়। তারা মাত্র কয়েক দিনের ছিল, ডিহাইড্রেটেড এবং সংকটজনক অবস্থায় ছিল। আমাদের উদ্ধার দল অবিলম্বে তাদের আমাদের পরিচর্যা কেন্দ্রে নিয়ে আসে যেখানে তারা ২৪ ঘন্টা যত্ন পেয়েছে। প্রথম কয়েক সপ্তাহে, আমাদের স্বেচ্ছাসেবকরা প্রতি ২ ঘন্টায় বোতলে কুকুরছানাদের খাওয়াতেন। তারা শক্তিশালী হওয়ার সাথে সাথে, আমরা সমস্ত প্রয়োজনীয় টিকা, কৃমিনাশক এবং স্বাস্থ্য পরীক্ষা প্রদান করেছি। ভবিষ্যতে রাস্তার প্রাণীর অতিরিক্ত জনসংখ্যা রোধ করতে দত্তক দেওয়ার আগে সমস্ত ৬টি কুকুরছানাকে স্পে/নিউটার করা হয়েছিল। আমাদের দত্তক প্রচারণা এবং সোশ্যাল মিডিয়া ক্যাম্পেইনের মাধ্যমে, আমরা সব ৬টি কুকুরছানার জন্য দায়িত্বশীল, প্রেমময় পরিবার খুঁজে পেয়েছি। তারা এখন সুস্থ, খুশি এবং ঢাকা জুড়ে যত্নশীল পরিবারের অংশ।',
      status: 'PUBLISHED',
      showOnDonationPage: true,
      sortOrder: 3,
      storyDate: new Date('2026-01-10'),
      costUsed: 28000,
    },
  ];

  for (const story of impactStories) {
    const existing = await prisma.donationImpactStory.findUnique({ where: { slug: story.slug } });
    if (!existing) {
      await prisma.donationImpactStory.create({ data: story as any });
    }
  }

  console.log(`Donation impact stories seeded: ${impactStories.length}`);

  // ─── Site Settings (Singleton) ────────────────────────────────────

  console.log('Seeding site settings...');

  const defaultSettings = {
    siteName: 'Bangladesh Pet Association',
    siteTagline: 'Building a Better Future for Pets and Their Families',
    tagline: 'Building a Better Future for Pets and Their Families',
    organizationName: 'Bangladesh Pet Association',
    legalName: 'Bangladesh Pet Association',
    officialPhone: '+8809612345678',
    supportPhone: '+8809612345678',
    primaryPhone: '+8809612345678',
    generalEmail: 'info@bangladeshpetassociation.com',
    supportEmail: 'support@bangladeshpetassociation.com',
    contactEmail: 'info@bangladeshpetassociation.com',
    vaccinationEmail: 'vaccination2026@bangladeshpetassociation.com',
    websiteUrl: 'https://bangladeshpetassociation.com',
    officeHours: 'Saturday – Thursday: 9 AM – 6 PM (BST)',
    officeAddress: 'Dhaka, Bangladesh',
    city: 'Dhaka',
    country: 'Bangladesh',
    defaultMetaTitle: 'Bangladesh Pet Association — Community Pet Care',
    defaultMetaDescription: 'BPA is dedicated to improving the lives of pets and their owners across Bangladesh through community clinics, vaccination campaigns, and education.',
    registrationErrorTitle: 'Online registration temporarily unavailable',
    registrationErrorMessage: 'Online registration/payment is temporarily unavailable. Please call BPA support for assistance.',
    receiptFooterNote: 'BPA is a registered non-profit animal welfare organization.',
    donationReceiptTermsBn: 'এই রসিদটি নিশ্চিত করে যে আপনার অনুদানটি গৃহীত হয়েছে এবং এটি ফেরতযোগ্য নয়। আপনার অবদান শুধুমাত্র প্রাণীদের সেবা, উদ্ধার, চিকিৎসা, টিকাদান এবং কল্যাণমূলক কার্যক্রমে ব্যবহার করা হবে।',
    donationReceiptTermsEn: 'This receipt confirms that your donation has been received and is non-refundable. Your contribution will be used solely for animal care, rescue, treatment, vaccination, and welfare programs.',
  };

  await prisma.siteSettings.upsert({
    where: { id: 'default' },
    update: defaultSettings,
    create: {
      id: 'default',
      ...defaultSettings,
    },
  });

  console.log('Site settings seeded.');

  console.log('Seeding default email layouts...');
  const defaultLayoutEn = {
    name: 'Default BPA Email Layout (English)',
    locale: 'en',
    status: 'active',
    isDefault: true,
    headerTitle: 'Bangladesh Pet Association',
    headerSubtitle: 'A national platform for responsible pet care',
    headerBackgroundColor: '#1a2540',
    headerTextColor: '#ffffff',
    footerSupportEmail: 'vaccination2026@bangladeshpetassociation.com',
    footerPhonePrimary: '01575-008300',
    footerPhoneSecondary: '01701-022274',
    footerWebsiteUrl: 'https://bangladeshpetassociation.com',
    footerText: 'Bangladesh Pet Association',
    footerAddress: 'Dhaka, Bangladesh',
    footerBackgroundColor: '#1a2540',
    footerTextColor: '#aabbcc',
    buttonPrimaryColor: '#1a6b3c',
    buttonTextColor: '#ffffff',
    legalNote: 'You are receiving this email because you interacted with Bangladesh Pet Association services.',
  };

  const defaultLayoutBn = {
    name: 'Default BPA Email Layout (Bengali)',
    locale: 'bn',
    status: 'active',
    isDefault: true,
    headerTitle: 'বাংলাদেশ পেট অ্যাসোসিয়েশন',
    headerSubtitle: 'দায়িত্বশীল পোষা প্রাণী সেবার জাতীয় প্ল্যাটফর্ম',
    headerBackgroundColor: '#1a2540',
    headerTextColor: '#ffffff',
    footerSupportEmail: 'vaccination2026@bangladeshpetassociation.com',
    footerPhonePrimary: '01575-008300',
    footerPhoneSecondary: '01701-022274',
    footerWebsiteUrl: 'https://bangladeshpetassociation.com',
    footerText: 'বাংলাদেশ পেট অ্যাসোসিয়েশন',
    footerAddress: 'ঢাকা, বাংলাদেশ',
    footerBackgroundColor: '#1a2540',
    footerTextColor: '#aabbcc',
    buttonPrimaryColor: '#1a6b3c',
    buttonTextColor: '#ffffff',
    legalNote: 'বাংলাদেশ পেট অ্যাসোসিয়েশন-এর পরিষেবায় অংশ নেওয়ার জন্য আপনি এই ইমেলটি পেয়েছেন।',
  };

  const existingEn = await prisma.emailLayoutSetting.findFirst({
    where: { locale: 'en', name: defaultLayoutEn.name },
  });
  if (!existingEn) {
    await prisma.emailLayoutSetting.create({ data: defaultLayoutEn });
  }

  const existingBn = await prisma.emailLayoutSetting.findFirst({
    where: { locale: 'bn', name: defaultLayoutBn.name },
  });
  if (!existingBn) {
    await prisma.emailLayoutSetting.create({ data: defaultLayoutBn });
  }
  console.log('Email layouts seeded.');

  console.log('Seeding default mail accounts...');
  const defaultAccounts = [
    {
      displayName: 'BPA Info',
      emailAddress: 'info@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'info@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Info',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Admin',
      emailAddress: 'admin@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'admin@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Admin',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Support',
      emailAddress: 'support@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'support@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Support',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Accounts',
      emailAddress: 'accounts@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'accounts@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Accounts',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Media',
      emailAddress: 'media@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'media@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Media',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Vaccination 2026',
      emailAddress: 'vaccination2026@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'vaccination2026@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Vaccination 2026',
      status: 'inactive',
      isDefault: false,
    },
  ];

  for (const acc of defaultAccounts) {
    await prisma.mailAccount.upsert({
      where: { emailAddress: acc.emailAddress },
      update: {
        displayName: acc.displayName,
        smtpHost: acc.smtpHost,
        smtpPort: acc.smtpPort,
        smtpSecure: acc.smtpSecure,
        imapHost: acc.imapHost,
        imapPort: acc.imapPort,
        imapSecure: acc.imapSecure,
        username: acc.username,
        fromName: acc.fromName,
        status: acc.status,
        isDefault: acc.isDefault,
      },
      create: acc,
    });
  }
  console.log('Mail accounts seeded inactive; update passwords from Admin Panel.');
  console.log('─────────────────────────────────────────────');
  console.log('All seed sections complete.');
  console.log(`Diagnostic services: ${diagnosticServices.length}`);
  console.log(`Care partner benefits: ${carePartnerBenefits.length}`);
  console.log(`Social impact programs: ${socialImpactPrograms.length}`);
  console.log(`Roadmap items: ${roadmapItems.length}`);
  // ─── Campaign FAQs (Cat Vaccination 2026) ──────────────────────

  console.log('Seeding campaign FAQs...');

  const defaultFaqs = [
    {
      questionEn: 'Who can register for the campaign?',
      questionBn: 'কে এই ক্যাম্পেইনে নিবন্ধন করতে পারেন?',
      answerEn: 'Any pet owner residing in Dhaka can register their pets for this campaign. No prior membership is required, and registration is open to all.',
      answerBn: 'ঢাকায় বসবাসকারী যেকোনো পোষা প্রাণীর মালিক তাদের পোষা প্রাণীদের জন্য নিবন্ধন করতে পারেন। পূর্বের সদস্যপদের প্রয়োজন নেই এবং নিবন্ধন সবার জন্য উন্মুক্ত।',
      category: 'Registration',
    },
    {
      questionEn: 'Which pets are eligible for vaccination?',
      questionBn: 'কোন পোষা প্রাণী টিকা দেওয়ার জন্য উপযুক্ত?',
      answerEn: 'Healthy cats and dogs aged 8 weeks and above are eligible. Pregnant or nursing animals should consult a veterinarian before vaccination.',
      answerBn: '৮ সপ্তাহ ও তার বেশি বয়সী সুস্থ বিড়াল ও কুকুর উপযুক্ত। গর্ভবতী বা দুধ খাওয়ানো প্রাণীদের টিকা দেওয়ার আগে একজন ভেটেরিনারিয়ানের সাথে পরামর্শ করা উচিত।',
      category: 'Eligibility',
    },
    {
      questionEn: 'What vaccines are included in the campaign?',
      questionBn: 'এই ক্যাম্পেইনে কী কী টিকা অন্তর্ভুক্ত?',
      answerEn: 'The campaign includes core vaccines such as Rabies, DHPP (Distemper, Hepatitis, Parainfluenza, Parvovirus) for dogs, and FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia) for cats. Additional vaccines may be available at selected sessions.',
      answerBn: 'ক্যাম্পেইনে কোর টিকা যেমন কুকুরের জন্য রেবিজ, ডিএইচপিপি (ডিস্টেম্পার, হেপাটাইটিস, প্যারাইনফ্লুয়েঞ্জা, পারভোভাইরাস) এবং বিড়ালের জন্য এফভিআরসিপি (ফেলাইন ভাইরাল রাইনোট্রাকাইটিস, ক্যালিসিভাইরাস, প্যানলিউকোপেনিয়া) অন্তর্ভুক্ত। নির্বাচিত সেশনে অতিরিক্ত টিকা উপলব্ধ থাকতে পারে।',
      category: 'Vaccination',
    },
    {
      questionEn: 'Is payment required for registration?',
      questionBn: 'নিবন্ধনের জন্য কি অর্থপ্রদান প্রয়োজন?',
      answerEn: 'Yes, a nominal registration fee applies per pet. This covers the cost of vaccines, administrative processing, and the digital certificate.',
      answerBn: 'হ্যাঁ, প্রতি পোষা প্রাণীর জন্য একটি নামমাত্র নিবন্ধন ফি প্রযোজ্য। এটি টিকা, প্রশাসনিক প্রক্রিয়াকরণ এবং ডিজিটাল সার্টিফিকেটের খরচ কভার করে।',
      category: 'Payment',
    },
    {
      questionEn: 'What should I bring to the campaign?',
      questionBn: 'ক্যাম্পেইনে কী কী আনতে হবে?',
      answerEn: 'Please bring your booking confirmation (QR code), your pet in a carrier or on a leash, and any previous vaccination records if available.',
      answerBn: 'অনুগ্রহ করে আপনার বুকিং নিশ্চিতকরণ (কিউআর কোড), আপনার পোষা প্রাণী ক্যারিয়ার বা পাঁশে এবং আগের টিকার রেকর্ড (যদি থাকে) নিয়ে আসুন।',
      category: 'Preparation',
    },
    {
      questionEn: 'How does QR check-in work?',
      questionBn: 'কিউআর চেক-ইন কিভাবে কাজ করে?',
      answerEn: 'After registration, you receive a unique QR code via email/SMS. At the venue, staff scan your QR code to verify your booking, check you in, and guide you to the vaccination station.',
      answerBn: 'নিবন্ধনের পরে, আপনি ইমেল/এসএমএসের মাধ্যমে একটি অনন্য QR কোড পাবেন। ভেন্যুতে, কর্মীরা আপনার বুকিং যাচাই করতে, আপনাকে চেক-ইন করতে এবং টিকা স্টেশনে গাইড করতে আপনার QR কোড স্ক্যান করবেন।',
      category: 'Check-in',
    },
    {
      questionEn: 'Will I get a vaccination certificate?',
      questionBn: 'আমি কি একটি টিকা সার্টিফিকেট পাব?',
      answerEn: 'Yes, each vaccinated pet receives a digital certificate with a unique QR code that can be verified online at any time.',
      answerBn: 'হ্যাঁ, প্রতিটি টিকাপ্রাপ্ত পোষা প্রাণী একটি অনন্য QR কোড সহ একটি ডিজিটাল সার্টিফিকেট পাবে যা যেকোনো সময় অনলাইনে যাচাই করা যাবে।',
      category: 'Certificate',
    },
    {
      questionEn: 'Can I register multiple pets?',
      questionBn: 'আমি কি একাধিক পোষা প্রাণী নিবন্ধন করতে পারি?',
      answerEn: 'Yes, you can register up to 10 pets per booking. Simply add each pet during registration. Each pet receives its own QR code and certificate.',
      answerBn: 'হ্যাঁ, আপনি প্রতি বুকিংয়ে সর্বোচ্চ ১০টি পোষা প্রাণী নিবন্ধন করতে পারেন। নিবন্ধনের সময় প্রতিটি পোষা প্রাণী যোগ করুন। প্রতিটি পোষা প্রাণী তার নিজস্ব QR কোড এবং সার্টিফিকেট পায়।',
      category: 'Registration',
    },
    {
      questionEn: 'What if my pet is sick on campaign day?',
      questionBn: 'ক্যাম্পেইনের দিন যদি আমার পোষা প্রাণী অসুস্থ হয়?',
      answerEn: 'If your pet is unwell, please do not bring them to the session. Contact our support team to reschedule or transfer your booking to another session.',
      answerBn: 'যদি আপনার পোষা প্রাণী অসুস্থ হয় তবে অনুগ্রহ করে সেশনে আনবেন না। পুনরায় সময় নির্ধারণ করতে বা আপনার বুকিং অন্য সেশনে স্থানান্তর করতে আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।',
      category: 'Health',
    },
    {
      questionEn: 'How can I verify the vaccination certificate?',
      questionBn: 'আমি কিভাবে টিকা সার্টিফিকেট যাচাই করতে পারি?',
      answerEn: 'Visit the BPA website and go to the "Verify Certificate" page. Enter the certificate number or scan the QR code to instantly verify the authenticity.',
      answerBn: 'বিপিএ ওয়েবসাইটে যান এবং "সার্টিফিকেট যাচাই করুন" পৃষ্ঠায় যান। সার্টিফিকেট নম্বর লিখুন অথবা QR কোড স্ক্যান করুন যাতে তাৎক্ষণিকভাবে সার্টিফিকেটের সত্যতা যাচাই করা যায়।',
      category: 'Certificate',
    },
  ];

  const catCampaign = await prisma.campaign.findFirst({
    where: { slug: 'cat-vaccination-dhaka-2026' },
  });

  if (catCampaign) {
    const existingCount = await prisma.campaignFaq.count({
      where: { campaignId: catCampaign.id },
    });
    if (existingCount === 0) {
      await prisma.campaignFaq.createMany({
        data: defaultFaqs.map((faq, idx) => ({
          campaignId: catCampaign.id,
          questionEn: faq.questionEn,
          questionBn: faq.questionBn,
          answerEn: faq.answerEn,
          answerBn: faq.answerBn,
          category: faq.category,
          sortOrder: idx,
          isActive: true,
        })),
      });
      console.log(`Seeded ${defaultFaqs.length} FAQs for campaign: ${catCampaign.title}`);
    } else {
      console.log(`Skipped FAQ seed — ${existingCount} FAQ(s) already exist for campaign: ${catCampaign.title}`);
    }
  } else {
    console.log('No Cat Vaccination Campaign 2026 found — FAQ seed skipped.');
  }

  console.log('Campaign FAQ seed complete.');
}

import crypto from 'crypto';
function encryptPasswordSeed(password: string): string {
  const ALGORITHM = 'aes-256-cbc';
  const SECRET = process.env.MAIL_CREDENTIAL_SECRET || 'bpa_mail_secret_key_32_bytes_long_!!!';
  const hashKey = crypto.createHash('sha256').update(SECRET).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, hashKey, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
