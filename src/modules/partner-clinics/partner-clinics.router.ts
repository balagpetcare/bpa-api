import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createPartnerClinicSchema,
  updatePartnerClinicSchema,
  partnerClinicListQuerySchema,
  reorderPartnerClinicsSchema,
} from './partner-clinics.types';
import {
  createPartnerClinicHandler,
  listPartnerClinicsHandler,
  getPartnerClinicHandler,
  updatePartnerClinicHandler,
  deactivatePartnerClinicHandler,
  reorderPartnerClinicsHandler,
} from './partner-clinics.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.READ), validate(partnerClinicListQuerySchema, 'query'), listPartnerClinicsHandler);
router.post('/', authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.CREATE), validate(createPartnerClinicSchema), createPartnerClinicHandler);
router.patch('/reorder', authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.MANAGE), validate(reorderPartnerClinicsSchema), reorderPartnerClinicsHandler);
router.get('/:id', validateUuid('id'), authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.READ), getPartnerClinicHandler);
router.patch('/:id', validateUuid('id'), authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.UPDATE), validate(updatePartnerClinicSchema), updatePartnerClinicHandler);
router.delete('/:id', validateUuid('id'), authorize(RESOURCES.PARTNER_CLINICS, ACTIONS.DELETE), deactivatePartnerClinicHandler);

export default router;
