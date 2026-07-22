import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createCampaignSchema, updateCampaignSchema, campaignListQuerySchema,
  createSessionSchema, updateSessionSchema,
  createServiceSchema, updateServiceSchema,
  campaignServicesQuerySchema,
  assignDoctorSchema, updateDoctorAssignmentSchema, bulkAssignDoctorSchema, assignVolunteerSchema, availableDoctorsQuerySchema,
  createCoverageSchema,
} from './campaigns.types';
import {
  createCampaignHandler, listCampaignsHandler, getCampaignHandler,
  updateCampaignHandler, deleteCampaignHandler,
  publishCampaignHandler, openRegistrationHandler, closeRegistrationHandler,
  completeCampaignHandler, cancelCampaignHandler, reopenCampaignHandler,
  createSessionHandler, listSessionsHandler, updateSessionHandler, deleteSessionHandler,
  createServiceHandler, listServicesHandler, updateServiceHandler, deleteServiceHandler,
  assignDoctorHandler, bulkAssignDoctorsHandler, listCampaignDoctorsHandler, removeDoctorHandler,
  updateDoctorAssignmentHandler, removeDoctorAssignmentHandler, getAvailableDoctorsHandler,
  assignVolunteerHandler, listCampaignVolunteersHandler, removeVolunteerHandler,
  listCoveragesHandler, addCoverageHandler, removeCoverageHandler,
} from './campaigns.controller';
import {
  listHandler as videoListHandler,
  createHandler as videoCreateHandler,
  updateHandler as videoUpdateHandler,
  deleteHandler as videoDeleteHandler,
} from './campaign-videos.controller';
import {
  listHandler as mediaListHandler,
  uploadHandler as mediaUploadHandler,
  attachHandler as mediaAttachHandler,
  updateHandler as mediaUpdateHandler,
  deleteHandler as mediaDeleteHandler,
  reorderHandler as mediaReorderHandler,
} from './campaign-media.controller';
import { uploadSingle } from '../../middlewares/upload';
import staffAssignmentsRouter from '../campaign-staff-assignments/campaign-staff-assignments.router';

const router = Router();

router.use(authenticate);

// ─── Campaign CRUD ───────────────────────────────────────────────

router.get('/', authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), validate(campaignListQuerySchema, 'query'), listCampaignsHandler);
router.post('/', authorize(RESOURCES.CAMPAIGNS, ACTIONS.CREATE), validate(createCampaignSchema), createCampaignHandler);
router.get('/:id', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), getCampaignHandler);
router.patch('/:id', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), validate(updateCampaignSchema), updateCampaignHandler);
router.delete('/:id', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.DELETE), deleteCampaignHandler);

// ─── Lifecycle ───────────────────────────────────────────────────

router.patch('/:id/publish', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), publishCampaignHandler);
router.patch('/:id/open-registration', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), openRegistrationHandler);
router.patch('/:id/close-registration', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), closeRegistrationHandler);
router.patch('/:id/complete', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), completeCampaignHandler);
router.patch('/:id/cancel', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), cancelCampaignHandler);
router.patch('/:id/reopen', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.LIFECYCLE), reopenCampaignHandler);

// ─── Sessions ────────────────────────────────────────────────────

router.get('/:id/sessions', validateUuid('id'), authorize(RESOURCES.CAMPAIGN_SESSIONS, ACTIONS.READ), listSessionsHandler);
router.post('/:id/sessions', validateUuid('id'), authorize(RESOURCES.CAMPAIGN_SESSIONS, ACTIONS.CREATE), validate(createSessionSchema), createSessionHandler);
router.patch('/:id/sessions/:sessionId', validateUuid('id', 'sessionId'), authorize(RESOURCES.CAMPAIGN_SESSIONS, ACTIONS.UPDATE), validate(updateSessionSchema), updateSessionHandler);
router.delete('/:id/sessions/:sessionId', validateUuid('id', 'sessionId'), authorize(RESOURCES.CAMPAIGN_SESSIONS, ACTIONS.DELETE), deleteSessionHandler);

// ─── Services ────────────────────────────────────────────────────

router.get('/:id/services', validateUuid('id'), authorize(RESOURCES.CAMPAIGN_SERVICES, ACTIONS.READ), validate(campaignServicesQuerySchema, 'query'), listServicesHandler);
router.post('/:id/services', validateUuid('id'), authorize(RESOURCES.CAMPAIGN_SERVICES, ACTIONS.CREATE), validate(createServiceSchema), createServiceHandler);
router.patch('/:id/services/:serviceId', validateUuid('id', 'serviceId'), authorize(RESOURCES.CAMPAIGN_SERVICES, ACTIONS.UPDATE), validate(updateServiceSchema), updateServiceHandler);
router.delete('/:id/services/:serviceId', validateUuid('id', 'serviceId'), authorize(RESOURCES.CAMPAIGN_SERVICES, ACTIONS.DELETE), deleteServiceHandler);

// ─── Doctor Assignment ────────────────────────────────────────────

router.get('/:id/doctors', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), listCampaignDoctorsHandler);
router.post('/:id/doctors', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), validate(assignDoctorSchema), assignDoctorHandler);
router.post('/:id/doctors/bulk', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), validate(bulkAssignDoctorSchema), bulkAssignDoctorsHandler);
router.patch('/:id/doctors/:assignmentId', validateUuid('id', 'assignmentId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), validate(updateDoctorAssignmentSchema), updateDoctorAssignmentHandler);
router.delete('/:id/doctors/:assignmentId', validateUuid('id', 'assignmentId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), removeDoctorAssignmentHandler);
router.get('/:id/available-doctors', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), validate(availableDoctorsQuerySchema, 'query'), getAvailableDoctorsHandler);
router.delete('/:id/doctors-legacy/:doctorId', validateUuid('id', 'doctorId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), removeDoctorHandler);

// ─── Volunteer Assignment ─────────────────────────────────────────

router.get('/:id/coverages', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), listCoveragesHandler);
router.post('/:id/coverages', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), validate(createCoverageSchema), addCoverageHandler);
router.delete('/:id/coverages/:coverageId', validateUuid('id', 'coverageId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), removeCoverageHandler);

router.get('/:id/volunteers', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), listCampaignVolunteersHandler);
router.post('/:id/volunteers', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), validate(assignVolunteerSchema), assignVolunteerHandler);
router.delete('/:id/volunteers/:userId', validateUuid('id', 'userId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.ASSIGN), removeVolunteerHandler);

// ─── Staff Assignments ────────────────────────────────────────────

router.use('/:campaignId/staff-assignments', staffAssignmentsRouter);

// ─── Campaign Media ───────────────────────────────────────────────

router.get('/:id/media', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), mediaListHandler);
router.post('/:id/media/upload', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), uploadSingle, mediaUploadHandler);
router.post('/:id/media/attach', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), mediaAttachHandler);
router.patch('/:id/media/reorder', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), mediaReorderHandler);
router.patch('/:id/media/:mediaId', validateUuid('id', 'mediaId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), mediaUpdateHandler);
router.delete('/:id/media/:mediaId', validateUuid('id', 'mediaId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), mediaDeleteHandler);

// Campaign Videos
router.get('/:id/videos', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.READ), videoListHandler);
router.post('/:id/videos', validateUuid('id'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), videoCreateHandler);
router.patch('/:id/videos/:videoId', validateUuid('id', 'videoId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), videoUpdateHandler);
router.delete('/:id/videos/:videoId', validateUuid('id', 'videoId'), authorize(RESOURCES.CAMPAIGNS, ACTIONS.UPDATE), videoDeleteHandler);

export default router;
