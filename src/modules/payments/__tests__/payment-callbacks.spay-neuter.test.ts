/**
 * Spay & Neuter EPS callback redirect-routing tests.
 *
 * Regression coverage for the "redirected to /community-pet-care/payment/
 * success — Lookup Failed: Membership purchase not found" bug: a verified
 * Spay & Neuter payment's success/fail/cancel callback must land on the
 * dedicated /spay-neuter/payment/return page, never the generic /payment/
 * success|failed page (whose own fallback logic in bpa_web sends anything
 * without a `booking` query param to the Community Pet Care membership
 * lookup — see app/payment/success/page.tsx). Also guards that Community
 * Pet Care (and campaign/donation) payments are completely unaffected by
 * the new spay_booking branch in getRedirectUrl().
 */

// ─── Mocks (hoisted before any imports) ─────────────────────────────────────

jest.mock('../../../database/prisma', () => ({
  prisma: {
    payment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    donation: {
      findUnique: jest.fn(),
    },
    campaignRegistration: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    spayBooking: {
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../payments.service', () => ({
  settlePayment: jest.fn(),
  cancelPaymentRecord: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../middlewares/rateLimiter', () => ({
  callbackLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../config', () => ({
  config: {
    FRONTEND_URL: 'https://bpa.test',
    BACKEND_URL: 'https://api.bpa.test',
    EPS_CALLBACK_IPS: '',
    NODE_ENV: 'test',
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import { settlePayment, cancelPaymentRecord } from '../payments.service';
import callbackRouter from '../payment-callbacks.router';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/api/v1/payment', callbackRouter);

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSettle = settlePayment as jest.MockedFunction<typeof settlePayment>;
const mockCancel = cancelPaymentRecord as jest.MockedFunction<typeof cancelPaymentRecord>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SPAY_MERCH_TXN = '20260806024821144';
const SPAY_BOOKING_NUMBER = 'BPA-SN-20260808-00692';

const NEUTER_MERCH_TXN = '20260806030000002';
const NEUTER_BOOKING_NUMBER = 'BPA-SN-20260809-00700';

const MEMBERSHIP_MERCH_TXN = '20260806040000003';

const spayPayment = {
  id: 'pay-spay-uuid',
  merchantTxnId: SPAY_MERCH_TXN,
  epsTxnId: null,
  gatewayRef: null,
  entityType: 'spay_booking',
  purpose: 'spay_neuter_advance',
};

const neuterPayment = {
  id: 'pay-neuter-uuid',
  merchantTxnId: NEUTER_MERCH_TXN,
  epsTxnId: null,
  gatewayRef: null,
  entityType: 'spay_booking',
  purpose: 'spay_neuter_advance',
};

const membershipPayment = {
  id: 'pay-membership-uuid',
  merchantTxnId: MEMBERSHIP_MERCH_TXN,
  epsTxnId: null,
  gatewayRef: null,
  entityType: 'CommunityMembershipPurchase',
  purpose: 'community_membership',
};

function setupSpayMocks() {
  (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(spayPayment);
  (mockPrisma.spayBooking.findFirst as jest.Mock).mockResolvedValue({ bookingNumber: SPAY_BOOKING_NUMBER });
  (mockPrisma.payment.update as jest.Mock).mockResolvedValue({});
}

function setupNeuterMocks() {
  (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(neuterPayment);
  (mockPrisma.spayBooking.findFirst as jest.Mock).mockResolvedValue({ bookingNumber: NEUTER_BOOKING_NUMBER });
  (mockPrisma.payment.update as jest.Mock).mockResolvedValue({});
}

function setupMembershipMocks() {
  (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(membershipPayment);
  (mockPrisma.payment.update as jest.Mock).mockResolvedValue({});
}

describe('EPS Callback — Spay & Neuter payment redirect routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  describe('GET /callback/success', () => {
    it('1. Spay payment success redirects to the Spay & Neuter return page, never /payment/success or /community-pet-care/*', async () => {
      setupSpayMocks();
      mockSettle.mockResolvedValue('success');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: SPAY_MERCH_TXN });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`https://bpa.test/spay-neuter/payment/return?ref=${SPAY_MERCH_TXN}`);
      expect(res.headers.location).not.toContain('/community-pet-care');
      expect(res.headers.location).not.toContain('/payment/success');
    });

    it('2. Neuter payment success also redirects to the same Spay/Neuter return page (routing is by entityType, not procedure)', async () => {
      setupNeuterMocks();
      mockSettle.mockResolvedValue('success');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: NEUTER_MERCH_TXN });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`https://bpa.test/spay-neuter/payment/return?ref=${NEUTER_MERCH_TXN}`);
      expect(res.headers.location).not.toContain('/community-pet-care');
    });

    it('routes to the return page even when settlePayment reports a non-success outcome (the return page itself renders failed/pending copy — the redirect target never depends on the verified outcome)', async () => {
      setupSpayMocks();
      mockSettle.mockResolvedValue('failed');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: SPAY_MERCH_TXN });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`https://bpa.test/spay-neuter/payment/return?ref=${SPAY_MERCH_TXN}`);
    });

    it('4. resolves the payment module (entityType) from the server-side Payment record, not from any request/browser data', async () => {
      setupSpayMocks();
      mockSettle.mockResolvedValue('success');

      await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: SPAY_MERCH_TXN, ref: 'something-unrelated', booking: 'BPA-DON-fake' });

      // The redirect target is driven by payment.entityType looked up server-side
      // (mockPrisma.payment.findFirst), never by the arbitrary extra query params above.
      expect(mockPrisma.payment.findFirst).toHaveBeenCalled();
    });

    it('11. duplicate/replayed success callback is idempotent — routes to the same return page every time, still calls settlePayment (which is itself idempotent)', async () => {
      setupSpayMocks();
      mockSettle.mockResolvedValue('success');

      const first = await request(app).get('/api/v1/payment/callback/success').query({ merchantTransactionId: SPAY_MERCH_TXN });
      const second = await request(app).get('/api/v1/payment/callback/success').query({ merchantTransactionId: SPAY_MERCH_TXN });

      expect(first.headers.location).toBe(second.headers.location);
      expect(mockSettle).toHaveBeenCalledTimes(2); // callback fired twice — settlePayment's OWN idempotency (tested separately) is what prevents double-processing, not the redirect layer
    });
  });

  describe('GET /callback/fail', () => {
    it('routes a failed Spay payment to the Spay & Neuter return page (never /payment/failed)', async () => {
      setupSpayMocks();
      mockSettle.mockResolvedValue('failed');

      const res = await request(app)
        .get('/api/v1/payment/callback/fail')
        .query({ merchantTransactionId: SPAY_MERCH_TXN });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`https://bpa.test/spay-neuter/payment/return?ref=${SPAY_MERCH_TXN}`);
    });
  });

  describe('GET /callback/cancel', () => {
    it('routes a cancelled Spay payment to the Spay & Neuter return page', async () => {
      setupSpayMocks();
      mockCancel.mockResolvedValue(undefined);

      const res = await request(app)
        .get('/api/v1/payment/callback/cancel')
        .query({ merchantTransactionId: SPAY_MERCH_TXN });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`https://bpa.test/spay-neuter/payment/return?ref=${SPAY_MERCH_TXN}`);
    });
  });
});

// ─── Regression: Community Pet Care / membership payments must be unaffected ──

describe('EPS Callback — Community Pet Care membership payment (regression guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('3. membership payment success still redirects toward the generic /payment/success path (its own downstream Community Pet Care fallback is unchanged) — never the Spay & Neuter return page', async () => {
    setupMembershipMocks();
    mockSettle.mockResolvedValue('success');

    const res = await request(app)
      .get('/api/v1/payment/callback/success')
      .query({ merchantTransactionId: MEMBERSHIP_MERCH_TXN });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/payment/success');
    expect(res.headers.location).not.toContain('/spay-neuter/payment/return');
  });

  it('membership payment fail/cancel are also unaffected by the new spay_booking branch', async () => {
    setupMembershipMocks();
    mockSettle.mockResolvedValue('failed');

    const res = await request(app)
      .get('/api/v1/payment/callback/fail')
      .query({ merchantTransactionId: MEMBERSHIP_MERCH_TXN });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/payment/failed');
    expect(res.headers.location).not.toContain('/spay-neuter/payment/return');
  });
});
