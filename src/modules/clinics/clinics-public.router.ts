import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { publicClinicListQuerySchema, publicClinicSlugParamsSchema } from './clinics-public.types';
import {
  listPublicClinicsHandler,
  getPublicClinicBySlugHandler,
  getPublicClinicFiltersHandler,
} from './clinics-public.controller';

const router = Router();

// Public, read-only directory — no authenticate/authorize middleware at
// all (matches the existing campaigns-public.router.ts convention): there
// is nothing here a caller needs to be signed in for, and nothing here
// accepts a write.
router.get('/filters', publicReadLimiter, getPublicClinicFiltersHandler);
router.get('/:slug', publicReadLimiter, validate(publicClinicSlugParamsSchema, 'params'), getPublicClinicBySlugHandler);
router.get('/', publicReadLimiter, validate(publicClinicListQuerySchema, 'query'), listPublicClinicsHandler);

export default router;
