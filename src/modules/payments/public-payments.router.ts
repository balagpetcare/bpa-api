import { Router, Request, Response, NextFunction } from 'express';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { sendSuccess } from '../../utils/response';
import { getPublicPaymentStatus, settlePayment } from './payments.service';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../database/prisma';
import { config } from '../../config';
import { isEPSConfigured } from '../../services/eps.service';

const router = Router();

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

function getRequestData(req: Request): Record<string, string> {
  const data: Record<string, string> = {};
  const source = { ...req.query, ...req.body };
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      data[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      const first = value.find(item => typeof item === 'string');
      if (first) data[key.toLowerCase()] = first;
    }
  }
  return data;
}

function getMerchantTxnId(data: Record<string, string>): string | null {
  const keys = [
    'merchanttransactionid', 'merchanttxnid', 'txn', 'transactionid', 'transaction_id',
    'tran_id', 'val_id', 'mer_txnid', 'epwtxnid', 'paymentrefid', 'payment_ref_id',
    'ssl_txn_id', 'customerorderid', 'orderid', 'value_a', 'valuea', 'ref', 'reference'
  ];
  for (const k of keys) {
    if (data[k]) return data[k].trim();
  }
  return null;
}

/**
 * GET /api/v1/public/payments/status
 *
 * Query params (at least one required):
 *   bookingRef  — BPA-BK-YYYYMMDD-##### format
 *   paymentRef  — 17-digit merchantTxnId or payment UUID
 *
 * Returns booking + payment status safe for public display.
 * Does NOT return full owner info — only masked phone and campaign title.
 */
router.get(
  '/status',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookingRef = typeof req.query.bookingRef === 'string' ? req.query.bookingRef.trim() : undefined;
      const paymentRef = typeof req.query.paymentRef === 'string' ? req.query.paymentRef.trim() : undefined;

      if (!bookingRef && !paymentRef) {
        throw AppError.badRequest('Provide bookingRef or paymentRef query parameter');
      }

      const result = await getPublicPaymentStatus({ bookingRef, paymentRef });
      if (!result) {
        throw AppError.notFound('Booking or payment not found');
      }

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

/**
 * POST/GET /api/v1/public/payments/eps/callback
 */
router.all('/eps/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = getRequestData(req);
    const ref = getMerchantTxnId(data);
    if (!ref) {
      console.error('[EPS Callback] No transaction reference found in callback request.');
      return res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/failed?reason=missing_reference`);
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { merchantTxnId: ref },
          { gatewayRef: ref },
          { epsTxnId: ref },
          ...(isUuid(ref) ? [{ id: ref }] : [])
        ]
      },
      include: {
        communityMembershipPurchase: true
      }
    });

    if (!payment) {
      console.error('[EPS Callback] Payment not found for reference:', ref);
      return res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/failed?reason=payment_not_found&ref=${ref}`);
    }

    const merchantTxnId = payment.merchantTxnId || ref;
    const settleStatus = await settlePayment(merchantTxnId);
    const purchaseRef = payment.communityMembershipPurchase?.id || payment.merchantTxnId || ref;

    if (settleStatus === 'success') {
      return res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/success?ref=${purchaseRef}`);
    } else if (settleStatus === 'cancelled') {
      return res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/cancelled?ref=${purchaseRef}`);
    } else {
      return res.redirect(`${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/failed?ref=${purchaseRef}&reason=${settleStatus}`);
    }
  } catch (err) {
    console.error('[EPS Callback] Error handling callback:', err);
    next(err);
  }
});

/**
 * POST /api/v1/public/payments/eps/ipn
 */
router.post('/eps/ipn', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const data = getRequestData(req);
    const ref = getMerchantTxnId(data);
    if (!ref) {
      console.error('[EPS IPN] No transaction reference found in IPN request.');
      return res.status(400).json({ success: false, message: 'No transaction reference found' });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { merchantTxnId: ref },
          { gatewayRef: ref },
          { epsTxnId: ref },
          ...(isUuid(ref) ? [{ id: ref }] : [])
        ]
      }
    });

    if (!payment) {
      console.error('[EPS IPN] Payment not found for reference:', ref);
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const merchantTxnId = payment.merchantTxnId || ref;
    const settleStatus = await settlePayment(merchantTxnId);

    return res.json({ success: true, status: settleStatus });
  } catch (err) {
    console.error('[EPS IPN] Error handling IPN:', err);
    return next(err);
  }
});

/**
 * GET /api/v1/public/payments/:paymentReference/status
 */
router.get('/:paymentReference/status', publicReadLimiter, async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { paymentReference } = req.params;

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { merchantTxnId: paymentReference },
          { gatewayRef: paymentReference },
          { epsTxnId: paymentReference },
          ...(isUuid(paymentReference) ? [{ id: paymentReference }] : [])
        ]
      }
    });

    if (!payment) {
      throw AppError.notFound('Payment');
    }

    let currentStatus = payment.status;
    if (currentStatus === 'pending' && payment.merchantTxnId && isEPSConfigured()) {
      try {
        const settleStatus = await settlePayment(payment.merchantTxnId);
        currentStatus = settleStatus === 'success' ? 'success' : settleStatus === 'cancelled' ? 'cancelled' : settleStatus === 'failed' ? 'failed' : currentStatus;
      } catch (err) {
        console.error('[Payment Status API] Error checking EPS status:', err);
      }
    }

    return sendSuccess(res, {
      paymentReference: payment.merchantTxnId || payment.id,
      status: currentStatus,
      amount: payment.amount,
      currency: payment.currency,
      purpose: payment.purpose,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
