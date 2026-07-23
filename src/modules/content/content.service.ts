import * as repo from './content.repository';
import { AppError } from '../../utils/AppError';
import sanitizeHtml from 'sanitize-html';
import type { ContentPostType } from '@prisma/client';
import { normalizeVideoSourceFields } from './video-source';
import { prisma } from '../../database/prisma';
import { publishOutboxEvent, enqueueIfNew } from '../push-notifications/outbox';

// ─── Video source type normalization ─────────────────────────────


// Sanitize settings for rich text
const richTextSanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'span', 'div', 'p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'u', 's', 'blockquote', 'a'
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    'a': ['href', 'name', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'loading'],
    'span': ['style'],
    'p': ['style'],
    'div': ['style']
  }
};

// Sanitize settings for plain comments (only simple tags allowed)
const commentSanitizeOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  allowedAttributes: {
    'a': ['href', 'target', 'rel']
  }
};

function sanitizeContent(text?: string | null, isComment = false): string | null {
  if (!text) return text ?? null;
  return sanitizeHtml(text, isComment ? commentSanitizeOptions : richTextSanitizeOptions);
}

// ─── Posts ───────────────────────────────────────────────────────

export async function createPost(dto: any, userId: string) {
  // Slug unique check
  const existing = await repo.findPostBySlug(dto.slug, false);
  if (existing) {
    throw AppError.conflict('Slug is already in use');
  }

  const normalizedVideoSource =
    dto.type === 'VIDEO'
      ? normalizeVideoSourceFields({
          videoSourceType: dto.videoSourceType,
          videoUrl: dto.videoUrl,
          videoProvider: dto.videoProvider,
        })
      : {
          videoSourceType: dto.videoSourceType,
          videoUrl: dto.videoUrl,
          videoProvider: dto.videoProvider,
        };

  const data = {
    ...dto,
    videoSourceType: normalizedVideoSource.videoSourceType,
    videoUrl: normalizedVideoSource.videoUrl,
    videoProvider: normalizedVideoSource.videoProvider,
    bodyEn: sanitizeContent(dto.bodyEn),
    bodyBn: sanitizeContent(dto.bodyBn),
    summaryEn: sanitizeContent(dto.summaryEn, true),
    summaryBn: sanitizeContent(dto.summaryBn, true),
    createdById: userId,
  };

  return repo.createPost(data);
}

export async function updatePost(id: string, dto: any) {
  const post = await repo.findPostById(id);
  if (!post) throw AppError.notFound('Post');
  const isNewlyPublished = dto.status === 'published' && post.status !== 'published';

  if (dto.slug && dto.slug !== post.slug) {
    const existing = await repo.findPostBySlug(dto.slug, false);
    if (existing) {
      throw AppError.conflict('Slug is already in use');
    }
  }

  const effectiveType = dto.type ?? post.type;
  const normalizedVideoSource =
    effectiveType === 'VIDEO'
      ? normalizeVideoSourceFields({
          videoSourceType: dto.videoSourceType !== undefined ? dto.videoSourceType : post.videoSourceType,
          videoUrl: dto.videoUrl !== undefined ? dto.videoUrl : post.videoUrl,
          videoProvider: dto.videoProvider !== undefined ? dto.videoProvider : post.videoProvider,
        })
      : null;

  const data = {
    ...dto,
    ...(normalizedVideoSource
      ? {
          videoSourceType: normalizedVideoSource.videoSourceType,
          videoUrl: normalizedVideoSource.videoUrl,
          videoProvider: normalizedVideoSource.videoProvider,
        }
      : {}),
    bodyEn: dto.bodyEn !== undefined ? sanitizeContent(dto.bodyEn) : undefined,
    bodyBn: dto.bodyBn !== undefined ? sanitizeContent(dto.bodyBn) : undefined,
    summaryEn: dto.summaryEn !== undefined ? sanitizeContent(dto.summaryEn, true) : undefined,
    summaryBn: dto.summaryBn !== undefined ? sanitizeContent(dto.summaryBn, true) : undefined,
    ...(isNewlyPublished ? { publishedAt: new Date() } : {}),
  };

  if (!isNewlyPublished) {
    return repo.updatePost(id, data);
  }

  // Only a genuine draft -> published transition emits a notification —
  // subsequent edits to an already-published post never refire it, since
  // the dedupeKey is per-post and post.status will already be 'published'.
  const [updated, outboxResult] = await prisma.$transaction(async (tx) => {
    const updatedPost = await repo.updatePost(id, data, tx);
    const isVideo = updatedPost.type === 'VIDEO';
    const result = await publishOutboxEvent(
      {
        eventType: isVideo ? 'VIDEO_PUBLISHED' : 'POST_PUBLISHED',
        entityType: isVideo ? 'video' : 'post',
        entityId: id,
        dedupeKey: `${isVideo ? 'video' : 'post'}_published:${id}`,
        payload: {
          category: isVideo ? 'video' : 'post',
          priority: 'normal',
          title: updatedPost.titleEn,
          titleBn: updatedPost.titleBn,
          body: updatedPost.summaryEn || 'New content is now available.',
          bodyBn: updatedPost.summaryBn || 'নতুন কনটেন্ট এখন উপলব্ধ।',
          imageUrl: updatedPost.thumbnailUrl || updatedPost.coverImageUrl || undefined,
          deepLink: isVideo ? `bpa://videos/${updatedPost.slug}` : `bpa://posts/${updatedPost.slug}`,
          targetAll: true,
        },
      },
      tx,
    );
    return [updatedPost, result] as const;
  });

  await enqueueIfNew(outboxResult);
  return updated;
}

