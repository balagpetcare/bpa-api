import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createUserSchema, updateUserSchema, userListQuerySchema } from './users.types';
import {
  listUsersHandler,
  getUserHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
} from './users.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(RESOURCES.USERS, ACTIONS.READ), validate(userListQuerySchema, 'query'), listUsersHandler);
router.get('/:id', authorize(RESOURCES.USERS, ACTIONS.READ), getUserHandler);
router.post('/', authorize(RESOURCES.USERS, ACTIONS.CREATE), validate(createUserSchema), createUserHandler);
router.put('/:id', authorize(RESOURCES.USERS, ACTIONS.UPDATE), validate(updateUserSchema), updateUserHandler);
router.delete('/:id', authorize(RESOURCES.USERS, ACTIONS.DELETE), deleteUserHandler);

export default router;
