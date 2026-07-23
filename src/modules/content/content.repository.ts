import { prisma } from '../../database/prisma';
import type { ContentPostType, Prisma } from '@prisma/client';

export async function createPost(data: any) {
  return prisma.contentPost.create({
    data,
    include: {
      category: true,
      createdBy: {
        select: { id: true, name: true, avatarUrl: true }
      }
    }
  });
}

export async function updatePost(id: string, data: any, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.contentPost.update({
    where: { id },
    data,
    include: {
      category: true,
      createdBy: {
        select: { id: true, name: true, avatarUrl: true }
      }
    }
  });
}

export async function deletePost(id: string) {
  return prisma.contentPost.delete({
    where: { id }
  });
}

export async function findPostById(id: string) {
  return prisma.contentPost.findUnique({
    where: { id },
    include: {
      category: true,
      createdBy: {
        select: { id: true, name: true, avatarUrl: true }
      }
    }
  });
}

export async function findPostBySlug(slug: string, publicOnly = true) {
  return prisma.contentPost.findFirst({
    where: {
      slug,
      ...(publicOnly ? { status: 'published' } : {})
    },
    include: {
      category: true,
      createdBy: {
        select: { id: true, name: true, avatarUrl: true }
      },
      comments: {
        where: publicOnly ? { status: 'approved' } : {},
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true }
          }
        }
      }
    }
  });
}

