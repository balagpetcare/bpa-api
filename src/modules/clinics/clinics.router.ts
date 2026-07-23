import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requireLocalUser } from '../../middlewares/requireLocalUser';
import { authorize, requireRole } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS, ROLES } from '../../config/constants';
import {
  createClinicOrganizationSchema,
  updateClinicOrganizationSchema,
  publishClinicOrganizationSchema,
  clinicOrganizationListQuerySchema,
  createClinicBranchSchema,
  updateClinicBranchSchema,
  publishClinicBranchSchema,
  clinicBranchListQuerySchema,
  updateClinicBranchRelatedSchema,
  archiveEntitySchema,
  permanentDeleteSchema,
  bulkClinicOrganizationActionSchema,
  bulkClinicBranchActionSchema,
  addClinicBranchImageSchema,
  reorderClinicBranchImagesSchema,
} from './clinics.types';
import {
  createOrganizationHandler,
  listOrganizationsHandler,
  getOrganizationHandler,
  updateOrganizationHandler,
  publishOrganizationHandler,
  archiveOrganizationHandler,
  restoreOrganizationHandler,
  deleteOrganizationHandler,
  bulkOrganizationActionHandler,
  createBranchHandler,
  listBranchesHandler,
  getBranchHandler,
  updateBranchHandler,
  publishBranchHandler,
  archiveBranchHandler,
  restoreBranchHandler,
  duplicateBranchHandler,
  deleteBranchHandler,
  bulkBranchActionHandler,
  updateBranchRelatedHandler,
  addBranchImageHandler,
  removeBranchImageHandler,
  reorderBranchImagesHandler,
} from './clinics.controller';

const router = Router();

router.use(authenticate);
// Maps Central Auth's non-UUID `sub` onto this app's local `users.id` (auto-
// provisioning a shadow user row on first write) so createdById/updatedById/
// archivedById — all `@db.Uuid` FKs — never receive a raw Central Auth cuid.
router.use(requireLocalUser);

const ORG = RESOURCES.CLINIC_ORGANIZATIONS;
const BRANCH = RESOURCES.CLINIC_BRANCHES;

// Permanent deletion bypasses granular `resource:delete` permissions entirely —
// only the highest role may perform it, regardless of what an admin's role
// grants elsewhere. `authorize()` can't express "no permission override", so
// this uses the separate `requireRole` gate instead (see authorize.ts).
const requireGlobalSuperAdmin = requireRole('GLOBAL_SUPER_ADMIN', 'SUPER_ADMIN', ROLES.SUPER_ADMIN);

router.get('/organizations', authorize(ORG, ACTIONS.READ), validate(clinicOrganizationListQuerySchema, 'query'), listOrganizationsHandler);
router.post('/organizations', authorize(ORG, ACTIONS.CREATE), validate(createClinicOrganizationSchema), createOrganizationHandler);
router.post('/organizations/bulk', authorize(ORG, ACTIONS.MANAGE), validate(bulkClinicOrganizationActionSchema), bulkOrganizationActionHandler);
router.get('/organizations/:id', validateUuid('id'), authorize(ORG, ACTIONS.READ), getOrganizationHandler);
router.patch('/organizations/:id', validateUuid('id'), authorize(ORG, ACTIONS.UPDATE), validate(updateClinicOrganizationSchema), updateOrganizationHandler);
router.patch('/organizations/:id/publish', validateUuid('id'), authorize(ORG, ACTIONS.PUBLISH), validate(publishClinicOrganizationSchema), publishOrganizationHandler);
router.patch('/organizations/:id/archive', validateUuid('id'), authorize(ORG, ACTIONS.ARCHIVE), validate(archiveEntitySchema), archiveOrganizationHandler);
router.patch('/organizations/:id/restore', validateUuid('id'), authorize(ORG, ACTIONS.RESTORE), restoreOrganizationHandler);
router.delete('/organizations/:id', validateUuid('id'), requireGlobalSuperAdmin, validate(permanentDeleteSchema), deleteOrganizationHandler);

router.get('/branches', authorize(BRANCH, ACTIONS.READ), validate(clinicBranchListQuerySchema, 'query'), listBranchesHandler);
router.post('/branches', authorize(BRANCH, ACTIONS.CREATE), validate(createClinicBranchSchema), createBranchHandler);
router.post('/branches/bulk', authorize(BRANCH, ACTIONS.MANAGE), validate(bulkClinicBranchActionSchema), bulkBranchActionHandler);
router.get('/branches/:id', validateUuid('id'), authorize(BRANCH, ACTIONS.READ), getBranchHandler);
router.patch('/branches/:id', validateUuid('id'), authorize(BRANCH, ACTIONS.UPDATE), validate(updateClinicBranchSchema), updateBranchHandler);
router.patch('/branches/:id/publish', validateUuid('id'), authorize(BRANCH, ACTIONS.PUBLISH), validate(publishClinicBranchSchema), publishBranchHandler);
router.patch('/branches/:id/archive', validateUuid('id'), authorize(BRANCH, ACTIONS.ARCHIVE), validate(archiveEntitySchema), archiveBranchHandler);
router.patch('/branches/:id/restore', validateUuid('id'), authorize(BRANCH, ACTIONS.RESTORE), restoreBranchHandler);
router.post('/branches/:id/duplicate', validateUuid('id'), authorize(BRANCH, ACTIONS.CREATE), duplicateBranchHandler);
router.patch('/branches/:id/related', validateUuid('id'), authorize(BRANCH, ACTIONS.UPDATE), validate(updateClinicBranchRelatedSchema), updateBranchRelatedHandler);
router.post('/branches/:id/images', validateUuid('id'), authorize(BRANCH, ACTIONS.UPDATE), validate(addClinicBranchImageSchema), addBranchImageHandler);
router.delete('/branches/:id/images/:imageId', validateUuid('id'), validateUuid('imageId'), authorize(BRANCH, ACTIONS.UPDATE), removeBranchImageHandler);
router.patch('/branches/:id/images/reorder', validateUuid('id'), authorize(BRANCH, ACTIONS.UPDATE), validate(reorderClinicBranchImagesSchema), reorderBranchImagesHandler);
router.delete('/branches/:id', validateUuid('id'), requireGlobalSuperAdmin, validate(permanentDeleteSchema), deleteBranchHandler);

export default router;
