import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { prisma } from '../../database/prisma';
import { settlePayment, cancelPaymentRecord } from './payments.service';
import { callbackLimiter } from '../../middlewares/rateLimiter';

const router = Router();

const MERCHANT_TXN_ID_RE = /^\d{17}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

const TXN_PARAM_NAMES = [
  'merchanttransactionid', // MerchantTransactionId / merchantTransactionId
  'merchanttxnid',
  'txn',
  'transactionid',
  'transaction_id',
  'tran_id',
  'val_id',
  'mer_txnid',
  'epwtxnid',
  'paymentrefid',
  'payment_ref_id',
  'ssl_txn_id',
] as const;

const EPS_TXN_PARAM_NAMES = [
  'epstransactionid', // EPSTransactionId
  'eps_transaction_id',
  'gatewaytransactionid',
  'gateway_transaction_id',
  'providertransactionid',
  'provider_transaction_id',
  'epstransid',
  'epstrxnid',
] as const;

const ORDER_PARAM_NAMES = [
  'bookingref',
  'bookingreference',
  'booking_ref',
  'ref',
  'value_a',
  'valuea',
  'orderid',
  'customerorderid',
  'reference',
  'value_b',
  'valueb',
] as const;

const DIRECT_BOOKING_PARAM_NAMES = [
  'bookingref',
  'bookingreference',
  'booking_ref',
  'ref',
  'value_a',
  'valuea',
  'value_b',
  'valueb',
] as const;

const PAYMENT_REF_PARAM_NAMES = [
  'ref',
  'customerorderid',
  'orderid',
  'value_b',
  'valueb',
] as const;

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'hash', 'hashkey', 'hash_key',
  'signature', 'sign', 'token', 'secret', 'key',
  'card', 'cvv', 'pan',
]);

type NormalizedQuery = Record<string, string>;

type CallbackPayment = {
  id: string;
  merchantTxnId: string | null;
  epsTxnId: string | null;
  gatewayRef: string | null;
  entityType: string | null;
  purpose: string;
  payload: unknown;
};

// Set on Payment.payload at registration time when the booking came from the
// mobile app (see campaign-registrations.service.ts registerForCampaign) —
// lets the callback redirect to the bpa:// deep link instead of FRONTEND_URL.
function isMobilePayment(payment: CallbackPayment | null | undefined): boolean {
  const payload = payment?.payload as { platform?: string } | null | undefined;
  return payload?.platform === 'mobile';
}

function normalizeQuery(query: Request['query']): NormalizedQuery {
  const normalized: NormalizedQuery = {};

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const firstString = value.find((item): item is string => typeof item === 'string');
      if (firstString) {
        normalized[key.toLowerCase()] = firstString;
      }
    }
  }

  return normalized;
}

