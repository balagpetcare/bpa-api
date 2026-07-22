import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authenticateOptional } from '../../middlewares/authenticateOptional';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { uploadSingle } from '../../middlewares/upload';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  submitCensusSchema, updateCensusSchema, censusListQuerySchema, publicStatusLookupSchema,
  createCampaignSchema, updateCampaignSchema,
} from './pet-census.types';
import {
  listSubmissionsHandler, getSubmissionHandler,
  updateSubmissionHandler, deleteSubmissionHandler,
  submitCensusHandler, exportSubmissionsHandler, analyticsSummaryHandler, submissionStatusLookupHandler, uploadPetCensusPhotoHandler,
  listCampaignsHandler, getCampaignHandler, createCampaignHandler, updateCampaignHandler, getPublicCampaignSettingsHandler,
} from './pet-census.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), validate(censusListQuerySchema, 'query'), listSubmissionsHandler);
adminRouter.get('/analytics', authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), analyticsSummaryHandler);
adminRouter.get('/export', authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), validate(censusListQuerySchema, 'query'), exportSubmissionsHandler);

// Campaign Management
adminRouter.get('/campaigns', authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), listCampaignsHandler);
adminRouter.post('/campaigns', authorize(RESOURCES.PET_CENSUS, ACTIONS.CREATE), validate(createCampaignSchema), createCampaignHandler);
adminRouter.get('/campaigns/:id', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), getCampaignHandler);
adminRouter.patch('/campaigns/:id', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.UPDATE), validate(updateCampaignSchema), updateCampaignHandler);

adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.READ), getSubmissionHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.UPDATE), validate(updateCensusSchema), updateSubmissionHandler);
adminRouter.patch('/:id/status', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.UPDATE), validate(updateCensusSchema), updateSubmissionHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.PET_CENSUS, ACTIONS.DELETE), deleteSubmissionHandler);

const publicRouter = Router();
publicRouter.get('/settings', getPublicCampaignSettingsHandler);
publicRouter.get('/campaign', getPublicCampaignSettingsHandler);
publicRouter.post('/', authenticateOptional, publicFormLimiter, validate(submitCensusSchema), submitCensusHandler);
publicRouter.post('/submit', authenticateOptional, publicFormLimiter, validate(submitCensusSchema), submitCensusHandler);
publicRouter.get('/status', validate(publicStatusLookupSchema, 'query'), submissionStatusLookupHandler);
publicRouter.post('/upload-photo', authenticateOptional, publicFormLimiter, uploadSingle, uploadPetCensusPhotoHandler);

export { adminRouter as petCensusAdminRouter, publicRouter as petCensusPublicRouter };
