import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { corsOrigins, config } from './config';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestIdMiddleware } from './middlewares/requestId';

// Extensions the `mime` package (used internally by express.static) gets
// wrong or doesn't know at all — see the `/uploads` static mount below.
const STATIC_MIME_OVERRIDES: Record<string, string> = {
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  webp: 'image/webp',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};
import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import rolesRouter from './modules/roles/roles.router';
import newsRouter from './modules/news/news.router';
import eventsRouter from './modules/events/events.router';
import committeeRouter from './modules/committee/committee.router';
import mediaRouter from './modules/media/media.router';
import seoRouter from './modules/seo/seo.router';
import contactsRouter from './modules/contacts/contacts.router';
import volunteersRouter from './modules/volunteers/volunteers.router';
import analyticsRouter from './modules/analytics/analytics.router';
import membershipRouter from './modules/membership/membership.router';
import paymentsRouter from './modules/payments/payments.router';
import paymentCallbacksRouter from './modules/payments/payment-callbacks.router';
import publicPaymentsRouter from './modules/payments/public-payments.router';
import publicBookingsRouter from './modules/payments/public-bookings.router';
import smsLogsRouter from './modules/sms-logs/sms-logs.router';
import emailLogsRouter from './modules/email-logs/email-logs.router';
import locationsRouter from './modules/locations/locations.router';
import publicLocationsRouter, { adminLocationTreeRouter } from './modules/locations/location-tree.router';
import vaccineCatalogRouter from './modules/vaccine-catalog/vaccine-catalog.router';
import petsRouter from './modules/pets/pets.router';
import doctorsRouter from './modules/doctors/doctors.router';
import campaignsRouter from './modules/campaigns/campaigns.router';
import { campaignRegistrationsPublicRouter, campaignRegistrationsAdminRouter } from './modules/campaign-registrations/campaign-registrations.router';
import campaignScanRouter from './modules/campaign-registrations/campaign-scan.router';
import { campaignCheckinVolunteerRouter, campaignCheckinAdminRouter } from './modules/campaign-checkin/campaign-checkin.router';
import { campaignCertificatesAdminRouter, campaignCertificatesPublicRouter } from './modules/campaign-certificates/campaign-certificates.router';
import campaignAnalyticsRouter from './modules/analytics/campaign-analytics.router';
import campaignsPublicRouter from './modules/campaigns/campaigns-public.router';
import petsPublicRouter from './modules/pets/pets-public.router';
import { vaccinationAdminRouter, certificateVerifyPublicRouter } from './modules/vaccination/vaccination.router';
import { homepageAdminRouter, homepagePublicRouter } from './modules/homepage/homepage.router';
import { communityZonesAdminRouter, communityZonesPublicRouter } from './modules/community-zones/community-zones.router';
import { contributionPlansAdminRouter, contributionPlansPublicRouter } from './modules/contribution-plans/contribution-plans.router';
import { careContributionsAdminRouter, careContributionsPublicRouter } from './modules/care-contributions/care-contributions.router';
import { carePartnerCardsAdminRouter, carePartnerCardsPublicRouter } from './modules/care-partner-cards/care-partner-cards.router';
import { petCensusAdminRouter, petCensusPublicRouter } from './modules/pet-census/pet-census.router';
import { transparencyReportsAdminRouter, transparencyReportsPublicRouter } from './modules/transparency-reports/transparency-reports.router';
import { petSmartSolutionAdminRouter } from './modules/pet-smart-solution/pet-smart-solution.router';
import { communityFundAdminRouter, communityFundPublicRouter } from './modules/community-fund/community-fund.router';
import { carePartnerBenefitsAdminRouter, carePartnerBenefitsPublicRouter } from './modules/care-partner-benefits/care-partner-benefits.router';
import { socialImpactProgramsAdminRouter, socialImpactProgramsPublicRouter } from './modules/social-impact-programs/social-impact-programs.router';
import { roadmapItemsAdminRouter, roadmapItemsPublicRouter } from './modules/roadmap-items/roadmap-items.router';
import { diagnosticCenterServicesAdminRouter, diagnosticCenterServicesPublicRouter } from './modules/diagnostic-center-services/diagnostic-center-services.router';
import { siteSettingsAdminRouter, siteSettingsPublicRouter } from './modules/site-settings/site-settings.router';
import { communityMembershipAdminRouter, communityMembershipPublicRouter } from './modules/community-membership/community-membership.router';
import { donationsPublicRouter, donationsAdminRouter } from './modules/donations/donations.router';
import meRouter from './modules/me/me.router';
import { membershipCampaignAdminRouter, membershipCampaignClinicRouter, membershipCampaignMeRouter, membershipCampaignPublicRouter } from './modules/membership-campaign/membership-campaign.router';
import emailLayoutsRouter from './modules/emails/email-layouts.router';
import mailRouter from './modules/mail/mail-account.router';
import { contactInquiryPublicRouter, contactInquiryAdminRouter } from './modules/contact-inquiry/contact-inquiry.router';
import {
  getMembershipStatusHandler,
  downloadReceiptPdfHandler,
  downloadCardPdfHandler,
  downloadGuidePdfHandler,
  downloadWelcomePackPdfHandler,
} from './modules/community-membership/community-membership.controller';
import { mePetsLimiter, publicReadLimiter } from './middlewares/rateLimiter';
import notificationsRouter from './modules/notifications/notifications.router';
import dashboardRouter from './modules/dashboard/dashboard.router';
import { contentPublicRouter, contentAuthenticatedRouter, contentAdminRouter } from './modules/content/content.router';
import publicAnalyticsRouter from './modules/analytics/analytics-public.router';
import campaignFieldOpsRouter from './modules/campaign-field-ops/campaign-field-ops.router';
import campaignStaffAssignmentsRouter, { myAssignedRouter } from './modules/campaign-staff-assignments/campaign-staff-assignments.router';
import { adminRouter as campaignFaqsAdminRouter, publicRouter as campaignFaqsPublicRouter } from './modules/campaign-faqs/campaign-faqs.router';
import { campaignParticipantsRouter } from './modules/campaign-participants/participants.router';
import { appControlAdminRouter } from './modules/app-control/app-control.router';
import appPublicRouter from './modules/app/app.router';
import partnerClinicsAdminRouter from './modules/partner-clinics/partner-clinics.router';

