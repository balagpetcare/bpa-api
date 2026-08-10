import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createBpaProgramSchema, updateBpaProgramSchema, bpaProgramListQuerySchema } from './bpa-programs.types';
import {
  createBpaProgramHandler,
  listBpaProgramsHandler,
  getBpaProgramHandler,
  updateBpaProgramHandler,
  deleteBpaProgramHandler,
} from './bpa-programs.controller';

export const bpaProgramsAdminRouter = Router();
bpaProgramsAdminRouter.use(authenticate);

bpaProgramsAdminRouter.get('/', authorize(RESOURCES.BPA_PROGRAMS, ACTIONS.READ), validate(bpaProgramListQuerySchema, 'query'), listBpaProgramsHandler);
bpaProgramsAdminRouter.post('/', authorize(RESOURCES.BPA_PROGRAMS, ACTIONS.CREATE), validate(createBpaProgramSchema), createBpaProgramHandler);
bpaProgramsAdminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.BPA_PROGRAMS, ACTIONS.READ), getBpaProgramHandler);
bpaProgramsAdminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.BPA_PROGRAMS, ACTIONS.UPDATE), validate(updateBpaProgramSchema), updateBpaProgramHandler);
bpaProgramsAdminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.BPA_PROGRAMS, ACTIONS.DELETE), deleteBpaProgramHandler);
