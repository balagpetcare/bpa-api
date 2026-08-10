import { Router } from 'express';
import { requireCentralAuthUser } from '../../middlewares/requireCentralAuthUser';
import { authenticate } from '../../middlewares/authenticate';
import { requireLocalUser } from '../../middlewares/requireLocalUser';
import { authorize } from '../../middlewares/authorize';
import { requireSpayClinicAccess } from '../../middlewares/spayClinicAccess';
import { requireSpayNeuterEnabled } from '../../middlewares/spayNeuterEnabled';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter, spayHoldLimiter, spayBookingLimiter, spayLookupLimiter, spayPaymentActionLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import * as ctrl from './spay-neuter.controller';
import {
  addBlockedPeriodSchema,
  addBreakSchema,
  addScheduleSchema,
  adminBookingListQuerySchema,
  adminCompleteBookingSchema,
  adminCancelBookingSchema,
  approveRefundSchema,
  availableDatesQuerySchema,
  availableStartsQuerySchema,
  bookingsExportQuerySchema,
  cancelBookingSchema,
  clinicBookingLookupQuerySchema,
  clinicCheckInSchema,
  clinicMoveEarlierSchema,
  clinicOperationListQuerySchema,
  clinicStatusReasonSchema,
  completePreOpAssessmentSchema,
  completeOperationSchema,
  createBookingSchema,
  createManualSlotSchema,
  createSlotHoldSchema,
  linkOfferClinicSchema,
  manualRefundRequestSchema,
  patchClinicProfileSchema,
  patchOfferSchema,
  postOperativeUpdateSchema,
  processRefundSchema,
  readyForOperationSchema,
  rejectRefundSchema,
  reportFilterQuerySchema,
  reportQuerySchema,
  rescheduleBookingSchema,
  upcomingOperationsQuerySchema,
  startPreOpAssessmentSchema,
  startOperationSchema,
  upsertClinicProfileSchema,
  upsertClinicServiceSchema,
  upsertDateExceptionSchema,
  upsertOfferSchema,
  addOfferMediaSchema,
  updateOfferMediaSchema,
  createOfferVideoSchema,
  updateOfferVideoSchema,
  reorderSchema,
  retryPaymentSchema,
} from './spay-neuter.types';

// ─── Public: availability, booking lookup, QR verification (read-only, unauthenticated) ──
export const spayNeuterPublicRouter = Router();

// Confirmed defect fix: previously the ONLY way to see an offer's price/
// advance/policy text before booking was the admin-only /admin/spay-neuter
// /offers/:offerId route — no public endpoint existed at all. Published-
// only (see getPublicOffer), output-minimized.
spayNeuterPublicRouter.get('/offers', publicReadLimiter, ctrl.getPublicOffersList);
spayNeuterPublicRouter.get('/offers/:offerId', publicReadLimiter, ctrl.getPublicOfferDetail);
spayNeuterPublicRouter.get('/offers/:offerId/videos/:videoId', publicReadLimiter, ctrl.getPublicOfferVideoDetail);
spayNeuterPublicRouter.get(
  '/clinics/:clinicBranchId/availability/dates',
  publicReadLimiter,
  validate(availableDatesQuerySchema, 'query'),
  ctrl.getAvailableDates,
);
spayNeuterPublicRouter.get(
  '/clinics/:clinicBranchId/availability/slots',
  publicReadLimiter,
  validate(availableStartsQuerySchema, 'query'),
  ctrl.getAvailableStarts,
);
// bookingCode is deliberately unguessable (48-bit random) — safe as a
// public lookup key, unlike the sequential bookingNumber.
spayNeuterPublicRouter.get('/bookings/lookup/:bookingCode', spayLookupLimiter, ctrl.getBookingLookup);
// Sequential bookingNumber (not bookingCode) is what the EPS return-redirect
// query actually carries — see getPublicBookingPaymentStatus's docstring.
// Response is output-minimized (status/procedure/clinic/schedule/price only,
// no contact info) exactly like the bookingCode lookup above.
spayNeuterPublicRouter.get('/bookings/payment-status/:bookingNumber', spayLookupLimiter, ctrl.getBookingPaymentStatus);
// qrToken is an opaque HMAC — the verification response also excludes all
// medical fields (see spay-neuter.verification.service.ts).
spayNeuterPublicRouter.get('/verify/:qrToken', spayLookupLimiter, ctrl.getQrVerify);

