import 'dotenv/config';
import { LocationType, PrismaClient } from '@prisma/client';

import { seedRolesAndPermissions } from './roles-permissions.seed';
import { seedAdminUser } from './users.seed';
import { seedSiteSettings } from './site-settings.seed';
import { seedLocations } from './locations.seed';
import { seedLocationNodes } from './location-nodes.seed';
import { seedCampaigns } from './campaigns.seed';
import { seedCampaignCoverages } from './campaign-coverages.seed';
import { seedCommunity } from './community.seed';
import { seedMembershipReferenceData } from './membership-reference.seed';
import { seedDonations } from './donations.seed';
import { seedCms } from './cms.seed';
import { seedPayments } from './payments.seed';
import { seedMailSystem } from './mail.seed';
import { seedContactInquiryConfig } from './contact-inquiry.seed';
import { seedClinicDirectory } from './clinic-directory.seed';
import { seedCampaignFaqs } from './campaign-faqs.seed';
import { seedVideoCategories } from './video-categories.seed';
import { seedAppControl } from './app-control.seed';
import { seedAppControlReferenceData } from './app-control-reference.seed';
import { seedPartnerClinics } from './partner-clinics.seed';

const prisma = new PrismaClient();

function line(char = '─', width = 64) {
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
  { label: 'Campaign coverages', delegate: 'campaignCoverage' },
  { label: 'Community zones', delegate: 'communityZone' },
  { label: 'Contribution plans', delegate: 'contributionPlan' },
  { label: 'Membership programs', delegate: 'communityMembershipProgram' },
  { label: 'Membership tiers', delegate: 'communityMembershipTier' },
  { label: 'Membership benefits', delegate: 'communityMembershipBenefit' },
  { label: 'Membership v2 benefits', delegate: 'membershipBenefit' },
  { label: 'Membership plan links', delegate: 'membershipPlanBenefit' },
  { label: 'Membership FAQs', delegate: 'membershipFaq' },
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
  { label: 'Payment placeholders', delegate: 'petSmartSyncSetting' },
  { label: 'Email layouts', delegate: 'emailLayoutSetting' },
  { label: 'Mail accounts', delegate: 'mailAccount' },
  { label: 'Contact types', delegate: 'contactType' },
  { label: 'Inquiry categories', delegate: 'inquiryCategory' },
  { label: 'Contact departments', delegate: 'contactDepartment' },
  { label: 'Contact priority rules', delegate: 'contactPriorityRule' },
  { label: 'Clinic organizations', delegate: 'clinicOrganization' },
  { label: 'Clinic branches', delegate: 'clinicBranch' },
  { label: 'Clinic branch phones', delegate: 'clinicBranchPhone' },
  { label: 'Clinic branch services', delegate: 'clinicBranchService' },
  { label: 'Clinic branch facilities', delegate: 'clinicBranchFacility' },
  { label: 'Clinic branch animal types', delegate: 'clinicBranchAnimalType' },
  { label: 'Clinic branch sources', delegate: 'clinicBranchSource' },
  { label: 'Campaign FAQs', delegate: 'campaignFaq' },
  { label: 'Content categories', delegate: 'contentCategory' },
  { label: 'App home sections', delegate: 'appHomeSection' },
  { label: 'App navigation items', delegate: 'appNavigationItem' },
  { label: 'App page contents', delegate: 'appPageContent' },
  { label: 'App banners', delegate: 'appBanner' },
  { label: 'App quick actions', delegate: 'appQuickAction' },
  { label: 'App featured services', delegate: 'appFeaturedService' },
  { label: 'App offers', delegate: 'appOffer' },
  { label: 'App tutorial guides', delegate: 'appTutorialGuide' },
  { label: 'App version settings', delegate: 'appVersionSetting' },
  { label: 'App theme settings', delegate: 'appThemeSetting' },
  { label: 'App popup notices', delegate: 'appPopupNotice' },
  { label: 'Partner clinics (curated)', delegate: 'partnerClinic' },
];