export async function listPosts(filters: {
  type?: ContentPostType;
  categoryId?: string;
  status?: string;
  q?: string;
  showOnHomepage?: boolean;
  isFeatured?: boolean;
  isPinned?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.status) where.status = filters.status;
  if (filters.showOnHomepage !== undefined) where.showOnHomepage = filters.showOnHomepage;
  if (filters.isFeatured !== undefined) where.isFeatured = filters.isFeatured;
  if (filters.isPinned !== undefined) where.isPinned = filters.isPinned;

  if (filters.q) {
    where.OR = [
      { titleEn: { contains: filters.q, mode: 'insensitive' } },
      { titleBn: { contains: filters.q, mode: 'insensitive' } },
      { summaryEn: { contains: filters.q, mode: 'insensitive' } },
      { summaryBn: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.contentPost.findMany({
      where,
      include: {
        category: true,
        createdBy: {
          select: { id: true, name: true, avatarUrl: true }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { isFeatured: 'desc' },
        { homepagePriority: 'desc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } as any },
      ],
      skip,
      take: limit,
    }),
    prisma.contentPost.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  };
}

export async function incrementPostViews(id: string) {
  return prisma.contentPost.update({
    where: { id },
    data: { viewCount: { increment: 1 } }
  });
}

// ─── Categories ──────────────────────────────────────────────────

export async function createCategory(data: any) {
  return prisma.contentCategory.create({ data });
}

export async function updateCategory(id: string, data: any) {
  return prisma.contentCategory.update({
    where: { id },
    data
  });
}

export async function deleteCategory(id: string) {
  return prisma.contentCategory.delete({
    where: { id }
  });
}

export async function findCategoryById(id: string) {
  return prisma.contentCategory.findUnique({
    where: { id }
  });
}

export async function findCategoryBySlug(slug: string) {
  return prisma.contentCategory.findUnique({
    where: { slug }
  });
}

export async function listCategories() {
  return prisma.contentCategory.findMany({
    orderBy: { nameEn: 'asc' }
  });
}

export async function countPosts(filters: {
  type?: string;
  categoryId?: string;
  status?: string;
  publishedAtLte?: Date;
}) {
  const where: any = {};
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.status) where.status = filters.status;
  if (filters.publishedAtLte) {
    where.OR = [{ publishedAt: null }, { publishedAt: { lte: filters.publishedAtLte } }];
  }

  return prisma.contentPost.count({ where });
}

export async function findMany(model: string, where: any) {
  if (model === 'contentPost') {
    return prisma.contentPost.findMany({ where });
  }
  throw new Error(`Model ${model} not supported`);
}

// ─── Comments ────────────────────────────────────────────────────

export async function createComment(data: { postId: string; userId: string; body: string; status?: string }) {
  const comment = await prisma.contentComment.create({
    data,
    include: {
      user: {
        select: { id: true, name: true, avatarUrl: true }
      }
    }
  });

  // Increment comment count on post
  await prisma.contentPost.update({
    where: { id: data.postId },
    data: { commentCount: { increment: 1 } }
  });

  return comment;
}

export async function updateComment(id: string, body: string) {
  return prisma.contentComment.update({
    where: { id },
    data: { body },
    include: {
      user: {
        select: { id: true, name: true, avatarUrl: true }
      }
    }
  });
}

export async function deleteComment(id: string) {
  const comment = await prisma.contentComment.delete({
    where: { id }
  });

  // Decrement comment count on post
  await prisma.contentPost.update({
    where: { id: comment.postId },
    data: { commentCount: { decrement: Math.max(0, 1) } }
  }).catch(() => null);

  return comment;
}

export async function updateCommentStatus(id: string, status: string) {
  return prisma.contentComment.update({
    where: { id },
    data: { status }
  });
}

export async function findCommentById(id: string) {
  return prisma.contentComment.findUnique({
    where: { id },
    include: { post: true }
  });
}

export async function listComments(filters: {
  postId?: string;
  userId?: string;
  status?: string;
  reported?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.postId) where.postId = filters.postId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.status) where.status = filters.status;
  if (filters.reported) {
    where.reports = { some: {} };
  }

  const [items, total] = await Promise.all([
    prisma.contentComment.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        post: {
          select: { id: true, titleEn: true, type: true, slug: true }
        },
        reports: {
          include: {
            reportedBy: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contentComment.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  };
}

// ─── Reactions ───────────────────────────────────────────────────

export async function upsertReaction(postId: string, userId: string, type = 'like') {
  const existing = await prisma.contentReaction.findUnique({
    where: { postId_userId: { postId, userId } }
  });

  if (existing) {
    if (existing.type === type) {
      // Already reacted. Do nothing, or remove
      return { status: 'exists', reaction: existing };
    }
    // Update reaction type
    const updated = await prisma.contentReaction.update({
      where: { id: existing.id },
      data: { type }
    });
    return { status: 'updated', reaction: updated };
  }

  // Create reaction
  const reaction = await prisma.contentReaction.create({
    data: { postId, userId, type }
  });

  // Increment like count on post
  await prisma.contentPost.update({
    where: { id: postId },
    data: { likeCount: { increment: 1 } }
  });

  return { status: 'created', reaction };
}

export async function removeReaction(postId: string, userId: string) {
  const existing = await prisma.contentReaction.findUnique({
    where: { postId_userId: { postId, userId } }
  });

  if (!existing) return null;

  await prisma.contentReaction.delete({
    where: { id: existing.id }
  });

  // Decrement like count on post
  await prisma.contentPost.update({
    where: { id: postId },
    data: { likeCount: { decrement: Math.max(0, 1) } }
  }).catch(() => null);

  return existing;
}

export async function checkUserLiked(postId: string, userId: string) {
  const reaction = await prisma.contentReaction.findUnique({
    where: { postId_userId: { postId, userId } }
  });
  return !!reaction;
}

// ─── Reports ─────────────────────────────────────────────────────

export async function createReport(data: { postId?: string; commentId?: string; reportedById: string; reason: string }) {
  return prisma.contentReport.create({
    data,
    include: {
      reportedBy: { select: { id: true, name: true } }
    }
  });
}

export async function updateReportStatus(id: string, status: string) {
  return prisma.contentReport.update({
    where: { id },
    data: { status }
  });
}

export async function listReports(filters: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      include: {
        reportedBy: {
          select: { id: true, name: true, email: true }
        },
        post: {
          select: { id: true, titleEn: true, type: true, slug: true }
        },
        comment: {
          select: { id: true, body: true, userId: true, user: { select: { id: true, name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contentReport.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  };
}
