/**
 * BPA Backend API — Master Database Seeder
 *
 * Idempotent: safe to run multiple times. Uses upsert / findFirst guards.
 * No production data is deleted or truncated.
 *
 * Usage:
 *   npm run db:seed
 *
 * Required env vars for admin user:
 *   SEED_ADMIN_EMAIL     (or ROOT_ADMIN_EMAIL)
 *   SEED_ADMIN_PASSWORD  (or ROOT_ADMIN_PASSWORD)
 *   SEED_ADMIN_NAME      (or ROOT_ADMIN_NAME)   — optional, defaults to "BPA Super Admin"
 */

import 'dotenv/config';
import { LocationType, PrismaClient } from '@prisma/client';

import { seedRolesAndPermissions } from './roles-permissions.seed';
import { seedAdminUser } from './users.seed';
import { seedSiteSettings } from './site-settings.seed';
import { seedLocations } from './locations.seed';
import { seedLocationNodes } from './location-nodes.seed';
import { seedCampaigns } from './campaigns.seed';
import { seedCommunity } from './community.seed';
import { seedDonations } from './donations.seed';
import { seedCms } from './cms.seed';
import { seedPayments } from './payments.seed';
import { seedMailSystem } from './mail.seed';
import { seedContactInquiryConfig } from './contact-inquiry.seed';
import { seedCampaignFaqs } from './campaign-faqs.seed';
import { seedAppControl } from './app-control.seed';
import { seedVideoCategories } from './video-categories.seed';

const prisma = new PrismaClient();

function line(char = '─', width = 60) {
  return char.repeat(width);
}

function section(title: string) {
  console.log(`\n${line()}`);
  console.log(` ${title}`);
  console.log(line());
}

const CRITICAL_MODEL_COUNTS: Array<{ label: string; delegate: string }> = [
  { label: 'Roles', delegate: 'role' },
  { label: 'Permissions', delegate: 'permission' },
  { label: 'Role permissions', delegate: 'rolePermission' },
  { label: 'Users', delegate: 'user' },
  { label: 'Site settings', delegate: 'siteSettings' },
  { label: 'Countries', delegate: 'country' },
  { label: 'Legacy divisions', delegate: 'division' },
  { label: 'Legacy districts', delegate: 'district' },
  { label: 'Legacy city corporations', delegate: 'cityCorporation' },
  { label: 'Legacy city zones', delegate: 'zone' },
  { label: 'Vaccine catalog', delegate: 'vaccineCatalog' },
  { label: 'Certificate templates', delegate: 'certificateTemplate' },
  { label: 'Campaigns', delegate: 'campaign' },
  { label: 'Campaign services', delegate: 'campaignService' },
  { label: 'Campaign sessions', delegate: 'campaignSession' },
  { label: 'Community zones', delegate: 'communityZone' },
  { label: 'Contribution plans', delegate: 'contributionPlan' },
  { label: 'Membership programs', delegate: 'communityMembershipProgram' },
  { label: 'Membership tiers', delegate: 'communityMembershipTier' },
  { label: 'Membership benefits', delegate: 'communityMembershipBenefit' },
  { label: 'Donation purposes', delegate: 'donationPurpose' },
  { label: 'Donation campaigns', delegate: 'donationCampaign' },
  { label: 'Donation page settings', delegate: 'donationPageSetting' },
  { label: 'Donation impact stories', delegate: 'donationImpactStory' },
  { label: 'Donation QR codes', delegate: 'donationQrCode' },
  { label: 'News categories', delegate: 'newsCategory' },
  { label: 'News tags', delegate: 'newsTag' },
  { label: 'Homepages', delegate: 'homepage' },
  { label: 'Homepage sections', delegate: 'homepageSection' },
  { label: 'Hero slides', delegate: 'heroSlide' },
  { label: 'Footer configs', delegate: 'footerConfig' },
  { label: 'Footer link groups', delegate: 'footerLinkGroup' },
  { label: 'Footer links', delegate: 'footerLink' },
  { label: 'Pet census campaigns', delegate: 'petCensusCampaign' },
  { label: 'Payment placeholders', delegate: 'petSmartSyncSetting' },
  { label: 'Email layouts', delegate: 'emailLayoutSetting' },
  { label: 'Mail accounts', delegate: 'mailAccount' },
  { label: 'Contact types', delegate: 'contactType' },
  { label: 'Inquiry categories', delegate: 'inquiryCategory' },
  { label: 'Campaign FAQs', delegate: 'campaignFaq' },
  { label: 'App home sections', delegate: 'appHomeSection' },
  { label: 'App navigation items', delegate: 'appNavigationItem' },
  { label: 'App page contents', delegate: 'appPageContent' },
  { label: 'App banners', delegate: 'appBanner' },
  { label: 'App version settings', delegate: 'appVersionSetting' },
  { label: 'App theme settings', delegate: 'appThemeSetting' },
  { label: 'App popup notices', delegate: 'appPopupNotice' },
  { label: 'Content categories', delegate: 'contentCategory' },
];

