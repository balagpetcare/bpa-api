import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createEventSchema, updateEventSchema, publishEventSchema, eventListQuerySchema,
  createRegistrationSchema, registrationListQuerySchema, updateRegistrationStatusSchema,
} from './events.types';
import {
  listEventsHandler, getEventHandler, getEventBySlugHandler,
  createEventHandler, updateEventHandler, publishEventHandler, deleteEventHandler,
  listRegistrationsHandler, createRegistrationHandler, updateRegistrationStatusHandler,
} from './events.controller';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────

router.get('/public', validate(eventListQuerySchema, 'query'), listEventsHandler);
router.get('/public/slug/:slug', getEventBySlugHandler);
router.post('/public/:id/register', validate(createRegistrationSchema), createRegistrationHandler);

// ─── Admin ────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', authorize(RESOURCES.EVENTS, ACTIONS.READ), validate(eventListQuerySchema, 'query'), listEventsHandler);
router.get('/:id', authorize(RESOURCES.EVENTS, ACTIONS.READ), getEventHandler);
router.post('/', authorize(RESOURCES.EVENTS, ACTIONS.CREATE), validate(createEventSchema), createEventHandler);
router.put('/:id', authorize(RESOURCES.EVENTS, ACTIONS.UPDATE), validate(updateEventSchema), updateEventHandler);
router.patch('/:id/publish', authorize(RESOURCES.EVENTS, ACTIONS.PUBLISH), validate(publishEventSchema), publishEventHandler);
router.delete('/:id', authorize(RESOURCES.EVENTS, ACTIONS.DELETE), deleteEventHandler);

router.get('/:id/registrations', authorize(RESOURCES.EVENTS, ACTIONS.READ), validate(registrationListQuerySchema, 'query'), listRegistrationsHandler);
router.patch('/:id/registrations/:regId/status', authorize(RESOURCES.EVENTS, ACTIONS.UPDATE), validate(updateRegistrationStatusSchema), updateRegistrationStatusHandler);

export default router;
