import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent, buildPaginationMeta } from '../../utils/response';
import * as svc from './content.service';

// ─── Public Routes ────────────────────────────────────────────────

export async function getHomepageContentHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.getHomepageContent();
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getPublicVideosHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await svc.listPublicVideos({
      categoryId: req.query.categoryId as string,
      categorySlug: req.query.categorySlug as string,
      tag: req.query.tag as string,
      q: req.query.q as string,
      featured: req.query.featured === 'true',
      page,
      limit,
    });
    sendSuccess(res, result.items, 200, buildPaginationMeta(result.meta.total, page, limit));
  } catch (err) { next(err); }
}

export async function getPublicVideoBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    const post = await svc.getPostBySlug(req.params.slug, true, userId);
    if (post.type !== 'VIDEO') {
      res.status(404).json({ success: false, message: 'Video not found' });
      return;
    }
    sendSuccess(res, post);
  } catch (err) { next(err); }
}

export async function getPublicCommunityPostsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    
    // We want all post types except VIDEO
    const result = await svc.listPosts({
      status: 'published',
      q: req.query.q as string,
      categoryId: req.query.categoryId as string,
      page,
      limit,
    });

    // Filter out videos
    const communityItems = result.items.filter(item => item.type !== 'VIDEO');
    
    sendSuccess(res, communityItems, 200, buildPaginationMeta(communityItems.length, page, limit));
  } catch (err) { next(err); }
}

export async function getPublicCommunityPostBySlugHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    const post = await svc.getPostBySlug(req.params.slug, true, userId);
    if (post.type === 'VIDEO') {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }
    sendSuccess(res, post);
  } catch (err) { next(err); }
}

export async function getPublicVideoCategoriesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await svc.listPublicVideoCategories();
    sendSuccess(res, categories);
  } catch (err) { next(err); }
}

// ─── Authenticated User Interactions ─────────────────────────────

export async function likePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const result = await svc.toggleLikePost(req.params.id, userId, true);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function unlikePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const result = await svc.toggleLikePost(req.params.id, userId, false);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function addCommentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const comment = await svc.addComment(req.params.id, userId, req.body.body);
    sendCreated(res, comment);
  } catch (err) { next(err); }
}

export async function editCommentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    // Check if user is the comment author
    const comment = await svc.editComment(req.params.commentId, userId, req.body.body);
    sendSuccess(res, comment);
  } catch (err) { next(err); }
}

export async function deleteCommentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const isAdmin = req.user!.roles.includes('admin') || req.user!.roles.includes('super_admin');
    await svc.deleteComment(req.params.commentId, userId, isAdmin);
    sendNoContent(res);
  } catch (err) { next(err); }
}

export async function reportContentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const report = await svc.reportContent(userId, {
      postId: req.body.postId,
      commentId: req.body.commentId,
      reason: req.body.reason,
    });
    sendCreated(res, report);
  } catch (err) { next(err); }
}

// ─── Video Upload ────────────────────────────────────────────────

export async function uploadVideoFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new (require('../../utils/AppError').AppError)(400, 'NO_FILE', 'No video file uploaded');
    const userId = req.user!.sub;
    const { uploadVideoFile } = await import('../../modules/media/media-video.service');
    const { auditContextFromRequest } = await import('../../utils/audit');
    const result = await uploadVideoFile(req.file, userId, auditContextFromRequest(req));
    sendCreated(res, result);
  } catch (err) { next(err); }
}

// ─── Admin Content CRUD ──────────────────────────────────────────

export async function listAdminPostsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await svc.listPosts({
      type: req.query.type as any,
      categoryId: req.query.categoryId as string,
      status: req.query.status as string,
      q: req.query.q as string,
      showOnHomepage: req.query.showOnHomepage === 'true' ? true : req.query.showOnHomepage === 'false' ? false : undefined,
      isFeatured: req.query.isFeatured === 'true' ? true : req.query.isFeatured === 'false' ? false : undefined,
      isPinned: req.query.isPinned === 'true' ? true : req.query.isPinned === 'false' ? false : undefined,
      page,
      limit,
    });
    sendSuccess(res, result.items, 200, buildPaginationMeta(result.meta.total, page, limit));
  } catch (err) { next(err); }
}

export async function createPostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const post = await svc.createPost(req.body, userId);
    sendCreated(res, post);
  } catch (err) { next(err); }
}

export async function updatePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const post = await svc.updatePost(req.params.id, req.body);
    sendSuccess(res, post);
  } catch (err) { next(err); }
}

export async function getPostByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const post = await svc.getPostById(req.params.id);
    sendSuccess(res, post);
  } catch (err) { next(err); }
}

export async function deletePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deletePost(req.params.id);
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Admin Category CRUD ─────────────────────────────────────────

export async function listCategoriesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cats = await svc.listCategories();
    sendSuccess(res, cats);
  } catch (err) { next(err); }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cat = await svc.createCategory(req.body);
    sendCreated(res, cat);
  } catch (err) { next(err); }
}

export async function updateCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cat = await svc.updateCategory(req.params.id, req.body);
    sendSuccess(res, cat);
  } catch (err) { next(err); }
}

export async function deleteCategoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteCategory(req.params.id);
    sendNoContent(res);
  } catch (err) { next(err); }
}

// ─── Comment Moderation ──────────────────────────────────────────

export async function listAdminCommentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await svc.listComments({
      postId: req.query.postId as string,
      userId: req.query.userId as string,
      status: req.query.status as string,
      reported: req.query.reported === 'true',
      page,
      limit,
    });
    sendSuccess(res, result.items, 200, buildPaginationMeta(result.meta.total, page, limit));
  } catch (err) { next(err); }
}

export async function moderateCommentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await svc.moderateComment(req.params.commentId, req.body.status);
    sendSuccess(res, comment);
  } catch (err) { next(err); }
}

// ─── Report Management ───────────────────────────────────────────

export async function listAdminReportsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await svc.listReports({
      status: req.query.status as string,
      page,
      limit,
    });
    sendSuccess(res, result.items, 200, buildPaginationMeta(result.meta.total, page, limit));
  } catch (err) { next(err); }
}

export async function resolveReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await svc.updateReportStatus(req.params.id, req.body.status);
    sendSuccess(res, report);
  } catch (err) { next(err); }
}
