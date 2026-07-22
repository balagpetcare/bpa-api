import express, { RequestHandler } from 'express';
import request from 'supertest';
import { AppError } from '../../utils/AppError';
import { errorHandler } from '../errorHandler';
import { notFound } from '../notFound';
import { requestIdMiddleware } from '../requestId';

describe('request context and throttling', () => {
  it('preserves an incoming request id and returns it from 404 responses', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(notFound);

    const response = await request(app)
      .get('/missing')
      .set('X-Request-Id', 'bpa-req-404');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('bpa-req-404');
    expect(response.body.requestId).toBe('bpa-req-404');
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('generates a request id when absent and returns it from handled errors', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/boom', (_req, _res, next) => {
      next(AppError.badRequest('Invalid pet payload', 'INVALID_PET'));
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.error.code).toBe('INVALID_PET');
  });

  it('rate limits /me/pets traffic with a BPA-safe request id aware response', async () => {
    const originalWindow = process.env.ME_PETS_RATE_LIMIT_WINDOW_MS;
    const originalMax = process.env.ME_PETS_RATE_LIMIT_MAX;

    process.env.ME_PETS_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.ME_PETS_RATE_LIMIT_MAX = '1';

    try {
      let mePetsLimiter: RequestHandler | undefined;

      jest.isolateModules(() => {
        ({ mePetsLimiter } = require('../rateLimiter'));
      });

      const app = express();
      app.use(requestIdMiddleware);
      app.get('/api/v1/me/pets', mePetsLimiter!, (_req, res) => {
        res.json({ success: true });
      });

      const first = await request(app)
        .get('/api/v1/me/pets')
        .set('X-Request-Id', 'bpa-req-1');
      const second = await request(app)
        .get('/api/v1/me/pets')
        .set('X-Request-Id', 'bpa-req-2');

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.headers['x-request-id']).toBe('bpa-req-2');
      expect(second.body.requestId).toBe('bpa-req-2');
      expect(second.body.error.code).toBe('RATE_LIMITED');
    } finally {
      if (originalWindow === undefined) {
        delete process.env.ME_PETS_RATE_LIMIT_WINDOW_MS;
      } else {
        process.env.ME_PETS_RATE_LIMIT_WINDOW_MS = originalWindow;
      }

      if (originalMax === undefined) {
        delete process.env.ME_PETS_RATE_LIMIT_MAX;
      } else {
        process.env.ME_PETS_RATE_LIMIT_MAX = originalMax;
      }
    }
  });
});