export async function deletePost(id: string) {
  const post = await repo.findPostById(id);
  if (!post) throw AppError.notFound('Post');
  await repo.deletePost(id);
  return { success: true };
}

export async function getPostById(id: string) {
  const post = await repo.findPostById(id);
  if (!post) throw AppError.notFound('Post');
  return post;
}

export async function getPostBySlug(slug: string, publicOnly = true, userId?: string) {
  const post = await repo.findPostBySlug(slug, publicOnly);
  if (!post) throw AppError.notFound('Post');
  if (publicOnly && post.publishedAt && post.publishedAt > new Date()) {
    throw AppError.notFound('Post');
  }

  // Increment views asynchronously
  repo.incrementPostViews(post.id).catch(() => null);

  const liked = userId ? await repo.checkUserLiked(post.id, userId) : false;

  return {
    ...post,
    liked,
  };
}

export async function listPosts(filters: any) {
  return repo.listPosts(filters);
}

export async function getHomepageContent() {
  // Pinned/Featured sorted public content
  // Return recent videos and recent community posts separately
  const videosPromise = repo.listPosts({
    type: 'VIDEO' as ContentPostType,
    status: 'published',
    showOnHomepage: true,
    limit: 10,
  });

  const postsPromise = repo.listPosts({
    status: 'published',
    showOnHomepage: true,
    limit: 10,
  });

  const [videosResult, postsResult] = await Promise.all([videosPromise, postsPromise]);

  // For posts, filter out VIDEO so we show only community update types
  const communityPosts = postsResult.items.filter(item => item.type !== 'VIDEO');

  return {
    featuredVideos: videosResult.items,
    communityPosts: communityPosts,
  };
}

// ─── Categories ──────────────────────────────────────────────────

export async function createCategory(dto: any) {
  const existing = await repo.findCategoryBySlug(dto.slug);
  if (existing) throw AppError.conflict('Category slug is already in use');
  return repo.createCategory(dto);
}

export async function updateCategory(id: string, dto: any) {
  const cat = await repo.findCategoryById(id);
  if (!cat) throw AppError.notFound('Category');

  if (dto.slug && dto.slug !== cat.slug) {
    const existing = await repo.findCategoryBySlug(dto.slug);
    if (existing) throw AppError.conflict('Category slug is already in use');
  }

  return repo.updateCategory(id, dto);
}

export async function deleteCategory(id: string) {
  const cat = await repo.findCategoryById(id);
  if (!cat) throw AppError.notFound('Category');
  await repo.deleteCategory(id);
  return { success: true };
}

export async function getCategoryById(id: string) {
  const cat = await repo.findCategoryById(id);
  if (!cat) throw AppError.notFound('Category');
  return cat;
}

export async function listCategories() {
  return repo.listCategories();
}

// ─── Comments ────────────────────────────────────────────────────

export async function addComment(postId: string, userId: string, body: string) {
  const post = await repo.findPostById(postId);
  if (!post) throw AppError.notFound('Post');
  if (!post.allowComments || post.status !== 'published') {
    throw AppError.badRequest('Comments are disabled for this post');
  }

  const sanitized = sanitizeContent(body, true);
  if (!sanitized) throw AppError.badRequest('Comment body cannot be empty');

  return repo.createComment({
    postId,
    userId,
    body: sanitized,
    status: 'approved', // Auto-approved, but editable/moderatable
  });
}

export async function editComment(commentId: string, userId: string, body: string, isOp = false) {
  const comment = await repo.findCommentById(commentId);
  if (!comment) throw AppError.notFound('Comment');
  
  if (comment.userId !== userId && !isOp) {
    throw AppError.forbidden('You are not authorized to edit this comment');
  }

  const sanitized = sanitizeContent(body, true);
  if (!sanitized) throw AppError.badRequest('Comment body cannot be empty');

  return repo.updateComment(commentId, sanitized);
}

export async function deleteComment(commentId: string, userId: string, isAdmin = false) {
  const comment = await repo.findCommentById(commentId);
  if (!comment) throw AppError.notFound('Comment');

  if (comment.userId !== userId && !isAdmin) {
    throw AppError.forbidden('You are not authorized to delete this comment');
  }

  await repo.deleteComment(commentId);
  return { success: true };
}

export async function listComments(filters: any) {
  return repo.listComments(filters);
}

