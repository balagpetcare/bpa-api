import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { sendSuccess } from '../../utils/response';
import { syncPayment, listPayments, getPayment, manualMarkPaid, searchPayments } from './payments.service';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize(RESOURCES.PAYMENTS, ACTIONS.READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { items, meta } = await listPayments(req.query as never);
      sendSuccess(res, items, 200, meta);
    } catch (e) { next(e); }
  },
);

// Admin cross-field search: ?q=bookingRef|phone|txnId|paymentUUID
router.get(
  '/search',
  authorize(RESOURCES.PAYMENTS, ACTIONS.READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) { sendSuccess(res, []); return; }
      const results = await searchPayments(q);
      sendSuccess(res, results);
    } catch (e) { next(e); }
  },
);

router.get(
  '/:id',
  authorize(RESOURCES.PAYMENTS, ACTIONS.READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await getPayment(req.params.id)); } catch (e) { next(e); }
  },
);

router.post(
  '/:id/sync',
  authorize(RESOURCES.PAYMENTS, ACTIONS.UPDATE),
  async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await syncPayment(req.params.id)); } catch (e) { next(e); }
  },
);

// Manual mark-as-paid for cash/offline payments confirmed by staff
router.post(
  '/:id/mark-paid',
  authorize(RESOURCES.PAYMENTS, ACTIONS.UPDATE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = String(req.body?.note ?? '').trim() || undefined;
      const result = await manualMarkPaid(req.params.id, note);
      sendSuccess(res, result);
    } catch (e) { next(e); }
  },
);

export default router;