function getQueryValue(query: NormalizedQuery, names: readonly string[]): string | null {
  for (const name of names) {
    const value = query[name];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function maskPayload(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

function extractMerchantTxnId(query: NormalizedQuery): { txnId: string; paramName: string } | null {
  for (const name of TXN_PARAM_NAMES) {
    const txnId = getQueryValue(query, [name]);
    if (txnId) return { txnId, paramName: name };
  }
  return null;
}

function extractEpsTxnId(query: NormalizedQuery): string | null {
  return getQueryValue(query, EPS_TXN_PARAM_NAMES);
}

function extractOrderRef(query: NormalizedQuery): string | null {
  return getQueryValue(query, ORDER_PARAM_NAMES);
}

async function findPaymentByReference(ref: string): Promise<CallbackPayment | null> {
  const orWhere: Array<{
    merchantTxnId?: string;
    gatewayRef?: string;
    epsTxnId?: string;
    id?: string;
  }> = [
    { merchantTxnId: ref },
    { gatewayRef: ref },
    { epsTxnId: ref },
  ];

  if (isUuid(ref)) {
    orWhere.push({ id: ref });
  }

  return prisma.payment.findFirst({
    where: { OR: orWhere },
    select: {
      id: true,
      merchantTxnId: true,
      epsTxnId: true,
      gatewayRef: true,
      entityType: true,
      purpose: true,
      payload: true,
    },
  });
}

function isCampaignPayment(payment: CallbackPayment): boolean {
  return payment.entityType === 'campaign' || payment.purpose.startsWith('campaign');
}

async function findPaymentForCallback(
  query: NormalizedQuery,
  merchantTxnRef?: string | null,
  epsTxnId?: string | null,
): Promise<CallbackPayment | null> {
  const refs = uniqueNonEmpty([
    merchantTxnRef ?? null,
    getQueryValue(query, TXN_PARAM_NAMES),
    getQueryValue(query, PAYMENT_REF_PARAM_NAMES),
    epsTxnId ?? null,
    getQueryValue(query, EPS_TXN_PARAM_NAMES),
  ]);

  for (const ref of refs) {
    const payment = await findPaymentByReference(ref);
    if (payment) return payment;
  }

  return null;
}

async function findCampaignBookingByPaymentId(paymentId: string): Promise<string | null> {
  const reg = await prisma.campaignRegistration.findFirst({
    where: { paymentId },
    select: { bookingNumber: true },
  });
  return reg?.bookingNumber ?? null;
}

async function recoverBooking(
  query: NormalizedQuery,
  merchantTxnRef?: string | null,
  epsTxnId?: string | null,
): Promise<{ bookingNumber: string | null; payment: CallbackPayment | null }> {
  const bookingRef = getQueryValue(query, DIRECT_BOOKING_PARAM_NAMES);

  if (bookingRef?.startsWith('BPA-DON-')) {
    const don = await prisma.donation.findUnique({
      where: { referenceNo: bookingRef },
      select: { referenceNo: true, paymentId: true },
    });

    if (don) {
      const payment = don.paymentId ? await findPaymentByReference(don.paymentId) : null;
      return { bookingNumber: don.referenceNo, payment };
    }
  } else if (bookingRef?.startsWith('BPA-')) {
    const reg = await prisma.campaignRegistration.findUnique({
      where: { bookingNumber: bookingRef },
      select: { bookingNumber: true, paymentId: true },
    });

    if (reg) {
      const payment = reg.paymentId ? await findPaymentByReference(reg.paymentId) : null;
      return { bookingNumber: reg.bookingNumber, payment };
    }
  }

  const payment = await findPaymentForCallback(query, merchantTxnRef, epsTxnId);
  if (!payment) {
    return { bookingNumber: null, payment: null };
  }

  if (isCampaignPayment(payment)) {
    const bookingNumber = await findCampaignBookingByPaymentId(payment.id);
    return { bookingNumber, payment };
  }

  if (payment.entityType === 'donation' || payment.purpose === 'donation') {
    const don = await prisma.donation.findUnique({
      where: { paymentId: payment.id },
      select: { referenceNo: true },
    });
    return { bookingNumber: don?.referenceNo || null, payment };
  }

  return { bookingNumber: null, payment };
}

async function persistEpsTxnId(paymentId: string | null | undefined, epsTxnId: string | null): Promise<void> {
  if (!paymentId || !epsTxnId) return;

  try {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { epsTxnId, gatewayRef: epsTxnId },
    });
  } catch {
    // Gateway ref persistence should never crash the callback flow
  }
}

const allowedCallbackIPs: Set<string> = new Set(
  config.EPS_CALLBACK_IPS
    ? config.EPS_CALLBACK_IPS.split(',').map((ip) => ip.trim()).filter(Boolean)
    : [],
);

function requireCallbackIP(req: Request, res: Response, next: NextFunction): void {
  if (allowedCallbackIPs.size === 0) return next();
  const clientIP = req.ip ?? req.socket.remoteAddress ?? '';
  if (!allowedCallbackIPs.has(clientIP)) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return;
  }
  next();
}

