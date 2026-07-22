import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createCommitteeMemberSchema, updateCommitteeMemberSchema,
  sortOrderSchema, committeeListQuerySchema,
} from './committee.types';
import {
  listMembersHandler, getMemberHandler,
  createMemberHandler, updateMemberHandler, deleteMemberHandler,
  reorderMembersHandler,
} from './committee.controller';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────

router.get('/public', validate(committeeListQuerySchema, 'query'), listMembersHandler);

// ─── Admin ────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', authorize(RESOURCES.COMMITTEE, ACTIONS.READ), validate(committeeListQuerySchema, 'query'), listMembersHandler);
router.get('/:id', authorize(RESOURCES.COMMITTEE, ACTIONS.READ), getMemberHandler);
router.post('/', authorize(RESOURCES.COMMITTEE, ACTIONS.CREATE), validate(createCommitteeMemberSchema), createMemberHandler);
router.put('/:id', authorize(RESOURCES.COMMITTEE, ACTIONS.UPDATE), validate(updateCommitteeMemberSchema), updateMemberHandler);
router.delete('/:id', authorize(RESOURCES.COMMITTEE, ACTIONS.DELETE), deleteMemberHandler);
router.patch('/reorder', authorize(RESOURCES.COMMITTEE, ACTIONS.UPDATE), validate(sortOrderSchema), reorderMembersHandler);

export default router;