const app = express();

// Trust the first hop (Nginx reverse proxy) so rate-limiters and IP logging
// see the real client address from X-Forwarded-For, not the proxy IP.
app.set('trust proxy', 1);
app.use(requestIdMiddleware);

// ─── Security ───────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  }),
);

// ─── Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Logging ────────────────────────────────────────────────────
if (config.NODE_ENV !== 'test') {
  app.use(morgan(config.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// ─── Health ─────────────────────────────────────────────────────
// Mounted at /api/v1/health so it is consistent with every consumer:
// docker-compose health check, Nginx bypass location, deploy script,
// UptimeRobot, and the go-live checklist all reference this path.
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────────
const v1 = '/api/v1';

app.use(`${v1}/auth`, authRouter);
app.use(`${v1}/admin/users`, usersRouter);
app.use(`${v1}/admin/roles`, rolesRouter);

// ─── Static uploads ─────────────────────────────────────────────
// CORP/CORS headers allow Next.js Image and browser fetch to load local uploads
// cross-origin. Only applies when STORAGE_DRIVER=local; S3 buckets handle CORS
// via their own bucket policy.
//
// `express.static` derives Content-Type from the `mime` package, which is
// missing (or wrong) for several formats we now accept — notably AVIF,
// HEIC/HEIF, and ICO return `application/octet-stream` from `mime`@1,
// which makes browsers refuse to render them as images even though the
// bytes are fine. STATIC_MIME_OVERRIDES patches those before express.static
// runs so the actual MIME always matches the file's real type.
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ext = req.path.split('.').pop()?.toLowerCase();
  const override = ext ? STATIC_MIME_OVERRIDES[ext] : undefined;
  if (override) res.setHeader('Content-Type', override);
  // Uploaded object keys embed a uuid, so a given URL's bytes never
  // change — safe to cache aggressively while still allowing revalidation.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static('uploads'), (_req, res) => {
  // Fallback for missing/unreadable files. A missing upload must be a real
  // 404 with no body — never a 200, never a redirect to a third-party
  // placeholder (that silently masks the missing file by loading unrelated
  // external content instead), and never a JSON/HTML success wrapper that a
  // naive image decoder would try to parse as image bytes.
  res.status(404).end();
});

// ─── Routes (Phase 2 CMS) ───────────────────────────────────────
app.use(`${v1}/news`, newsRouter);
app.use(`${v1}/events`, eventsRouter);
app.use(`${v1}/admin/committee`, committeeRouter);
app.use(`${v1}/admin/media`, mediaRouter);
app.use(`${v1}/admin/seo`, seoRouter);
app.use(`${v1}/admin/analytics`, analyticsRouter);
app.use(`${v1}/public/analytics`, publicAnalyticsRouter);
// ⚠️ DEPRECATED — Legacy contact form. Replaced by contact-inquiry module
// at /api/v1/public/contact-inquiries and /api/v1/admin/contact-inquiries.
// Kept for backward compatibility. Will be removed in a future release.
app.use(`${v1}/contacts`, contactsRouter);
app.use(`${v1}/volunteers`, volunteersRouter);
app.use(`${v1}/membership`, membershipRouter);
app.use(`${v1}/membership`, membershipCampaignPublicRouter);
app.use(`${v1}/payment`, paymentCallbacksRouter);
app.use(`${v1}/admin/payments`, paymentsRouter);
app.use(`${v1}/public/payments`, publicPaymentsRouter);
app.use(`${v1}/public/bookings`, publicBookingsRouter);
app.use(`${v1}/admin/sms-logs`, smsLogsRouter);
app.use(`${v1}/admin/email-logs`, emailLogsRouter);

// ─── Campaign Management (Phase 0 + 1) ──────────────────────────
app.use(`${v1}/admin/locations`, locationsRouter);
app.use(`${v1}/locations`, locationsRouter);
app.use(`${v1}/public/locations`, publicLocationsRouter);
app.use(`${v1}/admin/location-tree`, adminLocationTreeRouter);
app.use(`${v1}/admin/vaccine-catalog`, vaccineCatalogRouter);
app.use(`${v1}/admin/pets`, petsRouter);
app.use(`${v1}/admin/doctors`, doctorsRouter);
app.use(`${v1}/admin/campaigns`, campaignsRouter);
// Compatibility alias: production proxies may strip the /api/v1 prefix before
// forwarding to this server (e.g. nginx proxy_pass with path rewrite).
// The router is self-contained with authenticate + authorize so this is safe.
app.use('/admin/campaigns', campaignsRouter);
app.use(`${v1}/public/campaign-registrations`, campaignRegistrationsPublicRouter);
app.use(`${v1}/admin/campaign-registrations`, campaignRegistrationsAdminRouter);
app.use(`${v1}/admin/campaign-registrations`, campaignScanRouter);
app.use(`${v1}/volunteer`, campaignCheckinVolunteerRouter);
app.use(`${v1}/admin`, campaignCheckinAdminRouter);
app.use(`${v1}/admin`, campaignCertificatesAdminRouter);

// ─── Vaccination Desk Operations ─────────────────────────────
app.use(`${v1}/admin/vaccination`, vaccinationAdminRouter);
app.use(`${v1}/public/certificates/verify`, certificateVerifyPublicRouter);

// ─── Campaign Field Operations (QR, Check-in, Vaccination, Certificates) ──
app.use(`${v1}/admin/campaigns/:campaignId`, campaignFieldOpsRouter);

// ─── Campaign Staff Assignments ────────────────────────────────
app.use(`${v1}/admin/campaigns/:campaignId/staff-assignments`, campaignStaffAssignmentsRouter);

// ─── Campaign FAQs ────────────────────────────────────────────
app.use(`${v1}/admin/campaigns`, campaignFaqsAdminRouter);
app.use(`${v1}/public/campaigns`, campaignFaqsPublicRouter);
app.use(`${v1}/admin/campaigns`, campaignParticipantsRouter);

app.use(`${v1}/admin`, myAssignedRouter);

app.use(`${v1}/public/campaigns`, campaignsPublicRouter);
app.use(`${v1}/public/campaigns`, campaignCertificatesPublicRouter);
app.use(`${v1}/public/pets`, petsPublicRouter);
app.use(`${v1}/admin/analytics/campaigns`, campaignAnalyticsRouter);
app.use(`${v1}/admin/homepage`, homepageAdminRouter);
app.use(`${v1}/admin/app-control`, appControlAdminRouter);
app.use(`${v1}/admin/partner-clinics`, partnerClinicsAdminRouter);
app.use(`${v1}/app`, appPublicRouter);
app.use(`${v1}/homepage`, homepagePublicRouter);

// ─── Community Pet Care (Phase 3) ───────────────────────────────
app.use(`${v1}/admin/community-zones`, communityZonesAdminRouter);
app.use(`${v1}/public/community-zones`, communityZonesPublicRouter);
app.use(`${v1}/admin/contribution-plans`, contributionPlansAdminRouter);
app.use(`${v1}/public/contribution-plans`, contributionPlansPublicRouter);
app.use(`${v1}/admin/care-contributions`, careContributionsAdminRouter);
app.use(`${v1}/public/care-contributions`, careContributionsPublicRouter);
app.use(`${v1}/admin/care-partner-cards`, carePartnerCardsAdminRouter);
app.use(`${v1}/public/care-partner-cards`, carePartnerCardsPublicRouter);
app.use(`${v1}/admin/pet-census`, petCensusAdminRouter);
app.use(`${v1}/public/pet-census`, petCensusPublicRouter);
app.use(`${v1}/admin/transparency-reports`, transparencyReportsAdminRouter);
app.use(`${v1}/public/transparency-reports`, transparencyReportsPublicRouter);
app.use(`${v1}/admin/pet-smart-solution`, petSmartSolutionAdminRouter);
app.use(`${v1}/admin/community-fund`, communityFundAdminRouter);
app.use(`${v1}/public/community-fund`, communityFundPublicRouter);

// ─── Community Pet Care — Enterprise Content (Phase 4) ──────────
app.use(`${v1}/admin/care-partner-benefits`, carePartnerBenefitsAdminRouter);
app.use(`${v1}/public/care-partner-benefits`, carePartnerBenefitsPublicRouter);
app.use(`${v1}/admin/social-impact-programs`, socialImpactProgramsAdminRouter);
app.use(`${v1}/public/social-impact-programs`, socialImpactProgramsPublicRouter);
app.use(`${v1}/admin/roadmap-items`, roadmapItemsAdminRouter);
app.use(`${v1}/public/roadmap-items`, roadmapItemsPublicRouter);
app.use(`${v1}/admin/diagnostic-center-services`, diagnosticCenterServicesAdminRouter);
app.use(`${v1}/public/diagnostic-center-services`, diagnosticCenterServicesPublicRouter);

// ─── Site Settings ──────────────────────────────────────────────
app.use(`${v1}/public/site-settings`, siteSettingsPublicRouter);
app.use(`${v1}/admin/site-settings`, siteSettingsAdminRouter);
app.use(`${v1}/admin/email-layouts`, emailLayoutsRouter);
app.use(`${v1}/admin/mail`, mailRouter);

// ─── Community Care Membership Engine ──────────────────────────
app.use(`${v1}/admin/community-membership`, communityMembershipAdminRouter);
app.use(`${v1}/public/community-membership`, communityMembershipPublicRouter);
// Aliases: frontend may call /public/membership/* or /public/community-care/*
app.use(`${v1}/public/membership`, communityMembershipPublicRouter);
app.use(`${v1}/public/community-care`, communityMembershipPublicRouter);
app.get(`${v1}/public/memberships/:reference`, publicReadLimiter, getMembershipStatusHandler);
app.get(`${v1}/public/memberships/:reference/receipt.pdf`, publicReadLimiter, downloadReceiptPdfHandler);
app.get(`${v1}/public/memberships/:reference/card.pdf`, publicReadLimiter, downloadCardPdfHandler);
app.get(`${v1}/public/memberships/:reference/guide.pdf`, publicReadLimiter, downloadGuidePdfHandler);
app.get(`${v1}/public/memberships/:reference/welcome-pack.pdf`, publicReadLimiter, downloadWelcomePackPdfHandler);

// ─── Donations ──────────────────────────────────────────────────
app.use(`${v1}/public/donations`, donationsPublicRouter);
app.use(`${v1}/admin/donations`, donationsAdminRouter);

// ─── Contact Inquiry System ──────────────────────────────────────
app.use(`${v1}/public/contact-inquiries`, contactInquiryPublicRouter);
app.use(`${v1}/admin/contact-inquiries`, contactInquiryAdminRouter);

// ─── Content Hub ────────────────────────────────────────────────
app.use(`${v1}/public`, contentPublicRouter);
app.use(`${v1}/content`, contentAuthenticatedRouter);
app.use(`${v1}/admin/content`, contentAdminRouter);

// ─── Authenticated User (me) ────────────────────────────────────
app.use(`${v1}/me/pets`, mePetsLimiter);
app.use(`${v1}/me`, meRouter);
app.use(`${v1}/me`, membershipCampaignMeRouter);
app.use(`${v1}/admin/membership`, membershipCampaignAdminRouter);
app.use(`${v1}/clinic/memberships`, membershipCampaignClinicRouter);

// ─── Admin Notification & Dashboard ────────────────────────────
app.use(`${v1}/admin/notifications`, notificationsRouter);
app.use(`${v1}/admin/dashboard`, dashboardRouter);

// ─── Error Handling ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
