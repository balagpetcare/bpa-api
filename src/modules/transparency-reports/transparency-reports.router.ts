import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { createTransparencyReportSchema, updateTransparencyReportSchema, reportListQuerySchema } from './transparency-reports.types';
import {
  createReportHandler, listReportsHandler, getReportHandler,
  updateReportHandler, deleteReportHandler, publishReportHandler,
  unpublishReportHandler, listPublishedReportsHandler, getReportBySlugHandler,
  publicSummaryHandler,
} from './transparency-reports.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.READ), validate(reportListQuerySchema, 'query'), listReportsHandler);
adminRouter.post('/', authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.CREATE), validate(createTransparencyReportSchema), createReportHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.READ), getReportHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.UPDATE), validate(updateTransparencyReportSchema), updateReportHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.DELETE), deleteReportHandler);
adminRouter.patch('/:id/publish', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.PUBLISH), publishReportHandler);
adminRouter.post('/:id/publish', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.PUBLISH), publishReportHandler);
adminRouter.patch('/:id/unpublish', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.PUBLISH), unpublishReportHandler);
adminRouter.post('/:id/unpublish', validateUuid('id'), authorize(RESOURCES.TRANSPARENCY_REPORTS, ACTIONS.PUBLISH), unpublishReportHandler);

const publicRouter = Router();
publicRouter.get('/summary', publicReadLimiter, publicSummaryHandler);
publicRouter.get('/', publicReadLimiter, listPublishedReportsHandler);
publicRouter.get('/:slug', publicReadLimiter, getReportBySlugHandler);

export { adminRouter as transparencyReportsAdminRouter, publicRouter as transparencyReportsPublicRouter };