async function markPendingReviewByBookingNumber(bookingNumber: string): Promise<void> {
  try {
    let paymentId: string | null = null;

    if (bookingNumber.startsWith('BPA-DON-')) {
      const don = await prisma.donation.findUnique({
        where: { referenceNo: bookingNumber },
        select: { paymentId: true },
      });
      paymentId = don?.paymentId ?? null;
    } else {
      const reg = await prisma.campaignRegistration.findUnique({
        where: { bookingNumber },
        select: { paymentId: true },
      });
      paymentId = reg?.paymentId ?? null;
    }

    if (!paymentId) return;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, payload: true },
    });
    if (!payment || payment.status !== 'pending') return;

    // Merge rather than replace — Payment.payload also carries
    // `{platform: 'mobile'}` (see registerForCampaign), which getRedirectUrl
    // needs on every subsequent callback (e.g. a duplicate/retried EPS
    // callback) to keep returning the bpa:// deep link instead of
    // silently falling back to the web FRONTEND_URL.
    const existingPayload = (payment.payload as Record<string, unknown> | null) ?? {};
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'pending_review',
        payload: {
          ...existingPayload,
          markedVia: 'missing_txn_callback',
          markedAt: new Date().toISOString(),
        } as never,
      },
    });
  } catch {
    // Never crash the callback flow
  }
}

function deriveCallbackType(path: string): string {
  if (path.includes('success')) return 'success';
  if (path.includes('fail')) return 'fail';
  if (path.includes('cancel')) return 'cancel';
  return 'unknown';
}

function getUserAgent(req: Request): string | null {
  return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
}

async function logCallbackAttempt(opts: {
  callbackType: string;
  merchantTxnId: string | null;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'create',
        resource: 'payment_callback',
        resourceId: opts.merchantTxnId ?? undefined,
        newValues: {
          callbackType: opts.callbackType,
          outcome: opts.outcome,
          payload: opts.payload ?? null,
        } as never,
        ipAddress: opts.ipAddress ?? undefined,
        userAgent: opts.userAgent ?? undefined,
      },
    });
  } catch {
    // Audit log failure must never crash the callback flow
  }
}

async function redirectMissingMerchantTxn(
  req: Request,
  res: Response,
  callbackType: string,
  masked: Record<string, unknown>,
  merchantTxnRef?: string | null,
  epsTxnId?: string | null,
): Promise<void> {
  const normalizedQuery = normalizeQuery(req.query);
  const recovery = await recoverBooking(normalizedQuery, merchantTxnRef, epsTxnId);

  await persistEpsTxnId(recovery.payment?.id, epsTxnId ?? null);

  if (recovery.bookingNumber) {
    await markPendingReviewByBookingNumber(recovery.bookingNumber);
  }

  void logCallbackAttempt({
    callbackType,
    merchantTxnId: merchantTxnRef ?? null,
    outcome: recovery.bookingNumber ? 'missing_txn_booking_found' : 'rejected_invalid_id',
    ipAddress: req.ip ?? null,
    userAgent: getUserAgent(req),
    payload: masked,
  });

  const fallbackRef = extractOrderRef(normalizedQuery) ?? merchantTxnRef ?? epsTxnId ?? null;

  // Donation missing-txn: redirect to donate thank-you with pending status rather than payment/failed
  if (recovery.payment?.entityType === 'donation' || recovery.bookingNumber?.startsWith('BPA-DON-')) {
    res.redirect(getRedirectUrl('failed', {
      merchantTxnId: merchantTxnRef ?? fallbackRef ?? 'unknown',
      bookingNumber: recovery.bookingNumber,
      payment: recovery.payment ?? { id: '', merchantTxnId: null, epsTxnId: null, gatewayRef: null, entityType: 'donation', purpose: 'donation', payload: null },
      reason: 'missing_txn',
    }));
    return;
  }

  const bookingQs = recovery.bookingNumber ? `&booking=${encodeURIComponent(recovery.bookingNumber)}` : '';
  const refQs = !recovery.bookingNumber && fallbackRef ? `&ref=${encodeURIComponent(fallbackRef)}` : '';

  if (isMobilePayment(recovery.payment)) {
    res.redirect(`bpa://payment/failed?reason=missing_txn${bookingQs}${refQs}`);
    return;
  }

  res.redirect(`${config.FRONTEND_URL}/payment/failed?reason=missing_txn${bookingQs}${refQs}`);
}