// ─── Me: hold, booking, reschedule, cancel, receipt (Central Auth user) ──
export const spayNeuterMeRouter = Router();
// spayNeuterMeRouter.use(requireCentralAuthUser);

spayNeuterMeRouter.post(
  '/holds',
  requireSpayNeuterEnabled,
  requireCentralAuthUser,
  spayHoldLimiter,
  validate(createSlotHoldSchema, 'body'),
  ctrl.postHold,
);
spayNeuterMeRouter.get(
  '/holds/:holdId',
  requireCentralAuthUser,
  spayLookupLimiter,
  ctrl.getHoldStatus,
);
spayNeuterMeRouter.post(
  '/bookings',
  requireSpayNeuterEnabled,
  requireCentralAuthUser,
  spayBookingLimiter,
  validate(createBookingSchema, 'body'),
  ctrl.postBooking,
);
spayNeuterMeRouter.get('/bookings', requireCentralAuthUser, ctrl.listMyBookings);
spayNeuterMeRouter.get('/bookings/:bookingId', requireCentralAuthUser, ctrl.getMyBooking);
// Actively re-verifies with EPS before responding when still pending_payment
// with an attempt stuck at 'pending' — see getMyBookingVerifiedStatus's own
// doc comment. Rate-limited like the other lookup/status routes since,
// unlike getMyBooking, this one can trigger a real outbound EPS call.
spayNeuterMeRouter.get(
  '/bookings/:bookingId/verify-status',
  requireCentralAuthUser,
  spayLookupLimiter,
  ctrl.getMyBookingVerifiedStatus,
);
spayNeuterMeRouter.get('/bookings/:bookingId/receipt', requireCentralAuthUser, ctrl.getMyReceipt);
// Resumes online payment for a booking still awaiting its BDT 500 advance —
// never gated by requireSpayNeuterEnabled (that kill switch only blocks
// *starting* a new money-committing flow; an existing pending_payment
// booking must still be payable while the switch is off).
spayNeuterMeRouter.post(
  '/bookings/:bookingId/retry-payment',
  requireCentralAuthUser,
  spayBookingLimiter,
  validate(retryPaymentSchema, 'body'),
  ctrl.postRetryPayment,
);
// Authoritative post-EPS-return status, keyed by merchantTransactionId (the
// `ref` the browser lands with on /spay-neuter/payment/return) — owner-
// scoped via requireCentralAuthUser + the ownership check inside
// getOwnedSpayPaymentReturnStatus, never the public bookingNumber-keyed
// lookup used inside the booking wizard itself. See payment-callbacks.
// router.ts's getRedirectUrl() for where this ref comes from.
spayNeuterMeRouter.get(
  '/payments/:ref/status',
  requireCentralAuthUser,
  spayLookupLimiter,
  ctrl.getPaymentReturnStatus,
);
spayNeuterMeRouter.post(
  '/bookings/:bookingId/reschedule',
  requireCentralAuthUser,
  validate(rescheduleBookingSchema, 'body'),
  ctrl.postReschedule,
);
spayNeuterMeRouter.post(
  '/bookings/:bookingId/cancel',
  requireCentralAuthUser,
  validate(cancelBookingSchema, 'body'),
  ctrl.postCancelByOwner,
);

