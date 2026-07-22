# BPA Recovery Base Report

- Recovery source: `D:\bpa_main\bpa_web_api`
- Recovered SHA: `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- Branch: `recovery/genuine-bpa-api-20260721`
- Remote: `https://github.com/balagpetcare/bpa_web_api.git`
- Bundle path: `C:\bpa-api-recovery-audit\genuine-bpa-api-c73c267.bundle`

## Genuine BPA identity evidence

- `package.json`
  - `name`: `bpa-backend-api`
  - `description`: `Bangladesh Pet Association — Backend API`
- `README`: none present at this commit.
- `prisma/schema.prisma`
  - 148 Prisma models.
  - Includes BPA-specific domains for membership, membership campaigns, donations, pet census, vaccination, certificates, campaigns, locations, app-control, and transparency.
- `src/modules`
  - Includes `membership-campaign`, `community-membership`, `donations`, `pet-census`, `vaccination`, `campaign-certificates`, `campaign-registrations`, `care-partner-cards`, `community-zones`, `app-control`, `me`, and related BPA modules.
- Commit-level evidence from `c73c267`
  - BPA `/api/v1/me/pets` BFF docs and `src/modules/me/*` BPA/Furtail API work.
- Migration and seed evidence at this recovered commit
  - vaccination campaigns
  - membership campaigns
  - pet census
  - donations
  - campaign registrations
  - certificates
  - Community Care Partner
  - DNCC / DSCC

## Recovery worktree identity

- Recovery destination: `D:\bpa_main\backend-api-recovered`
- HEAD SHA: `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- Branch: `recovery/genuine-bpa-api-20260721`
- File count: `513`
- Package identity: `bpa-backend-api@1.0.0`

## Prisma model list

`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `AuthAccount`, `OtpCode`, `PasswordResetToken`, `EmailVerificationToken`, `RefreshToken`, `AuditLog`, `NewsCategory`, `NewsTag`, `News`, `Event`, `EventRegistration`, `CommitteeMember`, `Volunteer`, `Member`, `Membership`, `Payment`, `ContactSubmission`, `ContactType`, `InquiryCategory`, `ContactDepartment`, `ContactPriorityRule`, `ContactInquiry`, `ContactReply`, `ContactForward`, `ContactInternalNote`, `MediaFile`, `SeoMetadata`, `Homepage`, `HomepageSection`, `HomepageSectionItem`, `HeroSlide`, `Partner`, `FooterConfig`, `FooterLinkGroup`, `FooterLink`, `SmsLog`, `SmsAttempt`, `EmailLog`, `Country`, `Division`, `District`, `CityCorporation`, `Zone`, `Venue`, `Location`, `VaccineCatalog`, `CertificateTemplate`, `PetOwner`, `Pet`, `Doctor`, `VolunteerCoverageArea`, `Campaign`, `CampaignCoverage`, `CampaignMedia`, `CampaignSession`, `CampaignService`, `CampaignDoctor`, `CampaignVolunteer`, `CampaignStaffAssignment`, `CampaignRegistration`, `PetBooking`, `PetBookingService`, `CampaignWaitlist`, `CampaignAnalytics`, `CampaignFaq`, `BulkSmsBatch`, `QRScanLog`, `Certificate`, `VaccinationRecord`, `CommunityZone`, `ContributionPlan`, `CareContribution`, `CarePartnerCard`, `CardVerificationLog`, `PetCensusCampaign`, `PetCensusSubmission`, `TransparencyReport`, `CarePartnerBenefit`, `SocialImpactProgram`, `RoadmapItem`, `DiagnosticCenterService`, `PetSmartSyncSetting`, `PetSmartSyncLog`, `CommunityMembershipProgram`, `CommunityMembershipTier`, `CommunityMembershipService`, `CommunityTierServiceDiscount`, `CommunityMembershipBenefit`, `CommunityTierBenefitMapping`, `CommunityMembershipPurchase`, `CommunityMembershipCard`, `CommunityMembershipCardVerificationLog`, `CommunityMembershipUpgrade`, `CommunityMembershipDocument`, `MembershipCampaign`, `MembershipPlan`, `MembershipBenefit`, `MembershipPlanBenefit`, `MembershipMedia`, `MembershipDocument`, `MembershipFaq`, `MembershipApplication`, `MembershipCoveredPet`, `MembershipPetReplacement`, `MembershipServiceUsage`, `MembershipUpgrade`, `SiteSettings`, `DonationPurpose`, `DonationCampaign`, `Donation`, `DonationQrCode`, `DonationImpactStory`, `DonationTransparencyReport`, `DonationPageSetting`, `EmailLayoutSetting`, `MailAccount`, `MailThread`, `MailMessage`, `MailRecipient`, `MailAttachment`, `MailSyncLog`, `MailInternalNote`, `ContentPost`, `ContentCategory`, `ContentComment`, `ContentReaction`, `ContentReport`, `AdminNotification`, `ActivityEvent`, `AppHomeSection`, `AppBanner`, `AppQuickAction`, `AppFeaturedService`, `AppOffer`, `AppNavigationItem`, `AppPageContent`, `AppThemeSetting`, `AppVersionSetting`, `AppPopupNotice`, `AppTutorialGuide`, `PartnerClinic`, `AppAuditLog`, `CampaignVideo`

## Route / module list

`analytics`, `app`, `app-control`, `auth`, `campaign-certificates`, `campaign-checkin`, `campaign-faqs`, `campaign-field-ops`, `campaign-participants`, `campaign-registrations`, `campaign-staff-assignments`, `campaigns`, `care-contributions`, `care-partner-benefits`, `care-partner-cards`, `committee`, `community-fund`, `community-membership`, `community-zones`, `contact-inquiry`, `contacts`, `content`, `contribution-plans`, `dashboard`, `diagnostic-center-services`, `doctors`, `donations`, `email-logs`, `emails`, `events`, `homepage`, `locations`, `mail`, `me`, `media`, `membership`, `membership-campaign`, `memberships`, `news`, `notifications`, `partner-clinics`, `payments`, `pet-census`, `pet-smart-solution`, `pets`, `roadmap-items`, `roles`, `seo`, `site-settings`, `sms-logs`, `social-impact-programs`, `transparency-reports`, `users`, `vaccination`, `vaccine-catalog`, `volunteers`

## Dependency installation result

- Command: `npm ci`
- Result: succeeded using the existing `package-lock.json`

## Prisma generation result

- Command: `npx prisma generate`
- Result: succeeded
- Generated Prisma Client version: `5.22.0`

## Type-check result

- Command: `npm run typecheck`
- Result: succeeded

## Test result

- Command: `npm test`
- Result: failed
- Failure class: local environment configuration, not source recovery failure
- Exact cause:
  - `DATABASE_URL` is not configured in the recovered worktree
  - Prisma-backed test suites abort during env validation / Prisma initialization
- Representative failing areas:
  - campaign venue/session tests
  - campaign media tests
  - membership-campaign tests
  - me/Furtail client tests

## Build result

- Command: `npm run build`
- Result: succeeded

## Detected secrets or unsafe files

- Tracked env-style files present:
  - `.env.example`
  - `.env.local.example`
  - `.env.production.example`
- These contain placeholders and example keys only; no confirmed live secrets were printed or recovered from them.
- No confirmed tracked private keys, token dumps, uploads, database dumps, or live credential files were found.
- No quarantine action was required because no confirmed sensitive tracked file was identified.

## Safety confirmation

- `D:\bpa_main\backend-api` was untouched.
- `D:\bpa_main\bpa_web_api` working tree and branch were not modified.
- No production database migrations were run.
- No Git push was performed.