async function printFinalCounts(db: PrismaClient) {
  section('Final Critical Model Counts');

  for (const item of CRITICAL_MODEL_COUNTS) {
    const delegate = (db as unknown as Record<string, { count: () => Promise<number> }>)[item.delegate];
    const count = await delegate.count();
    console.log(`  ${item.label.padEnd(28)} ${count}`);
  }

  console.log(`  ${'Location DIVISION'.padEnd(28)}${await db.location.count({ where: { type: LocationType.DIVISION, isActive: true } })}`);
  console.log(`  ${'Location DISTRICT'.padEnd(28)}${await db.location.count({ where: { type: LocationType.DISTRICT, isActive: true } })}`);
  console.log(`  ${'Location UPAZILA'.padEnd(28)}${await db.location.count({ where: { type: LocationType.UPAZILA, isActive: true } })}`);
  console.log(`  ${'Location THANA'.padEnd(28)}${await db.location.count({ where: { type: LocationType.THANA, isActive: true } })}`);
  console.log(`  ${'Location UNION'.padEnd(28)}${await db.location.count({ where: { type: LocationType.UNION, isActive: true } })}`);
  console.log(`  ${'Location CITY_CORPORATION'.padEnd(28)}${await db.location.count({ where: { type: LocationType.CITY_CORPORATION, isActive: true } })}`);
  console.log(`  ${'Location CITY_ZONE'.padEnd(28)}${await db.location.count({ where: { type: LocationType.CITY_ZONE, isActive: true } })}`);
  console.log(`  ${'Location WARD'.padEnd(28)}${await db.location.count({ where: { type: LocationType.WARD, isActive: true } })}`);
}