// ─── Clinic: check-in, operation lifecycle, no-show, cancel, refund requests ──
// Two independent gates on every route: authorize('spay_*', action) (the
// permission string) AND requireSpayClinicAccess() (the row-level clinic
// membership check). Neither alone is sufficient — see
// spay-neuter.router.ts's permission-matrix note in the implementation
// contract and spayClinicAccess.ts's docstring.
export const spayNeuterClinicRouter = Router();
spayNeuterClinicRouter.use(authenticate);
// Maps Central Auth's non-UUID `sub` onto this app's local `users.id`
// (auto-provisioning a shadow user row on first write) so changedById/
// checkedInBy-style `@db.Uuid` FKs never receive a raw Central Auth id —
// same fix as clinics.router.ts; without this, every check-in/operation
// action performed by a Central-Auth-authenticated clinic user fails with
// Prisma P2023 ("Invalid data format in request").
spayNeuterClinicRouter.use(requireLocalUser);

spayNeuterClinicRouter.get(
  '/operations',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ),
  validate(clinicOperationListQuerySchema, 'query'),
  ctrl.getClinicOperations,
);
spayNeuterClinicRouter.get(
  '/bookings/lookup',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ),
  validate(clinicBookingLookupQuerySchema, 'query'),
  ctrl.getClinicBookingLookup,
);
spayNeuterClinicRouter.get(
  '/bookings/:bookingId',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ),
  requireSpayClinicAccess(),
  ctrl.getClinicBooking,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/check-in',
  authorize(RESOURCES.SPAY_CHECKIN, ACTIONS.CHECKIN),
  requireSpayClinicAccess(),
  validate(clinicCheckInSchema, 'body'),
  ctrl.postCheckIn,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/pre-op/start',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(startPreOpAssessmentSchema, 'body'),
  ctrl.postStartPreOpAssessment,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/pre-op/complete',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(completePreOpAssessmentSchema, 'body'),
  ctrl.postCompletePreOpAssessment,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/ready',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(readyForOperationSchema, 'body'),
  ctrl.postReadyForOperation,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/move-earlier',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(clinicMoveEarlierSchema, 'body'),
  ctrl.postMoveBookingEarlier,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/start',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(startOperationSchema, 'body'),
  ctrl.postStartOperation,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/complete',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(completeOperationSchema, 'body'),
  ctrl.postCompleteOperation,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/no-show',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(clinicStatusReasonSchema, 'body'),
  ctrl.postNoShow,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/medically-unfit',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(clinicStatusReasonSchema, 'body'),
  ctrl.postMedicallyUnfit,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/cancel',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(clinicStatusReasonSchema, 'body'),
  ctrl.postCancelByClinic,
);
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/post-op',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  requireSpayClinicAccess(),
  validate(postOperativeUpdateSchema, 'body'),
  ctrl.postPostOperativeUpdate,
);
// Create-only — clinic staff can NEVER approve/reject/process (no such
// routes exist on this router at all; see spayNeuterAdminRouter).
spayNeuterClinicRouter.post(
  '/bookings/:bookingId/refund-requests',
  authorize(RESOURCES.SPAY_REFUNDS, ACTIONS.CREATE),
  requireSpayClinicAccess(),
  spayPaymentActionLimiter,
  validate(manualRefundRequestSchema, 'body'),
  ctrl.postManualRefundRequest,
);

// ─── Admin: refund approval workflow (BPA Central Admin only) ──────────
export const spayNeuterAdminRouter = Router();
spayNeuterAdminRouter.use(authenticate);
// Root-cause fix for the "VALIDATION_ERROR / Invalid data format in
// request" bug when creating a participating clinic: bpa_admin's only
// login path is Central Auth SSO, whose access-token `sub` is not a UUID
// matching this app's local `users.id`. createClinicProfile (and every
// other admin write below) passes req.user.sub straight into `createdById`
// /`updatedById`, both real `@db.Uuid` foreign keys to User — without this
// resolution step, Prisma rejects the raw Central Auth id with P2023. The
// canonical clinics module (clinics.router.ts) already applies this same
// middleware for the identical reason; this router was simply missing it.
spayNeuterAdminRouter.use(requireLocalUser);

