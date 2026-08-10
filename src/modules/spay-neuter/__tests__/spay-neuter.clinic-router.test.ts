const authorizeCalls: Array<{ resource: string; action: string }> = [];
const accessChecks: string[] = [];

jest.mock('../spay-neuter.controller', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ success: true, data: {} });
  const created = (_req: any, res: any) => res.status(201).json({ success: true, data: {} });
  return {
    getPublicOffersList: ok,
    getPublicOfferDetail: ok,
    getPublicOfferVideoDetail: ok,
    getAvailableDates: ok,
    getAvailableStarts: ok,
    postHold: created,
    getHoldStatus: ok,
    postBooking: created,
    listMyBookings: ok,
    getMyBooking: ok,
    getMyBookingVerifiedStatus: ok,
    getMyReceipt: ok,
    postReschedule: ok,
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

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    if (req.headers['x-test-auth'] === 'none') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.user = { sub: 'clinic-user-1', email: 'clinic@example.com', roles: ['clinic_admin'] };
    next();
  },
}));

jest.mock('../../../middlewares/authorize', () => ({
  authorize: (resource: string, action: string) => (req: any, res: any, next: () => void) => {
    authorizeCalls.push({ resource, action });
    if (req.headers['x-test-authz'] === 'deny') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  },
  getUserPermissions: jest.fn(async () => []),
  hasPermission: jest.fn(() => false),
}));

jest.mock('../../../middlewares/spayClinicAccess', () => ({
  requireSpayClinicAccess: () => (req: any, res: any, next: () => void) => {
    accessChecks.push(req.path);
    if (req.headers['x-test-branch-access'] === 'deny') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  },
}));

jest.mock('../../../middlewares/requireCentralAuthUser', () => ({
  requireCentralAuthUser: (_req: any, _res: any, next: () => void) => next(),
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
import { spayNeuterClinicRouter } from '../spay-neuter.router';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/clinic/spay-neuter', spayNeuterClinicRouter);
  app.use(errorHandler);
  return app;
}

describe('spay-neuter clinic router - permission and branch access gating', () => {
  beforeEach(() => {
    authorizeCalls.length = 0;
    accessChecks.length = 0;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/clinic/spay-neuter/operations')
      .set('x-test-auth', 'none');

    expect(res.status).toBe(401);
  });

  it('rejects requests without the required permission with 403', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/clinic/spay-neuter/operations')
      .set('x-test-authz', 'deny');

    expect(res.status).toBe(403);
  });

  it('rejects booking-specific access outside the authorized branch scope with 403', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/clinic/spay-neuter/bookings/booking-123')
      .set('x-test-branch-access', 'deny');

    expect(res.status).toBe(403);
    expect(accessChecks).toContain('/bookings/booking-123');
  });

  it('gates GET /operations behind spay_bookings:read', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/clinic/spay-neuter/operations');

    expect(authorizeCalls).toContainEqual({ resource: 'spay_bookings', action: 'read' });
  });

  it('gates POST /bookings/:id/check-in behind spay_checkin:checkin and branch access', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/clinic/spay-neuter/bookings/booking-123/check-in').send({});

    expect(authorizeCalls).toContainEqual({ resource: 'spay_checkin', action: 'checkin' });
    expect(accessChecks).toContain('/bookings/booking-123/check-in');
  });

  it('does not expose refund approval routes on the clinic router', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/v1/clinic/spay-neuter/refund-requests/refund-123/approve').send({});

    expect(res.status).toBe(404);
  });
});
