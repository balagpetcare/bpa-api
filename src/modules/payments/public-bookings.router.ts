import { Router, Request, Response, NextFunction } from 'express';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { findRegistrationByBookingRef, findRegistrationByPaymentRef } from './payments.repository';
import { streamValidationSlipPdf } from './validation-slip.pdf';
import { AppError } from '../../utils/AppError';

const router = Router();

/**
 * GET /api/v1/public/bookings/:bookingRef/validation-slip.pdf
 *
 * Accepts:
 *   - BPA-BK-YYYYMMDD-##### booking number
 *   - 17-digit EPS merchantTxnId
 *   - payment UUID
 *   - Any EPS order/reference ID that maps to a payment record
 *
 * Streams a validation slip PDF for any booking regardless of payment status.
 */
router.get(
  '/:bookingRef/validation-slip.pdf',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { bookingRef } = req.params;
      if (!bookingRef) throw AppError.badRequest('bookingRef is required');

      // Try exact booking-number match first, then fall back to payment-ref lookup
      const reg =
        (await findRegistrationByBookingRef(bookingRef)) ??
        (await findRegistrationByPaymentRef(bookingRef));
      if (!reg) throw AppError.notFound('Booking not found');

      const safeRef = bookingRef.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="validation-slip-${safeRef}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');

      await streamValidationSlipPdf(reg, res);
    } catch (err) { next(err); }
  },
);

export default router;