async function printFinalCounts(prisma: PrismaClient) {
  section('Final Critical Model Counts');

  for (const item of CRITICAL_MODEL_COUNTS) {
    const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[item.delegate];
    const count = await delegate.count();
    console.log(`  ${item.label.padEnd(28)} ${count}`);
  }

  console.log('  ' + 'Location DIVISION'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.DIVISION, isActive: true } }));
  console.log('  ' + 'Location DISTRICT'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.DISTRICT, isActive: true } }));
  console.log('  ' + 'Location UPAZILA'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.UPAZILA, isActive: true } }));
  console.log('  ' + 'Location THANA'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.THANA, isActive: true } }));
  console.log('  ' + 'Location UNION'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.UNION, isActive: true } }));
  console.log('  ' + 'Location CITY_CORPORATION'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.CITY_CORPORATION, isActive: true } }));
  console.log('  ' + 'Location CITY_ZONE'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.CITY_ZONE, isActive: true } }));
  console.log('  ' + 'Location WARD'.padEnd(28) + await prisma.location.count({ where: { type: LocationType.WARD, isActive: true } }));
}

async function main() {
  console.log('\n' + line('═'));
  console.log(' BPA Database Seeder — Complete Idempotent Setup');
  console.log(` Started: ${new Date().toISOString()}`);
  console.log(line('═'));

  // ── 1. Roles & Permissions ────────────────────────────────────────────────
  section('1/13  Roles & Permissions');
  const rolesResult = await seedRolesAndPermissions(prisma);
  console.log(`  ✓ Permissions  : ${rolesResult.permissions.total} (all resources × actions)`);
  console.log(`  ✓ Roles        : ${rolesResult.roles.upserted} upserted`);
  console.log(`  ✓ Role mappings: ${rolesResult.mappings.upserted} synced`);
  console.log(`    Roles: super_admin, admin, editor, viewer, campaign_manager, campaign_volunteer, community_fund_admin, community_fund_viewer`);

  // ── 2. Admin User ──────────────────────────────────────────────────────────
  section('2/13  Admin User');
  const userResult = await seedAdminUser(prisma);
  if (userResult.skipped) {
    console.log(`  ⚠  Admin user skipped: ${userResult.reason}`);
    if (userResult.reason === 'no_password') {
      console.log('     Set SEED_ADMIN_PASSWORD (or ROOT_ADMIN_PASSWORD) in .env and re-run.');
      console.log('     Campaign seed will create the vaccine catalog/certificate template, then skip campaign creation until the admin user exists.');
    }
  } else {
    console.log(`  ✓ Admin email  : ${userResult.email}`);
    console.log(`  ✓ Admin role   : ${userResult.role}`);
    console.log(`  ✓ Status       : upserted (password updated if changed in .env)`);
  }

  // ── 3. Site Settings ──────────────────────────────────────────────────────
  section('3/13  Site Settings');
  const settingsResult = await seedSiteSettings(prisma);
  console.log(`  ✓ SiteSettings singleton upserted (id=default): ${settingsResult.upserted} row`);

  // ── 4. Location Hierarchy ─────────────────────────────────────────────────
  section('4/13  Location Hierarchy');
  const locResult = await seedLocations(prisma);
  console.log(`  ✓ Country      : ${locResult.country}`);
  console.log(`  ✓ Divisions    : ${locResult.divisions}`);
  console.log(`  ✓ Districts    : ${locResult.districts}`);
  console.log(`  ✓ City Corps   : ${locResult.cityCorporations} (DNCC, DSCC)`);
  console.log(`  ✓ Zones        : ${locResult.zones} (DNCC×10 + DSCC×10)`);

  // ── 5. Location Nodes (unified tree from flat hierarchy) ──────────────────
  section('5/13  Location Nodes (unified tree)');
  const nodeResult = await seedLocationNodes(prisma);
  console.log(`  Active tree counts include ${nodeResult.upazilas} upazilas, ${nodeResult.unions} unions, and ${nodeResult.wards} wards`);
  if (nodeResult.deactivatedLegacyNodes > 0) {
    console.log(`  Legacy subset nodes deactivated: ${nodeResult.deactivatedLegacyNodes}`);
  }
  console.log(`  ✓ Divisions    : ${nodeResult.divisions} nodes`);
  console.log(`  ✓ Districts    : ${nodeResult.districts} nodes`);
  console.log(`  ✓ City Corps   : ${nodeResult.cityCorporations} nodes`);
  console.log(`  ✓ Zones        : ${nodeResult.zones} nodes`);

  // ── 6. Campaigns & Vaccines ───────────────────────────────────────────────
  section('6/13  Campaigns & Vaccine Catalog');
  const campResult = await seedCampaigns(prisma);
  console.log(`  ✓ Vaccines     : ${campResult.vaccines.created} created, ${campResult.vaccines.skipped} already existed`);
  console.log(`  ✓ Cert template: ${campResult.certTemplate}`);
  console.log(`  ✓ Campaign     : Cat Vaccination Dhaka 2026 — ${campResult.campaign}`);
  console.log(`  ✓ Svcs/Sessions: ${campResult.services} services, ${campResult.sessions} session(s)`);

  // ── 6. Community & Membership ─────────────────────────────────────────────
  section('7/13  Community & Membership Engine');
  const commResult = await seedCommunity(prisma);
  console.log(`  ✓ Community zones        : ${commResult.zones}`);
  console.log(`  ✓ Contribution plan      : ${commResult.contributionPlan}`);
  console.log(`  ✓ Membership program     : ${commResult.membershipProgram}`);
  console.log(`  ✓ Membership tiers       : ${commResult.tiers} (Primary, Premium, Enterprise)`);
  console.log(`  ✓ Membership services    : ${commResult.services} new`);
  console.log(`  ✓ Tier discounts         : ${commResult.discounts} synced`);
  console.log(`  ✓ Membership benefits    : ${commResult.benefits} new`);
  console.log(`  ✓ Membership documents   : ${commResult.documents} new`);
  console.log(`  ✓ Diagnostic services    : ${commResult.diagnosticServices} new`);
  console.log(`  ✓ Care partner benefits  : ${commResult.carePartnerBenefits} new`);
  console.log(`  ✓ Social impact programs : ${commResult.socialImpact} new`);
  console.log(`  ✓ Roadmap items          : ${commResult.roadmap} new`);

  // ── 7. Donations ──────────────────────────────────────────────────────────
  section('8/13  Donation System');
  const donResult = await seedDonations(prisma);
  console.log(`  ✓ Purposes         : ${donResult.purposes}`);
  console.log(`  ✓ Campaigns        : ${donResult.campaigns}`);
  console.log(`  ✓ Impact stories   : ${donResult.stories}`);
  console.log(`  ✓ QR codes         : ${donResult.qrCodes}`);
  console.log(`  ✓ Page settings    : ${donResult.pageSetting}`);
  console.log(`  ✓ Transparency rpt : ${donResult.transparency}`);

  // ── 8. CMS ────────────────────────────────────────────────────────────────
  section('9/13  CMS (Homepage, Hero Slides, Footer, News)');
  const cmsResult = await seedCms(prisma);
  console.log(`  ✓ News categories  : ${cmsResult.categories}`);
  console.log(`  ✓ News tags        : ${cmsResult.tags}`);
  console.log(`  ✓ Homepage record  : ${cmsResult.homepage} (locale=en)`);
  console.log(`  ✓ Homepage sections: ${cmsResult.sections} new`);
  console.log(`  ✓ Hero slides      : ${cmsResult.slides} new`);
  console.log(`  ✓ Footer config    : ${cmsResult.footer} (with link groups & links)`);
  console.log(`  ✓ Pet Census setup : ${cmsResult.petCensus}`);

  // ── 9. Payment / Integration Placeholders ─────────────────────────────────
  section('10/13 Payment & Integration Settings');
  const payResult = await seedPayments(prisma);
  console.log(`  ✓ PSS settings: ${payResult.pssSettings.upserted} placeholder keys upserted`);
  console.log(`    (Activate via admin panel → PetSmart → Settings)`);

  // ── 10. Mail & Communications System ──────────────────────────────────────
  section('11/14 Mail & Communications System');
  const mailResult = await seedMailSystem(prisma);
  console.log(`  ✓ Email Layouts    : ${mailResult.emailLayouts} layouts seeded`);
  console.log(`  ✓ Mail Accounts    : ${mailResult.mailAccounts} accounts seeded`);
  console.log('  Mail accounts seeded inactive; update passwords from Admin Panel.');

  // ── 11. Contact Inquiry Config ─────────────────────────────────────────────
  section('12/14 Contact Inquiry Config');
  const ciResult = await seedContactInquiryConfig(prisma);
  console.log(`  ✓ Contact types    : ${ciResult.types.created} created, ${ciResult.types.skipped} already existed`);
  console.log(`  ✓ Inquiry categories: ${ciResult.categories.created} created, ${ciResult.categories.skipped} already existed`);

  // ── 13. Campaign FAQs ───────────────────────────────────────────────────────
  section('13/14 Campaign FAQs');
  const faqResult = await seedCampaignFaqs(prisma);
  console.log(`  ✓ Campaign FAQs    : ${faqResult.created} created, ${faqResult.skipped} skipped, ${faqResult.total} total`);

  section('14/14 BPA App Control');
  const appControlResult = await seedAppControl(prisma);
  console.log(`  âœ“ Home sections    : ${appControlResult.homeSections}`);
  console.log(`  âœ“ Navigation items : ${appControlResult.navigationItems}`);
  console.log(`  âœ“ Page contents    : ${appControlResult.pageContents}`);
  console.log(`  âœ“ Sample banners   : ${appControlResult.banners} disabled by default`);
  console.log(`  âœ“ Version settings : ${appControlResult.versionSettings}`);
  console.log(`  âœ“ Theme settings   : ${appControlResult.themeSettings}`);
  console.log(`  âœ“ Popup notices    : ${appControlResult.popupNotices} disabled by default`);
  console.log(`  âœ“ Maintenance mode : ${appControlResult.maintenanceDisabled ? 'disabled' : 'enabled'}`);

  section('Video Content Categories');
  const videoCategoryResult = await seedVideoCategories(prisma);
  console.log(`  ✓ Attempted         : ${videoCategoryResult.attempted}`);
  console.log(`  ✓ Inserted/updated  : ${videoCategoryResult.insertedOrUpdated}`);
  console.log(`  ✓ Video categories  : ${videoCategoryResult.totalMatching}/${videoCategoryResult.attempted}`);
  console.log(`  ✓ Unique slugs      : ${videoCategoryResult.uniqueSlugs}/${videoCategoryResult.attempted}`);
  console.log(`  ✓ Missing slugs     : ${videoCategoryResult.missingSlugs.join(',') || 'none'}`);
  console.log(`  ✓ Duplicate slugs   : ${videoCategoryResult.duplicateSlugs.join(',') || 'none'}`);

  await printFinalCounts(prisma);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + line('═'));
  console.log(' SEED COMPLETE');
  console.log(` Finished: ${new Date().toISOString()}`);
  console.log(line('═'));
  console.log('\n Next steps:');
  console.log('  1. Add SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD to .env, then re-run db:seed to create the admin user');
  console.log('  2. Upload real images via Admin → Media for hero slides');
  console.log('  3. Confirm EPS payment credentials in .env for live donations');
  console.log('  4. Campaign "Cat Vaccination Dhaka 2026" is seeded as registration_open — publish sessions from Admin when ready');
  console.log('  5. Run: npx prisma studio  — to inspect seeded data visually');
  console.log('');
}

main()
  .catch((e) => {
    console.error('\n[SEED FAILED]', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
