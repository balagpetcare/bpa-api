import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createSocialImpactProgramSchema,
  updateSocialImpactProgramSchema,
  socialImpactProgramListQuerySchema,
} from './social-impact-programs.types';
import {
  createProgramHandler,
  listProgramsHandler,
  getProgramHandler,
  updateProgramHandler,
  deleteProgramHandler,
  listActiveProgramsPublicHandler,
} from './social-impact-programs.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.SOCIAL_IMPACT_PROGRAMS, ACTIONS.READ), validate(socialImpactProgramListQuerySchema, 'query'), listProgramsHandler);
adminRouter.post('/', authorize(RESOURCES.SOCIAL_IMPACT_PROGRAMS, ACTIONS.CREATE), validate(createSocialImpactProgramSchema), createProgramHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.SOCIAL_IMPACT_PROGRAMS, ACTIONS.READ), getProgramHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.SOCIAL_IMPACT_PROGRAMS, ACTIONS.UPDATE), validate(updateSocialImpactProgramSchema), updateProgramHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.SOCIAL_IMPACT_PROGRAMS, ACTIONS.DELETE), deleteProgramHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActiveProgramsPublicHandler);

export { adminRouter as socialImpactProgramsAdminRouter, publicRouter as socialImpactProgramsPublicRouter };
