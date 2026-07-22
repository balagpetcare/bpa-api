/**
 * Donation payment callback route tests.
 *
 * Verifies that EPS success / fail / cancel callbacks:
 *   - resolve the correct donation record via the BPA-DON-* referenceNo
 *   - redirect to /donate/thank-you (not /payment/success|failed) for donation entityType
 *   - carry the correct donationNumber, status, and reason query params
 *   - do not affect the campaign redirect logic (regression guard)
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
    EPS_CALLBACK_IPS: '',  // empty = allow any source IP in tests
    NODE_ENV: 'test',
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import { settlePayment, cancelPaymentRecord } from '../payments.service';
import callbackRouter from '../payment-callbacks.router';

// ─── Test app ────────────────────────────────────────────────────────────────

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/api/v1/payment', callbackRouter);

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSettle = settlePayment as jest.MockedFunction<typeof settlePayment>;
const mockCancel = cancelPaymentRecord as jest.MockedFunction<typeof cancelPaymentRecord>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MERCH_TXN = '20260618120000001';
const DON_REF = 'BPA-DON-2026-00001';
const CAMPAIGN_MERCH_TXN = '20260618130000002';
const BOOKING_REF = 'BPA-BK-20260618-00002';

const donationPayment = {
  id: 'pay-don-uuid',
  merchantTxnId: MERCH_TXN,
  epsTxnId: null,
  gatewayRef: null,
  entityType: 'donation',
  purpose: 'donation',
};

const campaignPayment = {
  id: 'pay-camp-uuid',
  merchantTxnId: CAMPAIGN_MERCH_TXN,
  epsTxnId: null,
  gatewayRef: null,
  entityType: 'campaign',
  purpose: 'campaign',
};

function setupDonationMocks() {
  // payment.findFirst — called in validateMerchantTxnId and recoverBooking
  (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(donationPayment);
  // donation.findUnique — called in recoverBooking when bookingRef starts with BPA-DON-
  (mockPrisma.donation.findUnique as jest.Mock).mockResolvedValue({
    referenceNo: DON_REF,
    paymentId: 'pay-don-uuid',
  });
  // payment.update — called in persistEpsTxnId (no-op here since epsTxnId is null)
  (mockPrisma.payment.update as jest.Mock).mockResolvedValue({});
}

function setupCampaignMocks() {
  (mockPrisma.payment.findFirst as jest.Mock).mockResolvedValue(campaignPayment);
  (mockPrisma.campaignRegistration.findUnique as jest.Mock).mockResolvedValue({
    bookingNumber: BOOKING_REF,
    paymentId: 'pay-camp-uuid',
  });
  (mockPrisma.campaignRegistration.findFirst as jest.Mock).mockResolvedValue({
    bookingNumber: BOOKING_REF,
  });
  (mockPrisma.payment.update as jest.Mock).mockResolvedValue({});
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EPS Callback — Donation payment flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  // ── Success callback ───────────────────────────────────────────────────────

  describe('GET /callback/success', () => {
    it('redirects to /donate/thank-you with status=success when EPS confirms payment', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('success');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/donate\/thank-you/);
      expect(res.headers.location).toContain(`donationNumber=${encodeURIComponent(DON_REF)}`);
      expect(res.headers.location).toContain('status=success');
      expect(res.headers.location).not.toContain('/payment/success');
    });

    it('redirects to /donate/thank-you with status=failed when EPS verification returns failed', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('failed');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/donate\/thank-you/);
      expect(res.headers.location).toContain('status=failed');
      expect(res.headers.location).not.toContain('/payment/failed');
    });

    it('calls settlePayment with the canonical merchantTransactionId', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('success');

      await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(mockSettle).toHaveBeenCalledWith(MERCH_TXN);
    });

    it('includes reason=verification_failed when EPS returns pending_review', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('pending_review');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=failed');
      expect(res.headers.location).toContain('reason=verification_failed');
    });

    it('accepts ref for donation callbacks without breaking bookingRef compatibility', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('success');

      const res = await request(app)
        .get('/api/v1/payment/callback/success')
        .query({ merchantTransactionId: MERCH_TXN, ref: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`/donate/thank-you?donationNumber=${encodeURIComponent(DON_REF)}&status=success`);
    });
  });

  // ── Fail callback ──────────────────────────────────────────────────────────

  describe('GET /callback/fail', () => {
    it('redirects to /donate/thank-you with status=failed on EPS fail callback', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('failed');

      const res = await request(app)
        .get('/api/v1/payment/callback/fail')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/donate\/thank-you/);
      expect(res.headers.location).toContain('status=failed');
      expect(res.headers.location).toContain(`donationNumber=${encodeURIComponent(DON_REF)}`);
    });

    it('uses reason=cancelled when EPS status is cancelled', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('cancelled');

      const res = await request(app)
        .get('/api/v1/payment/callback/fail')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=failed');
      expect(res.headers.location).toContain('reason=cancelled');
    });

    it('still calls settlePayment (re-verify even on fail callback)', async () => {
      setupDonationMocks();
      mockSettle.mockResolvedValue('failed');

      await request(app)
        .get('/api/v1/payment/callback/fail')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(mockSettle).toHaveBeenCalledWith(MERCH_TXN);
    });
  });

  // ── Cancel callback ────────────────────────────────────────────────────────

  describe('GET /callback/cancel', () => {
    it('redirects to /donate/thank-you with reason=cancelled on user cancel', async () => {
      setupDonationMocks();
      mockCancel.mockResolvedValue(undefined);

      const res = await request(app)
        .get('/api/v1/payment/callback/cancel')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/donate\/thank-you/);
      expect(res.headers.location).toContain(`donationNumber=${encodeURIComponent(DON_REF)}`);
      expect(res.headers.location).toContain('status=failed');
      expect(res.headers.location).toContain('reason=cancelled');
    });

    it('calls cancelPaymentRecord with the merchantTransactionId', async () => {
      setupDonationMocks();
      mockCancel.mockResolvedValue(undefined);

      await request(app)
        .get('/api/v1/payment/callback/cancel')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(mockCancel).toHaveBeenCalledWith(MERCH_TXN);
    });

    it('does NOT redirect to /payment/failed', async () => {
      setupDonationMocks();
      mockCancel.mockResolvedValue(undefined);

      const res = await request(app)
        .get('/api/v1/payment/callback/cancel')
        .query({ merchantTransactionId: MERCH_TXN, bookingRef: DON_REF });

      expect(res.headers.location).not.toContain('/payment/failed');
    });
  });
});

// ─── Regression: campaign payment flow must not be affected ──────────────────

describe('EPS Callback — Campaign payment (regression guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('success callback redirects campaign payment to /payment/success (not /donate/)', async () => {
    setupCampaignMocks();
    mockSettle.mockResolvedValue('success');

    const res = await request(app)
      .get('/api/v1/payment/callback/success')
      .query({ merchantTransactionId: CAMPAIGN_MERCH_TXN, bookingRef: BOOKING_REF });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/payment/success');
    expect(res.headers.location).not.toContain('/donate/');
  });

  it('fail callback redirects campaign payment to /payment/failed (not /donate/)', async () => {
    setupCampaignMocks();
    mockSettle.mockResolvedValue('failed');

    const res = await request(app)
      .get('/api/v1/payment/callback/fail')
      .query({ merchantTransactionId: CAMPAIGN_MERCH_TXN, bookingRef: BOOKING_REF });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/payment/failed');
    expect(res.headers.location).not.toContain('/donate/');
  });

  it('cancel callback redirects campaign payment to /payment/failed', async () => {
    setupCampaignMocks();
    mockCancel.mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/v1/payment/callback/cancel')
      .query({ merchantTransactionId: CAMPAIGN_MERCH_TXN, bookingRef: BOOKING_REF });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/payment/failed');
    expect(res.headers.location).toContain('reason=cancelled');
  });
});
