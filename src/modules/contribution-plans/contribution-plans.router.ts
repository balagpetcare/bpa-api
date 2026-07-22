import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createContributionPlanSchema, updateContributionPlanSchema } from './contribution-plans.types';
import {
  createPlanHandler, listPlansHandler, getPlanHandler,
  updatePlanHandler, deletePlanHandler,
  listActivePlansPublicHandler,
} from './contribution-plans.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.CONTRIBUTION_PLANS, ACTIONS.READ), listPlansHandler);
adminRouter.post('/', authorize(RESOURCES.CONTRIBUTION_PLANS, ACTIONS.CREATE), validate(createContributionPlanSchema), createPlanHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.CONTRIBUTION_PLANS, ACTIONS.READ), getPlanHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.CONTRIBUTION_PLANS, ACTIONS.UPDATE), validate(updateContributionPlanSchema), updatePlanHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.CONTRIBUTION_PLANS, ACTIONS.DELETE), deletePlanHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActivePlansPublicHandler);

export { adminRouter as contributionPlansAdminRouter, publicRouter as contributionPlansPublicRouter };
