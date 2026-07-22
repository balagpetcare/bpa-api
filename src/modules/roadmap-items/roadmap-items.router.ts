import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createRoadmapItemSchema,
  updateRoadmapItemSchema,
  roadmapItemListQuerySchema,
} from './roadmap-items.types';
import {
  createRoadmapItemHandler,
  listRoadmapItemsHandler,
  getRoadmapItemHandler,
  updateRoadmapItemHandler,
  deleteRoadmapItemHandler,
  listActiveRoadmapItemsPublicHandler,
} from './roadmap-items.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.ROADMAP_ITEMS, ACTIONS.READ), validate(roadmapItemListQuerySchema, 'query'), listRoadmapItemsHandler);
adminRouter.post('/', authorize(RESOURCES.ROADMAP_ITEMS, ACTIONS.CREATE), validate(createRoadmapItemSchema), createRoadmapItemHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.ROADMAP_ITEMS, ACTIONS.READ), getRoadmapItemHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.ROADMAP_ITEMS, ACTIONS.UPDATE), validate(updateRoadmapItemSchema), updateRoadmapItemHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.ROADMAP_ITEMS, ACTIONS.DELETE), deleteRoadmapItemHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActiveRoadmapItemsPublicHandler);

export { adminRouter as roadmapItemsAdminRouter, publicRouter as roadmapItemsPublicRouter };
