const authorizeCalls: Array<{ resource: string; action: string }> = [];

jest.mock('../content.controller', () => ({
  getHomepageContentHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  getPublicVideosHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  getPublicVideoBySlugHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  getPublicCommunityPostsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  getPublicCommunityPostBySlugHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  getPublicVideoCategoriesHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  uploadVideoFileHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  likePostHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  unlikePostHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  addCommentHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  editCommentHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  deleteCommentHandler: jest.fn((_req, res) => res.status(204).end()),
  reportContentHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  listAdminPostsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  createPostHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  updatePostHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  getPostByIdHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  deletePostHandler: jest.fn((_req, res) => res.status(204).end()),
  listCategoriesHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  createCategoryHandler: jest.fn((_req, res) => res.status(201).json({ success: true })),
  updateCategoryHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  deleteCategoryHandler: jest.fn((_req, res) => res.status(204).end()),
  listAdminCommentsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  moderateCommentHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
  listAdminReportsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  resolveReportHandler: jest.fn((_req, res) => res.status(200).json({ success: true })),
}));

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    if (req.headers['x-test-auth'] === 'none') {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    req.user = { sub: 'user-1', email: 'admin@example.com', roles: ['super_admin'] };
    next();
  },
}));

jest.mock('../../../middlewares/authenticateOptional', () => ({
  authenticateOptional: (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../../middlewares/authorize', () => ({
  authorize: (resource: string, action: string) => (req: any, res: any, next: () => void) => {
    authorizeCalls.push({ resource, action });
    if (req.headers['x-test-authz'] === 'deny') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  },
}));

jest.mock('../../../middlewares/upload', () => ({
  uploadSingle: (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../../middlewares/rateLimiter', () => ({
  commentLimiter: (_req: any, _res: any, next: () => void) => next(),
  reactionLimiter: (_req: any, _res: any, next: () => void) => next(),
}));

import request from 'supertest';
import express from 'express';
import { contentAdminRouter, contentPublicRouter } from '../content.router';
import * as controller from '../content.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/public', contentPublicRouter);
  app.use('/api/v1/admin/content', contentAdminRouter);
  app.use(errorHandler);
  return app;
}

const VALID_VIDEO_POST = {
  type: 'VIDEO',
  titleEn: 'BPA Video Title',
  titleBn: 'বিপিএ ভিডিও',
  slug: 'bpa-video-title',
  status: 'published',
  categoryId: '11111111-1111-4111-8111-111111111111',
  videoSourceType: 'youtube',
  videoUrl: 'dQw4w9WgXcQ',
};

beforeEach(() => {
  authorizeCalls.length = 0;
  jest.clearAllMocks();
});

describe('content admin router', () => {
  it('rejects unauthenticated video creation', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/content/posts')
      .set('x-test-auth', 'none')
      .send(VALID_VIDEO_POST);

    expect(res.status).toBe(401);
    expect(controller.createPostHandler).not.toHaveBeenCalled();
  });

  it('rejects unauthorized video creation', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/content/posts')
      .set('x-test-authz', 'deny')
      .send(VALID_VIDEO_POST);

    expect(res.status).toBe(403);
    expect(authorizeCalls).toContainEqual({ resource: 'content', action: 'create' });
    expect(controller.createPostHandler).not.toHaveBeenCalled();
  });

  it('accepts a valid YouTube ID payload for authorized admins', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/content/posts').send(VALID_VIDEO_POST);

    expect(res.status).toBe(201);
    expect(authorizeCalls).toContainEqual({ resource: 'content', action: 'create' });
    expect(controller.createPostHandler).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid Vimeo URL payload for authorized admins', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/content/posts').send({
      ...VALID_VIDEO_POST,
      slug: 'bpa-vimeo-video',
      videoSourceType: 'vimeo',
      videoUrl: 'https://vimeo.com/148751763',
    });

    expect(res.status).toBe(201);
    expect(controller.createPostHandler).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid uploaded-video payload for authorized admins', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/content/posts').send({
      ...VALID_VIDEO_POST,
      slug: 'bpa-upload-video',
      videoSourceType: 'upload',
      videoUrl: null,
      videoFileKey: 'media/videos/bpa-upload.mp4',
      videoFileUrl: 'https://cdn.example.test/media/videos/bpa-upload.mp4',
    });

    expect(res.status).toBe(201);
    expect(controller.createPostHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid external video identifier', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/content/posts').send({
      ...VALID_VIDEO_POST,
      slug: 'broken-video',
      videoUrl: 'not-a-valid-video-source',
    });

    expect(res.status).toBe(400);
    expect(controller.createPostHandler).not.toHaveBeenCalled();
  });

  it('rejects an uploaded-video payload that has no file reference', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/content/posts').send({
      ...VALID_VIDEO_POST,
      slug: 'broken-upload-video',
      videoSourceType: 'upload',
      videoUrl: null,
      videoFileKey: null,
      videoFileUrl: null,
    });

    expect(res.status).toBe(400);
    expect(controller.createPostHandler).not.toHaveBeenCalled();
  });

  it('authorizes category loading with read permission', async () => {
    const res = await request(buildApp()).get('/api/v1/admin/content/categories');

    expect(res.status).toBe(200);
    expect(authorizeCalls).toContainEqual({ resource: 'content', action: 'read' });
  });
});

describe('content public router', () => {
  it('allows public video-category reads without authentication', async () => {
    const res = await request(buildApp()).get('/api/v1/public/video-categories');

    expect(res.status).toBe(200);
    expect(controller.getPublicVideoCategoriesHandler).toHaveBeenCalledTimes(1);
  });
});
