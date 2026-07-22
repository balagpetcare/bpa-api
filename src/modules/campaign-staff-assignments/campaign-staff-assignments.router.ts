import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  assignStaffSchema, updateStaffAssignmentSchema,
  bulkAssignStaffSchema, listStaffAssignmentsQuerySchema,
} from './campaign-staff-assignments.types';
import {
  listHandler, assignHandler, updateHandler, deactivateHandler,
  bulkAssignHandler, myAssignedCampaignsHandler,
} from './campaign-staff-assignments.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);

// GET /api/v1/admin/campaigns/:campaignId/staff-assignments
router.get(
  '/',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_STAFF_ASSIGNMENTS, ACTIONS.READ),
  validate(listStaffAssignmentsQuerySchema, 'query'),
  listHandler,
);

// POST /api/v1/admin/campaigns/:campaignId/staff-assignments
router.post(
  '/',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_STAFF_ASSIGNMENTS, ACTIONS.CREATE),
  validate(assignStaffSchema),
  assignHandler,
);

// POST /api/v1/admin/campaigns/:campaignId/staff-assignments/bulk
router.post(
  '/bulk',
  validateUuid('campaignId'),
  authorize(RESOURCES.CAMPAIGN_STAFF_ASSIGNMENTS, ACTIONS.CREATE),
  validate(bulkAssignStaffSchema),
  bulkAssignHandler,
);

// PATCH /api/v1/admin/campaigns/:campaignId/staff-assignments/:assignmentId
router.patch(
  '/:assignmentId',
  validateUuid('campaignId', 'assignmentId'),
  authorize(RESOURCES.CAMPAIGN_STAFF_ASSIGNMENTS, ACTIONS.UPDATE),
  validate(updateStaffAssignmentSchema),
  updateHandler,
);

// DELETE /api/v1/admin/campaigns/:campaignId/staff-assignments/:assignmentId
router.delete(
  '/:assignmentId',
  validateUuid('campaignId', 'assignmentId'),
  authorize(RESOURCES.CAMPAIGN_STAFF_ASSIGNMENTS, ACTIONS.UPDATE),
  deactivateHandler,
);

export default router;

// Separate router for my-campaigns (no campaignId param)
export const myAssignedRouter = Router();
myAssignedRouter.use(authenticate);
myAssignedRouter.get('/my-assigned-campaigns', myAssignedCampaignsHandler);
