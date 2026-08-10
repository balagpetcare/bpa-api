jest.mock('../public-documents.controller', () => ({
  listPublicDocumentsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
}));

import request from 'supertest';
import express from 'express';
import { publicDocumentsRouter } from '../public-documents.router';
import * as controller from '../public-documents.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/public/documents', publicDocumentsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('public documents router — read access', () => {
  it('serves the catalog with no authentication required', async () => {
    const res = await request(buildApp()).get('/api/v1/public/documents');

    expect(res.status).toBe(200);
    expect(controller.listPublicDocumentsHandler).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid category filter', async () => {
    const res = await request(buildApp()).get('/api/v1/public/documents?category=GOVERNANCE');

    expect(res.status).toBe(200);
    expect(controller.listPublicDocumentsHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid category', async () => {
    const res = await request(buildApp()).get('/api/v1/public/documents?category=NOT_REAL');

    expect(res.status).toBe(400);
    expect(controller.listPublicDocumentsHandler).not.toHaveBeenCalled();
  });

  it('rejects a limit above the public cap', async () => {
    const res = await request(buildApp()).get('/api/v1/public/documents?limit=500');

    expect(res.status).toBe(400);
    expect(controller.listPublicDocumentsHandler).not.toHaveBeenCalled();
  });
});

describe('public documents router — write protection', () => {
  it('has no POST route (unauthorized write attempts 404, never mutate)', async () => {
    const res = await request(buildApp()).post('/api/v1/public/documents').send({ titleEn: 'Injected' });

    expect(res.status).toBe(404);
  });
});
