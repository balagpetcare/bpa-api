import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createCommunityZoneSchema, updateCommunityZoneSchema, communityZoneListQuerySchema } from './community-zones.types';
import {
  createZoneHandler, listZonesHandler, getZoneHandler,
  updateZoneHandler, deleteZoneHandler,
  getDemandRankingHandler,
  listActiveZonesPublicHandler, getZoneBySlugHandler,
} from './community-zones.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.READ), validate(communityZoneListQuerySchema, 'query'), listZonesHandler);
adminRouter.get('/demand-ranking', authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.READ), getDemandRankingHandler);
adminRouter.post('/', authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.CREATE), validate(createCommunityZoneSchema), createZoneHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.READ), getZoneHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.UPDATE), validate(updateCommunityZoneSchema), updateZoneHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_ZONES, ACTIONS.DELETE), deleteZoneHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActiveZonesPublicHandler);
publicRouter.get('/:slug', publicReadLimiter, getZoneBySlugHandler);

export { adminRouter as communityZonesAdminRouter, publicRouter as communityZonesPublicRouter };
