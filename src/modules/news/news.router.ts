import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createCategorySchema, updateCategorySchema,
  createTagSchema,
  createNewsSchema, updateNewsSchema, publishNewsSchema, newsListQuerySchema,
} from './news.types';
import {
  listCategoriesHandler, createCategoryHandler, updateCategoryHandler, deleteCategoryHandler,
  listTagsHandler, createTagHandler, deleteTagHandler,
  listNewsHandler, getNewsHandler, getNewsBySlugHandler,
  createNewsHandler, updateNewsHandler, publishNewsHandler, deleteNewsHandler,
} from './news.controller';

const router = Router();

// ─── Public routes (no auth) ──────────────────────────────────────

/**
 * @openapi
 * /api/v1/news:
 *   get:
 *     tags: [News Public]
 *     summary: List published news articles
 */
router.get('/public/news', validate(newsListQuerySchema, 'query'), listNewsHandler);
router.get('/public/news/slug/:slug', getNewsBySlugHandler);

// ─── Admin routes ─────────────────────────────────────────────────

router.use(authenticate);

// Categories
router.get(
  '/categories',
  authorize(RESOURCES.NEWS, ACTIONS.READ),
  listCategoriesHandler,
);
router.post(
  '/categories',
  authorize(RESOURCES.NEWS, ACTIONS.CREATE),
  validate(createCategorySchema),
  createCategoryHandler,
);
router.put(
  '/categories/:id',
  authorize(RESOURCES.NEWS, ACTIONS.UPDATE),
  validate(updateCategorySchema),
  updateCategoryHandler,
);
router.delete(
  '/categories/:id',
  authorize(RESOURCES.NEWS, ACTIONS.DELETE),
  deleteCategoryHandler,
);

// Tags
router.get('/tags', authorize(RESOURCES.NEWS, ACTIONS.READ), listTagsHandler);
router.post('/tags', authorize(RESOURCES.NEWS, ACTIONS.CREATE), validate(createTagSchema), createTagHandler);
router.delete('/tags/:id', authorize(RESOURCES.NEWS, ACTIONS.DELETE), deleteTagHandler);

// Articles
router.get(
  '/',
  authorize(RESOURCES.NEWS, ACTIONS.READ),
  validate(newsListQuerySchema, 'query'),
  listNewsHandler,
);
router.get('/:id', authorize(RESOURCES.NEWS, ACTIONS.READ), getNewsHandler);
router.post(
  '/',
  authorize(RESOURCES.NEWS, ACTIONS.CREATE),
  validate(createNewsSchema),
  createNewsHandler,
);
router.put(
  '/:id',
  authorize(RESOURCES.NEWS, ACTIONS.UPDATE),
  validate(updateNewsSchema),
  updateNewsHandler,
);
router.patch(
  '/:id/publish',
  authorize(RESOURCES.NEWS, ACTIONS.PUBLISH),
  validate(publishNewsSchema),
  publishNewsHandler,
);
router.delete('/:id', authorize(RESOURCES.NEWS, ACTIONS.DELETE), deleteNewsHandler);

export default router;
