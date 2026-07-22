import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import { sendCreated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { initializeEpsPayment, generateMerchantTxnId, getMembershipFee, isEPSConfigured } from '../../services/eps.service';
import { createPayment, updatePaymentEpsTxnId } from '../payments/payments.repository';

const router = Router();

const initiateMembershipSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  membershipType: z.enum(['regular', 'student', 'corporate']),
  message: z.string().max(2000).optional(),
});

type InitiateMembershipDto = z.infer<typeof initiateMembershipSchema>;

router.post(
  '/public/initiate',
  publicFormLimiter,
  validate(initiateMembershipSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as InitiateMembershipDto;

      if (!isEPSConfigured()) {
        throw AppError.badRequest('Online payment is not available at this time. Please contact us directly.');
      }

      const amount = getMembershipFee(dto.membershipType);
      const merchantTxnId = generateMerchantTxnId();

      // Create pending payment record
      const payment = await createPayment({
        gateway: 'eps',
        merchantTxnId,
        amount,
        currency: 'BDT',
        purpose: 'membership',
        payload: {
          type: 'membership',
          applicantName: dto.name,
          applicantEmail: dto.email,
          applicantPhone: dto.phone ?? null,
          membershipType: dto.membershipType,
          message: dto.message ?? null,
        },
      });

      // Initiate EPS payment
      const epsResult = await initializeEpsPayment({
        customerOrderId: payment.id,
        merchantTransactionId: merchantTxnId,
        totalAmount: amount,
        customerName:     dto.name,
        customerEmail:    dto.email,
        customerPhone:    dto.phone ?? '',
        customerAddress:  'Bangladesh',
        customerCity:     'Dhaka',
        customerState:    'Dhaka Division',
        customerPostcode: '1000',
        productName:      `BPA ${dto.membershipType.charAt(0).toUpperCase() + dto.membershipType.slice(1)} Membership`,
        valueA: payment.id,
        valueB: 'membership',
      });

      // Store EPS transaction ID
      await updatePaymentEpsTxnId(payment.id, epsResult.TransactionId);

      sendCreated(res, {
        paymentId: payment.id,
        merchantTxnId,
        redirectUrl: epsResult.RedirectURL,
        amount,
        currency: 'BDT',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
