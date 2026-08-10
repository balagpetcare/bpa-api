jest.mock('../homepage-public.controller', () => ({
  getPublicHomepageHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
}));

import request from 'supertest';
import express from 'express';
import { homepagePublicContractRouter } from '../homepage-public.router';
import * as controller from '../homepage-public.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/public/homepage', homepagePublicContractRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('public homepage router — read access', () => {
  it('serves the homepage contract with no authentication required', async () => {
    const res = await request(buildApp()).get('/api/v1/public/homepage');

    expect(res.status).toBe(200);
    expect(controller.getPublicHomepageHandler).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit locale query param', async () => {
    const res = await request(buildApp()).get('/api/v1/public/homepage?locale=bn');

    expect(res.status).toBe(200);
    expect(controller.getPublicHomepageHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid locale', async () => {
    const res = await request(buildApp()).get('/api/v1/public/homepage?locale=x');

    expect(res.status).toBe(400);
    expect(controller.getPublicHomepageHandler).not.toHaveBeenCalled();
  });
});

describe('public homepage router — write protection', () => {
  it('has no POST route (unauthorized write attempts 404, never mutate)', async () => {
    const res = await request(buildApp()).post('/api/v1/public/homepage').send({ title: 'Injected' });

    expect(res.status).toBe(404);
  });
});