spayNeuterAdminRouter.get('/refund-requests', authorize(RESOURCES.SPAY_REFUNDS, ACTIONS.READ), ctrl.getRefundRequests);
spayNeuterAdminRouter.post(
  '/refund-requests/:refundRequestId/approve',
  authorize(RESOURCES.SPAY_REFUNDS, ACTIONS.APPROVE),
  spayPaymentActionLimiter,
  validate(approveRefundSchema, 'body'),
  ctrl.postApproveRefund,
);
spayNeuterAdminRouter.post(
  '/refund-requests/:refundRequestId/reject',
  authorize(RESOURCES.SPAY_REFUNDS, ACTIONS.APPROVE),
  spayPaymentActionLimiter,
  validate(rejectRefundSchema, 'body'),
  ctrl.postRejectRefund,
);
spayNeuterAdminRouter.post(
  '/refund-requests/:refundRequestId/process',
  authorize(RESOURCES.SPAY_REFUNDS, ACTIONS.APPROVE),
  spayPaymentActionLimiter,
  validate(processRefundSchema, 'body'),
  ctrl.postProcessRefund,
);

// ─── Admin: dashboard ───────────────────────────────────────────────
spayNeuterAdminRouter.get('/dashboard', authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ), ctrl.getDashboard);

// ─── Admin: offers — prices/lifecycle. Clinic roles hold NO permission on
// spay_offers at all (see roles-permissions.seed.ts), so this entire
// sub-router is unreachable by any clinic_admin/clinic_vet/clinic_front_desk
// token regardless of clinic membership — the RBAC seed is the actual
// enforcement point, this router just wires it up per-route. ──────────
spayNeuterAdminRouter.get('/offers', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.READ), ctrl.getOffers);
spayNeuterAdminRouter.get('/offers/:offerId', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.READ), ctrl.getOffer);
spayNeuterAdminRouter.post('/offers', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.CREATE), validate(upsertOfferSchema, 'body'), ctrl.postOffer);
spayNeuterAdminRouter.patch('/offers/:offerId', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE), validate(patchOfferSchema, 'body'), ctrl.patchOffer);
spayNeuterAdminRouter.post('/offers/:offerId/publish', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.LIFECYCLE), ctrl.postPublishOffer);
spayNeuterAdminRouter.post('/offers/:offerId/pause', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.LIFECYCLE), ctrl.postPauseOffer);
spayNeuterAdminRouter.post('/offers/:offerId/complete', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.LIFECYCLE), ctrl.postCompleteOffer);
spayNeuterAdminRouter.post('/offers/:offerId/archive', authorize(RESOURCES.SPAY_OFFERS, ACTIONS.ARCHIVE), ctrl.postArchiveOffer);
spayNeuterAdminRouter.post(
  '/offers/:offerId/clinics',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(linkOfferClinicSchema, 'body'),
  ctrl.postLinkOfferClinic,
);
spayNeuterAdminRouter.delete(
  '/offers/:offerId/clinics/:clinicBranchId',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  ctrl.deleteLinkOfferClinic,
);

spayNeuterAdminRouter.get(
  '/offers/:offerId/media',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.READ),
  ctrl.getOfferMediaList,
);
spayNeuterAdminRouter.post(
  '/offers/:offerId/media',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(addOfferMediaSchema, 'body'),
  ctrl.postOfferMedia,
);
spayNeuterAdminRouter.patch(
  '/media/:mediaId',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(updateOfferMediaSchema, 'body'),
  ctrl.patchOfferMedia,
);
spayNeuterAdminRouter.delete(
  '/media/:mediaId',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  ctrl.deleteOfferMedia,
);
spayNeuterAdminRouter.post(
  '/offers/:offerId/media/reorder',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(reorderSchema, 'body'),
  ctrl.postReorderOfferMedia,
);

