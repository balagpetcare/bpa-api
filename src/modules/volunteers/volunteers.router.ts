import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import { createVolunteerSchema, updateVolunteerStatusSchema, volunteerListQuerySchema } from './volunteers.types';
import {
  submitVolunteerHandler, listVolunteersHandler, getVolunteerHandler, updateVolunteerStatusHandler,
} from './volunteers.controller';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────

router.post('/public', publicFormLimiter, validate(createVolunteerSchema), submitVolunteerHandler);

// ─── Admin ────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', authorize(RESOURCES.VOLUNTEERS, ACTIONS.READ), validate(volunteerListQuerySchema, 'query'), listVolunteersHandler);
router.get('/:id', authorize(RESOURCES.VOLUNTEERS, ACTIONS.READ), getVolunteerHandler);
router.patch('/:id/status', authorize(RESOURCES.VOLUNTEERS, ACTIONS.UPDATE), validate(updateVolunteerStatusSchema), updateVolunteerStatusHandler);

export default router;