function validateMerchantTxnId(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const callbackType = deriveCallbackType(req.path);
    const masked = maskPayload(req.query as Record<string, unknown>);
    const normalizedQuery = normalizeQuery(req.query);
    console.log(`[EPS callback] normalized keys=${Object.keys(normalizedQuery).join(', ') || '(none)'}`);

    const found = extractMerchantTxnId(normalizedQuery);
    const merchantTxnRef = found?.txnId ?? null;
    const epsTxnId = extractEpsTxnId(normalizedQuery);
    const payment = await findPaymentForCallback(normalizedQuery, merchantTxnRef, epsTxnId);
    const canonicalMerchantTxnId =
      payment?.merchantTxnId?.trim() ||
      (merchantTxnRef && MERCHANT_TXN_ID_RE.test(merchantTxnRef) ? merchantTxnRef : null);

    if (!canonicalMerchantTxnId) {
      console.warn(
        `[EPS callback:${callbackType}] No valid merchant transaction ID. ` +
        `Keys: ${Object.keys(normalizedQuery).join(', ') || '(none)'} | ` +
        `Payload: ${JSON.stringify(masked)}`,
      );
      await redirectMissingMerchantTxn(req, res, callbackType, masked, merchantTxnRef, epsTxnId);
      return;
    }

    if (merchantTxnRef && merchantTxnRef !== canonicalMerchantTxnId) {
      console.log(
        `[EPS callback] TXN reference "${merchantTxnRef}" ` +
        `normalized to merchantTransactionId=${canonicalMerchantTxnId}`,
      );
    }

    (req.query as Record<string, unknown>).merchantTransactionId = canonicalMerchantTxnId;
    next();
  })().catch(next);
}

router.use(callbackLimiter);
router.use(requireCallbackIP);

function getRedirectUrl(status: 'success' | 'failed', params: { merchantTxnId: string; bookingNumber?: string | null; payment?: CallbackPayment | null; reason?: string }): string {
  const { merchantTxnId, bookingNumber, payment, reason } = params;
  const baseUrl = config.FRONTEND_URL?.replace(/\/$/, '') || '';
  
  // 1. Donation redirection — bookingNumber IS the referenceNo (BPA-DON-*) for donations
  if (payment?.entityType === 'donation' || payment?.purpose === 'donation') {
    const referenceNo = bookingNumber ?? null;
    const donationQs = referenceNo ? `donationNumber=${encodeURIComponent(referenceNo)}&` : '';
    const reasonQs = reason ? `&reason=${encodeURIComponent(reason)}` : '';

    if (status === 'success') {
      return `${baseUrl}/donate/thank-you?${donationQs}status=success`;
    }
    return `${baseUrl}/donate/thank-you?${donationQs}status=failed${reasonQs}`;
  }

  // 2. Campaign / General redirection (existing logic)
  const bookingQs = bookingNumber ? `&booking=${encodeURIComponent(bookingNumber)}` : '';
  const reasonQs = reason ? `&reason=${encodeURIComponent(reason)}` : '';

  // Mobile app bookings (Payment.payload.platform === 'mobile') return via a
  // deep link instead of the web FRONTEND_URL, which the Android emulator's
  // browser can't resolve to a real page for the app to land on.
  if (isMobilePayment(payment)) {
    const mobileStatus = status === 'success' ? 'success' : 'failed';
    return `bpa://payment/${mobileStatus}?txn=${merchantTxnId}${bookingQs}${reasonQs}`;
  }

  const path = status === 'success' ? 'payment/success' : 'payment/failed';
  return `${baseUrl}/${path}?txn=${merchantTxnId}${bookingQs}${reasonQs}`;
}