spayNeuterAdminRouter.get(
  '/offers/:offerId/videos',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.READ),
  ctrl.getOfferVideosList,
);
spayNeuterAdminRouter.post(
  '/offers/:offerId/videos',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(createOfferVideoSchema, 'body'),
  ctrl.postOfferVideo,
);
spayNeuterAdminRouter.patch(
  '/videos/:videoId',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(updateOfferVideoSchema, 'body'),
  ctrl.patchOfferVideo,
);
spayNeuterAdminRouter.delete(
  '/videos/:videoId',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  ctrl.deleteOfferVideo,
);
spayNeuterAdminRouter.post(
  '/offers/:offerId/videos/reorder',
  authorize(RESOURCES.SPAY_OFFERS, ACTIONS.UPDATE),
  validate(reorderSchema, 'body'),
  ctrl.postReorderOfferVideos,
);

// ─── Admin: participating clinics (SpayClinicProfile) + schedule config ──
// Distinct from RESOURCES.CLINIC_BRANCHES ('clinics:publish') — linking a
// clinic here never touches ClinicBranch.published (the public directory
// listing), which stays a separate permission on the existing clinics module.
spayNeuterAdminRouter.get('/clinic-profiles', authorize(RESOURCES.SPAY_CLINICS, ACTIONS.READ), ctrl.getClinicProfiles);
spayNeuterAdminRouter.get('/clinic-profiles/:clinicProfileId', authorize(RESOURCES.SPAY_CLINICS, ACTIONS.READ), ctrl.getClinicProfile);
spayNeuterAdminRouter.post(
  '/clinic-profiles',
  authorize(RESOURCES.SPAY_CLINICS, ACTIONS.CREATE),
  validate(upsertClinicProfileSchema, 'body'),
  ctrl.postClinicProfile,
);
spayNeuterAdminRouter.patch(
  '/clinic-profiles/:clinicProfileId',
  authorize(RESOURCES.SPAY_CLINICS, ACTIONS.UPDATE),
  validate(patchClinicProfileSchema, 'body'),
  ctrl.patchClinicProfile,
);
spayNeuterAdminRouter.put(
  '/clinic-profiles/:clinicProfileId/services',
  authorize(RESOURCES.SPAY_CLINICS, ACTIONS.UPDATE),
  validate(upsertClinicServiceSchema, 'body'),
  ctrl.putClinicService,
);
spayNeuterAdminRouter.get(
  '/clinic-profiles/:clinicProfileId/conflicts',
  authorize(RESOURCES.SPAY_CLINICS, ACTIONS.READ),
  ctrl.getScheduleConflicts,
);

spayNeuterAdminRouter.post(
  '/clinic-profiles/:clinicProfileId/schedules',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.CREATE),
  validate(addScheduleSchema, 'body'),
  ctrl.postSchedule,
);
spayNeuterAdminRouter.delete(
  '/clinic-profiles/:clinicProfileId/schedules/:scheduleId',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.DELETE),
  ctrl.deleteSchedule,
);
spayNeuterAdminRouter.post(
  '/clinic-profiles/:clinicProfileId/breaks',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.CREATE),
  validate(addBreakSchema, 'body'),
  ctrl.postBreak,
);
spayNeuterAdminRouter.delete(
  '/clinic-profiles/:clinicProfileId/breaks/:breakId',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.DELETE),
  ctrl.deleteBreak,
);
spayNeuterAdminRouter.post(
  '/clinic-profiles/:clinicProfileId/blocked-periods',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.CREATE),
  validate(addBlockedPeriodSchema, 'body'),
  ctrl.postBlockedPeriod,
);
spayNeuterAdminRouter.delete(
  '/clinic-profiles/:clinicProfileId/blocked-periods/:blockedPeriodId',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.DELETE),
  ctrl.deleteBlockedPeriod,
);
spayNeuterAdminRouter.put(
  '/clinic-profiles/:clinicProfileId/date-exceptions',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.CREATE),
  validate(upsertDateExceptionSchema, 'body'),
  ctrl.putDateException,
);
spayNeuterAdminRouter.delete(
  '/clinic-profiles/:clinicProfileId/date-exceptions/:exceptionId',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.DELETE),
  ctrl.deleteDateException,
);
spayNeuterAdminRouter.post(
  '/clinic-profiles/:clinicProfileId/manual-slots',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.CREATE),
  validate(createManualSlotSchema, 'body'),
  ctrl.postManualSlot,
);
spayNeuterAdminRouter.delete(
  '/clinic-profiles/:clinicProfileId/manual-slots/:slotId',
  authorize(RESOURCES.SPAY_SLOTS, ACTIONS.DELETE),
  ctrl.deleteManualSlot,
);

