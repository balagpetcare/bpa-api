import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { upsertSeoSchema } from './seo.types';
import {
  listSeoHandler, getSeoHandler,
  upsertSeoHandler, deleteSeoHandler,
  getPublicSeoHandler,
} from './seo.controller';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────
// Route param is a URL path like /home or /about — use wildcard
router.get('/public/*', getPublicSeoHandler);

// ─── Admin ────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', authorize(RESOURCES.SEO, ACTIONS.READ), listSeoHandler);
router.get('/*', authorize(RESOURCES.SEO, ACTIONS.READ), getSeoHandler);
router.put('/*', authorize(RESOURCES.SEO, ACTIONS.UPDATE), validate(upsertSeoSchema), upsertSeoHandler);
router.delete('/*', authorize(RESOURCES.SEO, ACTIONS.DELETE), deleteSeoHandler);

export default router;
