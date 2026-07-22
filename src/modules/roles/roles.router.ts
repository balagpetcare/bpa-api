import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, requireRole } from '../../middlewares/authorize';
import { RESOURCES, ACTIONS, ROLES } from '../../config/constants';
import { createRoleSchema, updateRoleSchema } from './roles.types';
import {
  listRolesHandler,
  getRoleHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  listPermissionsHandler,
} from './roles.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.ROLES, ACTIONS.READ), listRolesHandler);
router.get('/permissions', authorize(RESOURCES.ROLES, ACTIONS.READ), listPermissionsHandler);
router.get('/:id', authorize(RESOURCES.ROLES, ACTIONS.READ), getRoleHandler);
router.post('/', requireRole(ROLES.SUPER_ADMIN), validate(createRoleSchema), createRoleHandler);
router.put('/:id', requireRole(ROLES.SUPER_ADMIN), validate(updateRoleSchema), updateRoleHandler);
router.delete('/:id', requireRole(ROLES.SUPER_ADMIN), deleteRoleHandler);

export default router;
