import { Router } from 'express';
import { ACTIONS, RESOURCES } from '../../config/constants';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { 
  createEmailLayoutSchema, 
  updateEmailLayoutSchema, 
  previewEmailLayoutSchema, 
  sendTestEmailSchema 
} from './email-layouts.types';
import {
  listEmailLayoutsHandler,
  getEmailLayoutHandler,
  createEmailLayoutHandler,
  updateEmailLayoutHandler,
  setEmailLayoutDefaultHandler,
  previewEmailLayoutHandler,
  sendTestEmailHandler
} from './email-layouts.controller';

const router = Router();

// Ensure all email layout operations require admin authentication
router.use(authenticate);

// Standard list and detail retrievals
router.get('/', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.READ), listEmailLayoutsHandler);

// Preview and send test email handlers MUST be registered before /:id routes
router.post('/preview', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.READ), validate(previewEmailLayoutSchema), previewEmailLayoutHandler);
router.post('/send-test', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.UPDATE), validate(sendTestEmailSchema), sendTestEmailHandler);

// Detail operations
router.get('/:id', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.READ), getEmailLayoutHandler);
router.post('/', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.CREATE), validate(createEmailLayoutSchema), createEmailLayoutHandler);
router.patch('/:id', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.UPDATE), validate(updateEmailLayoutSchema), updateEmailLayoutHandler);
router.post('/:id/set-default', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.UPDATE), setEmailLayoutDefaultHandler);

export default router;
