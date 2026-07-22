import { Router } from 'express';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import {
  getBootstrapHandler,
  getCareVideosHandler,
  getHomeHandler,
  getMaintenanceHandler,
  getNavigationHandler,
  getPageHandler,
  getPartnerClinicsHandler,
  getTutorialsGuidesHandler,
  getVersionHandler,
} from './app.controller';
import {
  appPageParamsSchema,
  careVideosQuerySchema,
  partnerClinicsQuerySchema,
  tutorialsGuidesQuerySchema,
} from './app.types';

const router = Router();
router.use(authenticateOptional);

router.get('/bootstrap', publicReadLimiter, getBootstrapHandler);
router.get('/home', publicReadLimiter, getHomeHandler);
router.get('/navigation', publicReadLimiter, getNavigationHandler);
router.get('/pages/:key', publicReadLimiter, validate(appPageParamsSchema, 'params'), getPageHandler);
router.get('/version', publicReadLimiter, getVersionHandler);
router.get('/maintenance', publicReadLimiter, getMaintenanceHandler);
router.get('/home/care-videos', publicReadLimiter, validate(careVideosQuerySchema, 'query'), getCareVideosHandler);
router.get('/home/tutorials-guides', publicReadLimiter, validate(tutorialsGuidesQuerySchema, 'query'), getTutorialsGuidesHandler);
router.get('/home/partner-clinics', publicReadLimiter, validate(partnerClinicsQuerySchema, 'query'), getPartnerClinicsHandler);

export default router;
