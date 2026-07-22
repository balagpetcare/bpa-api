import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { emailLogListQuerySchema } from './email-logs.types';
import { listEmailLogsHandler, getEmailLogHandler } from './email-logs.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.EMAIL_LOGS, ACTIONS.READ), validate(emailLogListQuerySchema, 'query'), listEmailLogsHandler);
router.get('/:id', authorize(RESOURCES.EMAIL_LOGS, ACTIONS.READ), getEmailLogHandler);

export default router;
