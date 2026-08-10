// Regression coverage for the "An unexpected error occurred" banner shown
// on the web Spay & Neuter booking Review & Payment step after clicking
// "Pay & Confirm". Root cause: POST /me/spay-neuter/bookings (and several
// sibling owner-facing routes) were missing the requireCentralAuthUser
// middleware entirely, so req.user was undefined by the time
// postBooking/listMyBookings/getMyBooking/getMyReceipt/postReschedule/
// postCancelByOwner read req.user.sub — a TypeError, not an AppError, so
// errorHandler's generic 500 fallback ("An unexpected error occurred")
// was what the browser actually received. /holds already had the
// middleware, which is why the earlier steps of the flow worked fine.
//
// This test asserts requireCentralAuthUser actually runs (and blocks
// unauthenticated callers) on every /me/spay-neuter route that reads
// req.user, so a future refactor can't silently drop it from one route
// again without a test failing.

const authChecks: string[] = [];

// The router module wires up the public/me/clinic/admin routers together at
// import time (see below), so importing spayNeuterMeRouter also evaluates
// every route definition in the file — every controller export referenced
// anywhere in spay-neuter.router.ts must be present here or Express throws
// "requires a callback but got undefined" during route registration.
jest.mock('../spay-neuter.controller', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ success: true, data: {} });
  const created = (_req: any, res: any) => res.status(201).json({ success: true, data: {} });
  return {
    getAvailableStarts: ok,
    getPublicOffersList: ok,
    getPublicOfferDetail: ok,
    getPublicOfferVideoDetail: ok,
    getAvailableDates: ok,
    postHold: created,
    getHoldStatus: ok,
    postReschedule: ok,
    postBooking: created,
    listMyBookings: ok,
    getMyBooking: ok,
    getMyBookingVerifiedStatus: ok,
    getMyReceipt: ok,
    postCancelByOwner: ok,
    postRetryPayment: created,
    getPaymentReturnStatus: ok,
    getBookingLookup: ok,
    getBookingPaymentStatus: ok,
    getQrVerify: ok,
    getClinicOperations: ok,
    getClinicBookingLookup: ok,
    getClinicBooking: ok,
    postCheckIn: ok,
    postStartPreOpAssessment: ok,
    postCompletePreOpAssessment: ok,
    postReadyForOperation: ok,
    postMoveBookingEarlier: ok,
    postStartOperation: ok,
    postCompleteOperation: ok,
    postNoShow: ok,
    postMedicallyUnfit: ok,
    postCancelByClinic: ok,
    postPostOperativeUpdate: ok,
    postManualRefundRequest: created,
    getRefundRequests: ok,
    postApproveRefund: ok,
    postRejectRefund: ok,
    postProcessRefund: ok,
    getDashboard: ok,
    getOffers: ok,
    getOffer: ok,
    postOffer: created,
    patchOffer: ok,
    postPublishOffer: ok,
    postPauseOffer: ok,
    postCompleteOffer: ok,
    postArchiveOffer: ok,
    postLinkOfferClinic: created,
    deleteLinkOfferClinic: ok,
    getOfferMediaList: ok,
    postOfferMedia: created,
    patchOfferMedia: ok,
    deleteOfferMedia: ok,
    postReorderOfferMedia: ok,
    getOfferVideosList: ok,
    postOfferVideo: created,
    patchOfferVideo: ok,
    deleteOfferVideo: ok,
    postReorderOfferVideos: ok,
    getClinicProfiles: ok,
    getClinicProfile: ok,
    postClinicProfile: created,
    patchClinicProfile: ok,
    putClinicService: ok,
    postSchedule: created,
    deleteSchedule: ok,
    postBreak: created,
    deleteBreak: ok,
    postBlockedPeriod: created,
    deleteBlockedPeriod: ok,
    putDateException: ok,
    deleteDateException: ok,
    postManualSlot: created,
    deleteManualSlot: ok,
    getScheduleConflicts: ok,
    getBookingsAdmin: ok,
    getBookingAdmin: ok,
    postAdminCompleteBooking: ok,
    postAdminCancelBooking: ok,
    getRevenueReport: ok,
    getSummaryReport: ok,
    getUtilizationReport: ok,
    getUpcomingOperationsReport: ok,
    getClinicPerformanceReport: ok,
    getBookingsExportCsv: ok,
    getSpayAuditLog: ok,
  };
});