export async function moderateComment(commentId: string, status: string) {
  const comment = await repo.findCommentById(commentId);
  if (!comment) throw AppError.notFound('Comment');
  return repo.updateCommentStatus(commentId, status);
}

// ─── Reactions ───────────────────────────────────────────────────

export async function toggleLikePost(postId: string, userId: string, like: boolean) {
  const post = await repo.findPostById(postId);
  if (!post) throw AppError.notFound('Post');

  if (like) {
    await repo.upsertReaction(postId, userId, 'like');
  } else {
    await repo.removeReaction(postId, userId);
  }

  const updatedPost = await repo.findPostById(postId);
  return {
    postId,
    likeCount: updatedPost?.likeCount ?? 0,
    liked: like
  };
}

// ─── Reports ─────────────────────────────────────────────────────

export async function reportContent(reportedById: string, dto: { postId?: string; commentId?: string; reason: string }) {
  if (!dto.postId && !dto.commentId) {
    throw AppError.badRequest('Either postId or commentId must be reported');
  }

  if (dto.postId) {
    const post = await repo.findPostById(dto.postId);
    if (!post) throw AppError.notFound('Post');
  }

  if (dto.commentId) {
    const comment = await repo.findCommentById(dto.commentId);
    if (!comment) throw AppError.notFound('Comment');
  }

  return repo.createReport({
    postId: dto.postId,
    commentId: dto.commentId,
    reportedById,
    reason: dto.reason,
  });
}

export async function listReports(filters: any) {
  return repo.listReports(filters);
}

export async function updateReportStatus(id: string, status: string) {
  return repo.updateReportStatus(id, status);
}

// ─── Public APIs (published content only) ──────────────────────────

function toPublicVideoDTO(post: any) {
  return {
    id: post.id,
    slug: post.slug,
    titleEn: post.titleEn,
    titleBn: post.titleBn,
    summaryEn: post.summaryEn,
    summaryBn: post.summaryBn,
    bodyEn: post.bodyEn,
    bodyBn: post.bodyBn,
    coverImageUrl: post.coverImageUrl,
    thumbnailUrl: post.thumbnailUrl,
    videoPosterUrl: post.videoPosterUrl,
    videoSourceType: post.videoSourceType,
    videoProvider: post.videoProvider,
    videoUrl: post.videoUrl,
    videoFileUrl: post.videoFileUrl,
    durationSeconds: post.durationSeconds,
    category: post.category ? {
      id: post.category.id,
      nameEn: post.category.nameEn,
      nameBn: post.category.nameBn,
      slug: post.category.slug,
    } : null,
    tags: post.tags || [],
    isFeatured: post.isFeatured,
    isPinned: post.isPinned,
    showOnHomepage: post.showOnHomepage,
    homepagePriority: post.homepagePriority,
    allowComments: post.allowComments,
    ctaLabelEn: post.ctaLabelEn,
    ctaLabelBn: post.ctaLabelBn,
    ctaUrl: post.ctaUrl,
    ctaType: post.ctaType,
    publishedAt: post.publishedAt,
    viewCount: post.viewCount,
  };
}

export async function listPublicVideos(filters: {
  categoryId?: string;
  categorySlug?: string;
  tag?: string;
  q?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
}) {
  const now = new Date();
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);

  // Use existing listPosts method with published/time constraints
  const result = await repo.listPosts({
    type: 'VIDEO' as ContentPostType,
    categoryId: filters.categoryId,
    status: 'published',
    isFeatured: filters.featured,
    q: filters.q,
    page,
    limit,
  });

  // Post-filter by categorySlug and tag since repository doesn't support them directly
  let items = result.items;
  if (filters.categorySlug) {
    items = items.filter((post) => post.category?.slug === filters.categorySlug);
  }
  if (filters.tag) {
    items = items.filter((post) => post.tags?.includes(filters.tag!));
  }

  // Filter by publish time constraint
  items = items.filter((post) => {
    if (post.type !== 'VIDEO' || post.status !== 'published') return false;
    if (post.publishedAt === null) return true;
    return post.publishedAt <= now;
  });

  return {
    items: items.map(toPublicVideoDTO),
    meta: {
      page,
      limit,
      total: result.meta.total,
      totalPages: result.meta.totalPages,
    },
  };
}

/**
 * Get public video categories with active published video counts
 */
export async function listPublicVideoCategories() {
  const now = new Date();
  const categories = await repo.listCategories();

  // Fetch counts for each category
  const categoriesWithCounts = await Promise.all(
    categories.map(async (cat) => {
      const count = await repo.countPosts({
        type: 'VIDEO',
        status: 'published',
        categoryId: cat.id,
        publishedAtLte: now,
      });

      return {
        id: cat.id,
        nameEn: cat.nameEn,
        nameBn: cat.nameBn,
        slug: cat.slug,
        description: cat.description,
        publishedVideoCount: count,
      };
    })
  );

  // Filter out categories with no published videos
  return categoriesWithCounts.filter((cat) => cat.publishedVideoCount > 0);
}
