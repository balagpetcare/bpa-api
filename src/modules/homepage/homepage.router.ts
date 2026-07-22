import { Router } from 'express';
import { ACTIONS, RESOURCES } from '../../config/constants';
import { authenticate } from '../../middlewares/authenticate';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import {
  footerWriteSchema,
  heroSlideListQuerySchema,
  heroSlideWriteSchema,
  homepageQuerySchema,
  partnerListQuerySchema,
  partnerWriteSchema,
  reorderSectionsSchema,
  sectionItemWriteSchema,
  sectionListQuerySchema,
  sectionWriteSchema,
  updateHeroSlideSchema,
  updateHomepageSchema,
  updatePartnerSchema,
  updateSectionSchema,
} from './homepage.types';
import {
  createHeroSlideHandler,
  createPartnerHandler,
  createSectionHandler,
  createSectionItemHandler,
  deleteHeroSlideHandler,
  deletePartnerHandler,
  deleteSectionHandler,
  deleteSectionItemHandler,
  getAdminHomepageHandler,
  getFooterHandler,
  getPublicHomepageHandler,
  getUserAppHomeFeedHandler,
  listHeroSlidesHandler,
  listPartnersHandler,
  listSectionsHandler,
  publishHomepageHandler,
  reorderSectionsHandler,
  updateAdminHomepageHandler,
  updateHeroSlideHandler,
  updatePartnerHandler,
  updateSectionHandler,
  updateSectionItemHandler,
  upsertFooterHandler,
} from './homepage.controller';

export const homepagePublicRouter = Router();
homepagePublicRouter.get('/public', publicReadLimiter, validate(homepageQuerySchema, 'query'), getPublicHomepageHandler);
homepagePublicRouter.get('/user-app/home-feed', publicReadLimiter, authenticateOptional, validate(homepageQuerySchema, 'query'), getUserAppHomeFeedHandler);

export const homepageAdminRouter = Router();
homepageAdminRouter.use(authenticate);

homepageAdminRouter.get('/', authorize(RESOURCES.HOMEPAGE, ACTIONS.READ), validate(homepageQuerySchema, 'query'), getAdminHomepageHandler);
homepageAdminRouter.put('/', authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), validate(updateHomepageSchema), updateAdminHomepageHandler);
homepageAdminRouter.post('/publish', authorize(RESOURCES.HOMEPAGE, ACTIONS.PUBLISH), validate(homepageQuerySchema, 'query'), publishHomepageHandler);

homepageAdminRouter.get('/sections', authorize(RESOURCES.HOMEPAGE, ACTIONS.READ), validate(sectionListQuerySchema, 'query'), listSectionsHandler);
homepageAdminRouter.post('/sections', authorize(RESOURCES.HOMEPAGE, ACTIONS.CREATE), validate(sectionWriteSchema), createSectionHandler);
homepageAdminRouter.patch('/sections/reorder', authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), validate(reorderSectionsSchema), reorderSectionsHandler);
homepageAdminRouter.patch('/sections/:id', validateUuid('id'), authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), validate(updateSectionSchema), updateSectionHandler);
homepageAdminRouter.delete('/sections/:id', validateUuid('id'), authorize(RESOURCES.HOMEPAGE, ACTIONS.DELETE), deleteSectionHandler);
homepageAdminRouter.post('/sections/:id/items', validateUuid('id'), authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), validate(sectionItemWriteSchema), createSectionItemHandler);
homepageAdminRouter.patch('/sections/items/:itemId', validateUuid('itemId'), authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), validate(sectionItemWriteSchema), updateSectionItemHandler);
homepageAdminRouter.delete('/sections/items/:itemId', validateUuid('itemId'), authorize(RESOURCES.HOMEPAGE, ACTIONS.UPDATE), deleteSectionItemHandler);

homepageAdminRouter.get('/hero-slides', authorize(RESOURCES.HERO_SLIDES, ACTIONS.READ), validate(heroSlideListQuerySchema, 'query'), listHeroSlidesHandler);
homepageAdminRouter.post('/hero-slides', authorize(RESOURCES.HERO_SLIDES, ACTIONS.CREATE), validate(heroSlideWriteSchema), createHeroSlideHandler);
homepageAdminRouter.patch('/hero-slides/:id', validateUuid('id'), authorize(RESOURCES.HERO_SLIDES, ACTIONS.UPDATE), validate(updateHeroSlideSchema), updateHeroSlideHandler);
homepageAdminRouter.delete('/hero-slides/:id', validateUuid('id'), authorize(RESOURCES.HERO_SLIDES, ACTIONS.DELETE), deleteHeroSlideHandler);

homepageAdminRouter.get('/partners', authorize(RESOURCES.PARTNERS, ACTIONS.READ), validate(partnerListQuerySchema, 'query'), listPartnersHandler);
homepageAdminRouter.post('/partners', authorize(RESOURCES.PARTNERS, ACTIONS.CREATE), validate(partnerWriteSchema), createPartnerHandler);
homepageAdminRouter.patch('/partners/:id', validateUuid('id'), authorize(RESOURCES.PARTNERS, ACTIONS.UPDATE), validate(updatePartnerSchema), updatePartnerHandler);
homepageAdminRouter.delete('/partners/:id', validateUuid('id'), authorize(RESOURCES.PARTNERS, ACTIONS.DELETE), deletePartnerHandler);

homepageAdminRouter.get('/footer', authorize(RESOURCES.FOOTER, ACTIONS.READ), validate(homepageQuerySchema, 'query'), getFooterHandler);
homepageAdminRouter.put('/footer', authorize(RESOURCES.FOOTER, ACTIONS.UPDATE), validate(footerWriteSchema), upsertFooterHandler);
