import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { updateSettingsSchema, syncLogListQuerySchema } from './pet-smart-solution.types';
import {
  getSettingsHandler,
  updateSettingsHandler,
  testConnectionHandler,
  listSyncLogsHandler,
  getSyncLogHandler,
} from './pet-smart-solution.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/settings', authorize(RESOURCES.PET_SMART_SOLUTION, ACTIONS.READ), getSettingsHandler);
adminRouter.patch('/settings', authorize(RESOURCES.PET_SMART_SOLUTION, ACTIONS.UPDATE), validate(updateSettingsSchema), updateSettingsHandler);
adminRouter.post('/test-connection', authorize(RESOURCES.PET_SMART_SOLUTION, ACTIONS.UPDATE), testConnectionHandler);
adminRouter.get('/sync-logs', authorize(RESOURCES.PET_SMART_SOLUTION, ACTIONS.READ), validate(syncLogListQuerySchema, 'query'), listSyncLogsHandler);
adminRouter.get('/sync-logs/:id', validateUuid('id'), authorize(RESOURCES.PET_SMART_SOLUTION, ACTIONS.READ), getSyncLogHandler);

export { adminRouter as petSmartSolutionAdminRouter };