async function main() {
  console.log(`\n${line('═')}`);
  console.log(' BPA Database Seeder — Complete Idempotent Setup');
  console.log(` Started: ${new Date().toISOString()}`);
  console.log(line('═'));

  section('1/19 Roles & Permissions');
  const roles = await seedRolesAndPermissions(prisma);
  console.log(`  Permissions      ${roles.permissions.total}`);
  console.log(`  Roles            ${roles.roles.upserted}`);
  console.log(`  Role mappings    ${roles.mappings.upserted}`);

  section('2/19 Admin User');
  const admin = await seedAdminUser(prisma);
  if (admin.skipped) {
    console.log(`  Skipped          ${admin.reason}`);
  } else {
    console.log(`  Admin email      ${admin.email}`);
    console.log(`  Admin role       ${admin.role}`);
  }

  section('3/19 Site Settings');
  const site = await seedSiteSettings(prisma);
  console.log(`  Upserted         ${site.upserted}`);

  section('4/19 Location Hierarchy');
  const locations = await seedLocations(prisma);
  console.log(`  Country          ${locations.country}`);
  console.log(`  Divisions        ${locations.divisions}`);
  console.log(`  Districts        ${locations.districts}`);
  console.log(`  City corps       ${locations.cityCorporations}`);
  console.log(`  Zones            ${locations.zones}`);

  section('5/19 Location Nodes');
  const locationNodes = await seedLocationNodes(prisma);
  console.log(`  Divisions        ${locationNodes.divisions}`);
  console.log(`  Districts        ${locationNodes.districts}`);
  console.log(`  City corps       ${locationNodes.cityCorporations}`);
  console.log(`  Zones            ${locationNodes.zones}`);
  console.log(`  Upazilas         ${locationNodes.upazilas}`);
  console.log(`  Unions           ${locationNodes.unions}`);
  console.log(`  Wards            ${locationNodes.wards}`);

  section('6/19 Campaigns & Vaccines');
  const campaigns = await seedCampaigns(prisma);
  console.log(`  Vaccines         ${campaigns.vaccines.created} created, ${campaigns.vaccines.skipped} existing`);
  console.log(`  Cert template    ${campaigns.certTemplate}`);
  console.log(`  Campaign         ${campaigns.campaign}`);
  console.log(`  Services         ${campaigns.services}`);
  console.log(`  Sessions         ${campaigns.sessions}`);

  section('7/19 Campaign Coverages');
  const coverages = await seedCampaignCoverages(prisma);
  console.log(`  Coverage rows    ${coverages.coverages}`);

  section('8/19 Community & Membership Engine');
  const community = await seedCommunity(prisma);
  console.log(`  Community zones  ${community.zones}`);
  console.log(`  Contribution plan${community.contributionPlan}`);
  console.log(`  Membership prog  ${community.membershipProgram}`);
  console.log(`  Membership tiers ${community.tiers}`);
  console.log(`  Services         ${community.services}`);
  console.log(`  Tier discounts   ${community.discounts}`);
  console.log(`  Benefits         ${community.benefits}`);
  console.log(`  Documents        ${community.documents}`);
  console.log(`  Diagnostic svc   ${community.diagnosticServices}`);
  console.log(`  Care benefits    ${community.carePartnerBenefits}`);
  console.log(`  Social impact    ${community.socialImpact}`);
  console.log(`  Roadmap items    ${community.roadmap}`);

  section('9/19 Membership Reference Data');
  const membershipRefs = await seedMembershipReferenceData(prisma);
  console.log(`  Benefit rows     ${membershipRefs.benefits}`);
  console.log(`  Plan links       ${membershipRefs.planBenefits}`);
  console.log(`  FAQ rows         ${membershipRefs.faqs}`);

  section('10/19 Donation System');
  const donations = await seedDonations(prisma);
  console.log(`  Purposes         ${donations.purposes}`);
  console.log(`  Campaigns        ${donations.campaigns}`);
  console.log(`  Stories          ${donations.stories}`);
  console.log(`  QR codes         ${donations.qrCodes}`);
  console.log(`  Page settings    ${donations.pageSetting}`);
  console.log(`  Transparency     ${donations.transparency}`);

  section('11/19 CMS');
  const cms = await seedCms(prisma);
  console.log(`  News categories  ${cms.categories}`);
  console.log(`  News tags        ${cms.tags}`);
  console.log(`  Homepage         ${cms.homepage}`);
  console.log(`  Sections         ${cms.sections}`);
  console.log(`  Hero slides      ${cms.slides}`);
  console.log(`  Footer config    ${cms.footer}`);
  console.log(`  Pet census setup ${cms.petCensus}`);

  section('12/19 Payment Settings');
  const payments = await seedPayments(prisma);
  console.log(`  PSS settings     ${payments.pssSettings.upserted}`);

  section('13/19 Mail System');
  const mail = await seedMailSystem(prisma);
  console.log(`  Email layouts    ${mail.emailLayouts}`);
  console.log(`  Mail accounts    ${mail.mailAccounts}`);

  section('14/19 Contact Inquiry Config');
  const contact = await seedContactInquiryConfig(prisma);
  console.log(`  Contact types    ${contact.types.created} created, ${contact.types.skipped} existing`);
  console.log(`  Categories       ${contact.categories.created} created, ${contact.categories.skipped} existing`);
  console.log(`  Departments      ${contact.departments.upserted}`);
  console.log(`  Priority rules   ${contact.priorityRules.upserted}`);

  section('15/19 Clinic Directory');
  const clinic = await seedClinicDirectory(prisma);
  console.log(`  Organizations    ${clinic.organizations}`);
  console.log(`  Branches         ${clinic.branches}`);
  console.log(`  Phones           ${clinic.phones}`);
  console.log(`  Hours            ${clinic.openingHours}`);
  console.log(`  Services         ${clinic.services}`);
  console.log(`  Animal types     ${clinic.animalTypes}`);
  console.log(`  Facilities       ${clinic.facilities}`);
  console.log(`  Sources          ${clinic.sources}`);
  console.log(`  Social links     ${clinic.socialLinks}`);
  console.log(`  Images           ${clinic.images}`);

  section('16/19 Campaign FAQs');
  const faqs = await seedCampaignFaqs(prisma);
  console.log(`  FAQ rows         ${faqs.total}`);

  section('17/19 Video Content Categories');
  const videoCategories = await seedVideoCategories(prisma);
  console.log(`  Attempted        ${videoCategories.attempted}`);
  console.log(`  Upserted         ${videoCategories.insertedOrUpdated}`);
  console.log(`  Matching         ${videoCategories.totalMatching}`);
  console.log(`  Unique slugs     ${videoCategories.uniqueSlugs}`);
  console.log(`  Missing slugs    ${videoCategories.missingSlugs.join(',') || 'none'}`);
  console.log(`  Duplicate slugs  ${videoCategories.duplicateSlugs.join(',') || 'none'}`);

  section('18/19 App Control Core');
  const appControl = await seedAppControl(prisma);
  console.log(`  Home sections    ${appControl.homeSections}`);
  console.log(`  Navigation items ${appControl.navigationItems}`);
  console.log(`  Page contents    ${appControl.pageContents}`);
  console.log(`  Banners          ${appControl.banners}`);
  console.log(`  Version settings ${appControl.versionSettings}`);
  console.log(`  Theme settings   ${appControl.themeSettings}`);
  console.log(`  Popup notices    ${appControl.popupNotices}`);

  section('19/19 App Control Reference Data');
  const appControlRefs = await seedAppControlReferenceData(prisma);
  console.log(`  Quick actions    ${appControlRefs.quickActions}`);
  console.log(`  Featured svc     ${appControlRefs.featuredServices}`);
  console.log(`  Offers           ${appControlRefs.offers}`);
  console.log(`  Tutorials        ${appControlRefs.tutorialsGuides}`);

  section('20/20 Partner Clinics (curated homepage list)');
  const partnerClinics = await seedPartnerClinics(prisma);
  console.log(`  Curated clinics  ${partnerClinics.partnerClinics} (intentionally empty — curate via BPA Admin)`);

  await printFinalCounts(prisma);

  console.log(`\n${line('═')}`);
  console.log(' SEED COMPLETE');
  console.log(` Finished: ${new Date().toISOString()}`);
  console.log(line('═'));
}

main()
  .catch((error) => {
    console.error('\n[SEED FAILED]', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
