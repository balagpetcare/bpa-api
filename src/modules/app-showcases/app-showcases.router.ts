import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createAppShowcaseSchema, updateAppShowcaseSchema, appShowcaseListQuerySchema } from './app-showcases.types';
import {
  createAppShowcaseHandler,
  listAppShowcasesHandler,
  getAppShowcaseHandler,
  updateAppShowcaseHandler,
  deleteAppShowcaseHandler,
} from './app-showcases.controller';

export const appShowcasesAdminRouter = Router();
appShowcasesAdminRouter.use(authenticate);

appShowcasesAdminRouter.get('/', authorize(RESOURCES.APP_SHOWCASES, ACTIONS.READ), validate(appShowcaseListQuerySchema, 'query'), listAppShowcasesHandler);
appShowcasesAdminRouter.post('/', authorize(RESOURCES.APP_SHOWCASES, ACTIONS.CREATE), validate(createAppShowcaseSchema), createAppShowcaseHandler);
appShowcasesAdminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.APP_SHOWCASES, ACTIONS.READ), getAppShowcaseHandler);
appShowcasesAdminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.APP_SHOWCASES, ACTIONS.UPDATE), validate(updateAppShowcaseSchema), updateAppShowcaseHandler);
appShowcasesAdminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.APP_SHOWCASES, ACTIONS.DELETE), deleteAppShowcaseHandler);
