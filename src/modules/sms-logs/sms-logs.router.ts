import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { smsLogListQuerySchema, resendSmsBodySchema, retryFailedBodySchema } from './sms-logs.types';
import {
  listSmsLogsHandler, getSmsLogHandler,
  resendSmsHandler, retryFailedSmsHandler, getSmsStatsHandler,
} from './sms-logs.controller';

const router = Router();

router.use(authenticate);

// Literal routes before parameterized
router.get('/stats', authorize(RESOURCES.SMS_LOGS, ACTIONS.READ), getSmsStatsHandler);
router.post('/retry-failed', authorize(RESOURCES.SMS_LOGS, ACTIONS.UPDATE), validate(retryFailedBodySchema, 'body'), retryFailedSmsHandler);
router.get('/', authorize(RESOURCES.SMS_LOGS, ACTIONS.READ), validate(smsLogListQuerySchema, 'query'), listSmsLogsHandler);
router.get('/:id', authorize(RESOURCES.SMS_LOGS, ACTIONS.READ), getSmsLogHandler);
router.post('/:id/resend', authorize(RESOURCES.SMS_LOGS, ACTIONS.UPDATE), validate(resendSmsBodySchema, 'body'), resendSmsHandler);

export default router;
