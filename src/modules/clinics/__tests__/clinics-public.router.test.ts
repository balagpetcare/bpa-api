jest.mock('../clinics-public.controller', () => ({
  listPublicClinicsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: [] })),
  getPublicClinicBySlugHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
  getPublicClinicFiltersHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: {} })),
}));

import request from 'supertest';
import express from 'express';
import clinicsPublicRouter from '../clinics-public.router';
import * as controller from '../clinics-public.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/public/clinics', clinicsPublicRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('clinics public router — read access', () => {
  it('serves the list endpoint with no authentication required', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics');

    expect(res.status).toBe(200);
    expect(controller.listPublicClinicsHandler).toHaveBeenCalledTimes(1);
  });

  it('serves /filters before the :slug route can shadow it', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics/filters');

    expect(res.status).toBe(200);
    expect(controller.getPublicClinicFiltersHandler).toHaveBeenCalledTimes(1);
    expect(controller.getPublicClinicBySlugHandler).not.toHaveBeenCalled();
  });

  it('serves the detail endpoint for a valid slug', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics/mewmew-pet-care-banasree');

    expect(res.status).toBe(200);
    expect(controller.getPublicClinicBySlugHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed slug before reaching the handler', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics/Not%20A%20Slug');

    expect(res.status).toBe(400);
    expect(controller.getPublicClinicBySlugHandler).not.toHaveBeenCalled();
  });

  it('rejects an invalid query filter combination (radiusKm without coordinates)', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics?radiusKm=10');

    expect(res.status).toBe(400);
    expect(controller.listPublicClinicsHandler).not.toHaveBeenCalled();
  });

  it('rejects a limit above the public cap', async () => {
    const res = await request(buildApp()).get('/api/v1/public/clinics?limit=1000');

    expect(res.status).toBe(400);
  });
});

describe('clinics public router — write protection', () => {
  it('has no POST route (unauthorized write attempts 404, never mutate)', async () => {
    const res = await request(buildApp()).post('/api/v1/public/clinics').send({ branchName: 'Injected' });

    expect(res.status).toBe(404);
  });

  it('has no PATCH route', async () => {
    const res = await request(buildApp()).patch('/api/v1/public/clinics/some-slug').send({ published: true });

    expect(res.status).toBe(404);
  });

  it('has no DELETE route', async () => {
    const res = await request(buildApp()).delete('/api/v1/public/clinics/some-slug');

    expect(res.status).toBe(404);
  });

  it('has no PUT route', async () => {
    const res = await request(buildApp()).put('/api/v1/public/clinics/some-slug').send({});

    expect(res.status).toBe(404);
  });
});
