/**
 * ⚠️ DEPRECATED — Legacy contact form module.
 *
 * Replaced by the contact-inquiry module at:
 *   - POST   /api/v1/public/contact-inquiries   (public submit)
 *   - GET    /api/v1/public/contact-inquiries/config
 *   - GET    /api/v1/admin/contact-inquiries     (admin inbox)
 *
 * Kept for backward compatibility with any clients still calling the old
 * /api/v1/contacts endpoints. Will be removed in a future release.
 */

import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import { createContactSchema, updateContactStatusSchema, contactListQuerySchema } from './contacts.types';
import {
  submitContactHandler, listContactsHandler, getContactHandler, updateContactStatusHandler,
} from './contacts.controller';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────

router.post('/public', publicFormLimiter, validate(createContactSchema), submitContactHandler);

// ─── Admin ────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', authorize(RESOURCES.CONTACTS, ACTIONS.READ), validate(contactListQuerySchema, 'query'), listContactsHandler);
router.get('/:id', authorize(RESOURCES.CONTACTS, ACTIONS.READ), getContactHandler);
router.patch('/:id/status', authorize(RESOURCES.CONTACTS, ACTIONS.UPDATE), validate(updateContactStatusSchema), updateContactStatusHandler);

export default router;