// ─── Admin: bookings (cross-clinic) ─────────────────────────────────
spayNeuterAdminRouter.get(
  '/bookings',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ),
  validate(adminBookingListQuerySchema, 'query'),
  ctrl.getBookingsAdmin,
);
// MUST be registered before the '/bookings/:bookingId' param route below —
// otherwise Express matches "export.csv" as a bookingId and this route is
// unreachable (a real bug caught while adding this endpoint).
spayNeuterAdminRouter.get(
  '/bookings/export.csv',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ),
  validate(bookingsExportQuerySchema, 'query'),
  ctrl.getBookingsExportCsv,
);
spayNeuterAdminRouter.get('/bookings/:bookingId', authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.READ), ctrl.getBookingAdmin);
// Admin-console operational actions — cross-clinic, central-admin-only
// (this router is unreachable by clinic-scoped staff). Reuses the same
// SPAY_BOOKINGS:UPDATE permission every other booking-status write already
// uses (check-in/pre-op/ready/start/complete/no-show/medically-unfit/cancel
// on the clinic router) — money movement itself stays gated separately by
// SPAY_REFUNDS:APPROVE, unchanged.
spayNeuterAdminRouter.post(
  '/bookings/:bookingId/complete',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  validate(adminCompleteBookingSchema, 'body'),
  ctrl.postAdminCompleteBooking,
);
spayNeuterAdminRouter.post(
  '/bookings/:bookingId/cancel',
  authorize(RESOURCES.SPAY_BOOKINGS, ACTIONS.UPDATE),
  validate(adminCancelBookingSchema, 'body'),
  ctrl.postAdminCancelBooking,
);

// ─── Admin: reports ──────────────────────────────────────────────────
spayNeuterAdminRouter.get(
  '/reports/revenue',
  authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ),
  validate(reportQuerySchema, 'query'),
  ctrl.getRevenueReport,
);
spayNeuterAdminRouter.get(
  '/reports/summary',
  authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ),
  validate(reportFilterQuerySchema, 'query'),
  ctrl.getSummaryReport,
);
spayNeuterAdminRouter.get(
  '/reports/utilization',
  authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ),
  validate(reportFilterQuerySchema, 'query'),
  ctrl.getUtilizationReport,
);
spayNeuterAdminRouter.get(
  '/reports/upcoming',
  authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ),
  validate(upcomingOperationsQuerySchema, 'query'),
  ctrl.getUpcomingOperationsReport,
);
spayNeuterAdminRouter.get(
  '/reports/clinic-performance',
  authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ),
  validate(reportFilterQuerySchema, 'query'),
  ctrl.getClinicPerformanceReport,
);
// ─── Admin: audit history (spay_* resources only) ───────────────────
spayNeuterAdminRouter.get('/audit', authorize(RESOURCES.SPAY_REPORTS, ACTIONS.READ), ctrl.getSpayAuditLog);