router.get('/callback/success', validateMerchantTxnId, async (req: Request, res: Response) => {
  const merchantTxnId = req.query.merchantTransactionId as string;
  const normalizedQuery = normalizeQuery(req.query);
  const epsTxnId = extractEpsTxnId(normalizedQuery);
  const masked = maskPayload(req.query as Record<string, unknown>);
  const recovery = await recoverBooking(normalizedQuery, merchantTxnId, epsTxnId);

  await persistEpsTxnId(recovery.payment?.id, epsTxnId);

  try {
    const status = await settlePayment(merchantTxnId);

    void logCallbackAttempt({
      callbackType: 'success',
      merchantTxnId,
      outcome: status === 'success' ? 'settled_success' : `settled_${status}`,
      ipAddress: req.ip ?? null,
      userAgent: getUserAgent(req),
      payload: masked,
    });

    if (status === 'success') {
      return res.redirect(getRedirectUrl('success', { merchantTxnId, bookingNumber: recovery.bookingNumber, payment: recovery.payment }));
    }

    return res.redirect(getRedirectUrl('failed', { merchantTxnId, bookingNumber: recovery.bookingNumber, payment: recovery.payment, reason: 'verification_failed' }));
  } catch {
    void logCallbackAttempt({
      callbackType: 'success',
      merchantTxnId,
      outcome: 'error',
      ipAddress: req.ip ?? null,
      userAgent: getUserAgent(req),
      payload: masked,
    });

    return res.redirect(getRedirectUrl('failed', { merchantTxnId, bookingNumber: recovery.bookingNumber, payment: recovery.payment, reason: 'error' }));
  }
});

router.get('/callback/fail', validateMerchantTxnId, async (req: Request, res: Response) => {
  const merchantTxnId = req.query.merchantTransactionId as string;
  const normalizedQuery = normalizeQuery(req.query);
  const epsTxnId = extractEpsTxnId(normalizedQuery);
  const masked = maskPayload(req.query as Record<string, unknown>);
  const recovery = await recoverBooking(normalizedQuery, merchantTxnId, epsTxnId);

  await persistEpsTxnId(recovery.payment?.id, epsTxnId);

  const status = await settlePayment(merchantTxnId).catch(() => 'failed' as const);

  void logCallbackAttempt({
    callbackType: 'fail',
    merchantTxnId,
    outcome: `received_fail_settled_${status}`,
    ipAddress: req.ip ?? null,
    userAgent: getUserAgent(req),
    payload: masked,
  });

  const reason = status === 'cancelled' ? 'cancelled' : 'payment_failed';
  return res.redirect(getRedirectUrl('failed', { merchantTxnId, bookingNumber: recovery.bookingNumber, payment: recovery.payment, reason }));
});

router.get('/callback/cancel', validateMerchantTxnId, async (req: Request, res: Response) => {
  const merchantTxnId = req.query.merchantTransactionId as string;
  const normalizedQuery = normalizeQuery(req.query);
  const epsTxnId = extractEpsTxnId(normalizedQuery);
  const masked = maskPayload(req.query as Record<string, unknown>);
  const recovery = await recoverBooking(normalizedQuery, merchantTxnId, epsTxnId);

  await persistEpsTxnId(recovery.payment?.id, epsTxnId);

  await cancelPaymentRecord(merchantTxnId).catch(() => null);

  void logCallbackAttempt({
    callbackType: 'cancel',
    merchantTxnId,
    outcome: 'received_cancel',
    ipAddress: req.ip ?? null,
    userAgent: getUserAgent(req),
    payload: masked,
  });

  return res.redirect(getRedirectUrl('failed', { merchantTxnId, bookingNumber: recovery.bookingNumber, payment: recovery.payment, reason: 'cancelled' }));
});


export default router;
