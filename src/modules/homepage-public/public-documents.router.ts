import { Router } from 'express';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import { publicDocumentsQuerySchema } from './homepage-public.types';
import { listPublicDocumentsHandler } from './public-documents.controller';

// Full public governance/document catalog — the "supporting page" the
// homepage's Governance & Transparency teaser links out to. No auth, no
// write routes. Only ever returns documents `listPublicDocumentsPage`
// considers explicitly published (see homepage-public.repository.ts).
export const publicDocumentsRouter = Router();

publicDocumentsRouter.get(
  '/',
  publicReadLimiter,
  validate(publicDocumentsQuerySchema, 'query'),
  listPublicDocumentsHandler,
);
