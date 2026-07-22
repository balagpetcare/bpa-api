import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { uploadSingle } from '../../middlewares/upload';
import { commentLimiter, reactionLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  CreatePostSchema,
  UpdatePostSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateCommentSchema,
  CreateReportSchema,
} from './content.types';
import {
  getHomepageContentHandler,
  getPublicVideosHandler,
  getPublicVideoBySlugHandler,
  getPublicCommunityPostsHandler,
  getPublicCommunityPostBySlugHandler,
  getPublicVideoCategoriesHandler,
  uploadVideoFileHandler,
  likePostHandler,
  unlikePostHandler,
  addCommentHandler,
  editCommentHandler,
  deleteCommentHandler,
  reportContentHandler,
  listAdminPostsHandler,
  createPostHandler,
  updatePostHandler,
  getPostByIdHandler,
  deletePostHandler,
  listCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  listAdminCommentsHandler,
  moderateCommentHandler,
  listAdminReportsHandler,
  resolveReportHandler,
} from './content.controller';

const publicRouter = Router();
const authenticatedRouter = Router();
const adminRouter = Router();

// ─── Public Routes ───
publicRouter.get('/content/homepage', getHomepageContentHandler);
publicRouter.get('/video-categories', getPublicVideoCategoriesHandler);
publicRouter.get('/videos', getPublicVideosHandler);
publicRouter.get('/videos/:slug', authenticateOptional, getPublicVideoBySlugHandler);
publicRouter.get('/community', getPublicCommunityPostsHandler);
publicRouter.get('/community/:slug', authenticateOptional, getPublicCommunityPostBySlugHandler);

// ─── Authenticated User Routes ───
authenticatedRouter.use(authenticate);
authenticatedRouter.post('/posts/:id/like', validateUuid('id'), reactionLimiter, likePostHandler);
authenticatedRouter.post('/posts/:id/unlike', validateUuid('id'), reactionLimiter, unlikePostHandler);
authenticatedRouter.post('/posts/:id/comments', validateUuid('id'), commentLimiter, validate(CreateCommentSchema), addCommentHandler);
authenticatedRouter.put('/comments/:commentId', validateUuid('commentId'), validate(CreateCommentSchema), editCommentHandler);
authenticatedRouter.delete('/comments/:commentId', validateUuid('commentId'), deleteCommentHandler);
authenticatedRouter.post('/report', validate(CreateReportSchema), reportContentHandler);

// ─── Admin Routes ───
adminRouter.use(authenticate);

// Admin Category Routes
adminRouter.get('/categories', authorize(RESOURCES.CONTENT, ACTIONS.READ), listCategoriesHandler);
adminRouter.post('/categories', authorize(RESOURCES.CONTENT, ACTIONS.CREATE), validate(CreateCategorySchema), createCategoryHandler);
adminRouter.patch('/categories/:id', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.UPDATE), validate(UpdateCategorySchema), updateCategoryHandler);
adminRouter.delete('/categories/:id', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.DELETE), deleteCategoryHandler);

// Admin Post Routes
adminRouter.get('/posts', authorize(RESOURCES.CONTENT, ACTIONS.READ), listAdminPostsHandler);
adminRouter.post('/posts', authorize(RESOURCES.CONTENT, ACTIONS.CREATE), validate(CreatePostSchema), createPostHandler);
adminRouter.get('/posts/:id', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.READ), getPostByIdHandler);
adminRouter.patch('/posts/:id', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.UPDATE), validate(UpdatePostSchema), updatePostHandler);
adminRouter.delete('/posts/:id', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.DELETE), deletePostHandler);

// Admin Video Upload Route
adminRouter.post('/videos/upload', authorize(RESOURCES.CONTENT, ACTIONS.CREATE), uploadSingle, uploadVideoFileHandler);

// Admin Comment Moderation Routes
adminRouter.get('/comments', authorize(RESOURCES.CONTENT, ACTIONS.READ), listAdminCommentsHandler);
adminRouter.patch('/comments/:commentId/status', validateUuid('commentId'), authorize(RESOURCES.CONTENT, ACTIONS.UPDATE), moderateCommentHandler);

// Admin Report Management Routes
adminRouter.get('/reports', authorize(RESOURCES.CONTENT, ACTIONS.READ), listAdminReportsHandler);
adminRouter.patch('/reports/:id/status', validateUuid('id'), authorize(RESOURCES.CONTENT, ACTIONS.UPDATE), resolveReportHandler);

export {
  publicRouter as contentPublicRouter,
  authenticatedRouter as contentAuthenticatedRouter,
  adminRouter as contentAdminRouter,
};
