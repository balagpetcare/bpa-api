import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createCarePartnerBenefitSchema,
  updateCarePartnerBenefitSchema,
  carePartnerBenefitListQuerySchema,
} from './care-partner-benefits.types';
import {
  createBenefitHandler,
  listBenefitsHandler,
  getBenefitHandler,
  updateBenefitHandler,
  deleteBenefitHandler,
  listActiveBenefitsPublicHandler,
} from './care-partner-benefits.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.CARE_PARTNER_BENEFITS, ACTIONS.READ), validate(carePartnerBenefitListQuerySchema, 'query'), listBenefitsHandler);
adminRouter.post('/', authorize(RESOURCES.CARE_PARTNER_BENEFITS, ACTIONS.CREATE), validate(createCarePartnerBenefitSchema), createBenefitHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_BENEFITS, ACTIONS.READ), getBenefitHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_BENEFITS, ACTIONS.UPDATE), validate(updateCarePartnerBenefitSchema), updateBenefitHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_BENEFITS, ACTIONS.DELETE), deleteBenefitHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActiveBenefitsPublicHandler);

export { adminRouter as carePartnerBenefitsAdminRouter, publicRouter as carePartnerBenefitsPublicRouter };
