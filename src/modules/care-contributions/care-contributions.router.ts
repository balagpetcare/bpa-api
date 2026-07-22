import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicFormLimiter, publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { initiateContributionSchema, updateContributionSchema, contributionListQuerySchema } from './care-contributions.types';
import {
  listContributionsHandler, getContributionHandler, updateContributionHandler,
  initiateContributionHandler, getContributionStatusHandler, getContributionStatusByNumberHandler,
} from './care-contributions.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.CARE_CONTRIBUTIONS, ACTIONS.READ), validate(contributionListQuerySchema, 'query'), listContributionsHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.CARE_CONTRIBUTIONS, ACTIONS.READ), getContributionHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.CARE_CONTRIBUTIONS, ACTIONS.UPDATE), validate(updateContributionSchema), updateContributionHandler);

const publicRouter = Router();
publicRouter.post('/', publicFormLimiter, validate(initiateContributionSchema), initiateContributionHandler);
publicRouter.get('/by-number/:contributionNumber', publicReadLimiter, getContributionStatusByNumberHandler);
publicRouter.get('/:id/status', validateUuid('id'), publicReadLimiter, getContributionStatusHandler);

export { adminRouter as careContributionsAdminRouter, publicRouter as careContributionsPublicRouter };