// The router module wires up the public/me/clinic/admin routers together at
// import time, so importing spayNeuterMeRouter also evaluates the clinic
// and admin route definitions below it — these unrelated middlewares must
// be stubbed too or Express throws "requires a callback but got undefined"
// during route registration, same as spay-neuter.clinic-router.test.ts.
jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../../middlewares/authorize', () => ({
  authorize: () => (_req: any, _res: any, next: () => void) => next(),
  getUserPermissions: jest.fn(async () => []),
  hasPermission: jest.fn(() => false),
}));

jest.mock('../../../middlewares/spayClinicAccess', () => ({
  requireSpayClinicAccess: () => (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../../middlewares/requireCentralAuthUser', () => ({
  requireCentralAuthUser: (req: any, res: any, next: () => void) => {
    authChecks.push(`${req.method} ${req.path}`);
    if (req.headers['x-test-auth'] === 'none') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
      return;
    }
    req.user = { sub: 'owner-user-1', email: 'owner@example.com', roles: [] };
    next();
  },
}));

jest.mock('../../../middlewares/validate', () => ({
  validate: () => (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../../middlewares/rateLimiter', () => ({
  publicReadLimiter: (_req: any, _res: any, next: () => void) => next(),
  spayHoldLimiter: (_req: any, _res: any, next: () => void) => next(),
  spayBookingLimiter: (_req: any, _res: any, next: () => void) => next(),
  spayLookupLimiter: (_req: any, _res: any, next: () => void) => next(),
  spayPaymentActionLimiter: (_req: any, _res: any, next: () => void) => next(),
}));

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middlewares/errorHandler';
import { spayNeuterMeRouter } from '../spay-neuter.router';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/me/spay-neuter', spayNeuterMeRouter);
  app.use(errorHandler);
  return app;
}

describe('spay-neuter "me" router - every req.user-reading route requires central auth', () => {
  beforeEach(() => {
    authChecks.length = 0;
  });

  const routes: Array<{ method: 'get' | 'post'; path: string; body?: object }> = [
    { method: 'post', path: '/holds', body: {} },
    { method: 'get', path: '/holds/hold-123' },
    { method: 'post', path: '/bookings', body: {} },
    { method: 'get', path: '/bookings' },
    { method: 'get', path: '/bookings/booking-123' },
    { method: 'get', path: '/bookings/booking-123/verify-status' },
    { method: 'get', path: '/bookings/booking-123/receipt' },
    { method: 'post', path: '/bookings/booking-123/reschedule', body: {} },
    { method: 'post', path: '/bookings/booking-123/cancel', body: {} },
    { method: 'post', path: '/bookings/booking-123/retry-payment', body: {} },
    { method: 'get', path: '/payments/some-ref/status' },
  ];

  it.each(routes)('rejects unauthenticated $method $path with 401 instead of crashing', async ({ method, path, body }) => {
    const app = buildApp();
    let req = request(app)[method](`/api/v1/me/spay-neuter${path}`).set('x-test-auth', 'none');
    if (body) req = req.send(body);
    const res = await req;

    expect(res.status).toBe(401);
    expect(authChecks).toContain(`${method.toUpperCase()} ${path}`);
  });

  it.each(routes)('runs requireCentralAuthUser (and reaches the controller) for authenticated $method $path', async ({ method, path, body }) => {
    const app = buildApp();
    let req = request(app)[method](`/api/v1/me/spay-neuter${path}`);
    if (body) req = req.send(body);
    const res = await req;

    expect(authChecks).toContain(`${method.toUpperCase()} ${path}`);
    // POST /holds and POST /bookings return 201 (create*), everything else 200 (ok).
    expect([200, 201]).toContain(res.status);
  });
});
