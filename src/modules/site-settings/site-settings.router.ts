import { Router } from 'express';
import { ACTIONS, RESOURCES } from '../../config/constants';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { updateSiteSettingsSchema } from './site-settings.types';
import {
  getPublicSettingsHandler,
  getAdminSettingsHandler,
  updateSettingsHandler,
} from './site-settings.controller';

export const siteSettingsPublicRouter = Router();
siteSettingsPublicRouter.get('/', publicReadLimiter, getPublicSettingsHandler);

export const siteSettingsAdminRouter = Router();
siteSettingsAdminRouter.use(authenticate);
siteSettingsAdminRouter.get('/', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.READ), getAdminSettingsHandler);
siteSettingsAdminRouter.put('/', authorize(RESOURCES.SITE_SETTINGS, ACTIONS.UPDATE), validate(updateSiteSettingsSchema), updateSettingsHandler);
