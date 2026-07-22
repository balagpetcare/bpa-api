import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  listLocationsHandler,
  getLocationHandler,
  treeHandler,
  searchHandler,
  pathHandler,
  createLocationHandler,
  updateLocationHandler,
  deleteLocationHandler,
  importTriggerHandler,
} from './location-tree.controller';

const router = Router();

// ── Public endpoints ───────────────────────────────────────────────────────────
// Mounted at /api/v1/public/locations

router.get('/', publicReadLimiter, listLocationsHandler);
router.get('/tree', publicReadLimiter, treeHandler);
router.get('/search', publicReadLimiter, searchHandler);
router.get('/:id/path', publicReadLimiter, validateUuid('id'), pathHandler);
router.get('/:id', publicReadLimiter, validateUuid('id'), getLocationHandler);

// ── Admin endpoints ────────────────────────────────────────────────────────────
// Mounted at /api/v1/admin/location-tree

export const adminLocationTreeRouter = Router();

adminLocationTreeRouter.use(authenticate);
adminLocationTreeRouter.use(authorize(RESOURCES.LOCATIONS, ACTIONS.READ));

adminLocationTreeRouter.get('/', listLocationsHandler);
adminLocationTreeRouter.get('/tree', treeHandler);
adminLocationTreeRouter.get('/search', searchHandler);
adminLocationTreeRouter.get('/:id/path', validateUuid('id'), pathHandler);
adminLocationTreeRouter.get('/:id', validateUuid('id'), getLocationHandler);

adminLocationTreeRouter.post(
  '/',
  authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE),
  createLocationHandler,
);

adminLocationTreeRouter.patch(
  '/:id',
  validateUuid('id'),
  authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE),
  updateLocationHandler,
);

adminLocationTreeRouter.delete(
  '/:id',
  validateUuid('id'),
  authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE),
  deleteLocationHandler,
);

adminLocationTreeRouter.post(
  '/import',
  authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE),
  importTriggerHandler,
);

export default router;
