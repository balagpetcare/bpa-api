import { Router } from 'express';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import { publicHomepageQuerySchema } from './homepage-public.types';
import { getPublicHomepageHandler } from './homepage-public.controller';

// No authentication middleware on this router — the public homepage
// contract must be reachable unauthenticated. Read-only: no write routes
// are registered here.
export const homepagePublicContractRouter = Router();

homepagePublicContractRouter.get(
  '/',
  publicReadLimiter,
  validate(publicHomepageQuerySchema, 'query'),
  getPublicHomepageHandler,
);
