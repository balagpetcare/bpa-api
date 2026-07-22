import { Router } from 'express';
import { requireCentralAuthUser } from '../../middlewares/requireCentralAuthUser';
import { validate } from '../../middlewares/validate';
import {
  dashboardHandler,
  getProfileHandler,
  updateProfileHandler,
  listMyDonationsHandler,
  listMyVaccinationCardsHandler,
  listMyPetCensusEntriesHandler,
  listMyEventPassesHandler,
  listMyElectionsHandler,
  listMyPetsHandler,
  createMyPetHandler,
  getMyPetHandler,
  updateMyPetHandler,
  deleteMyPetHandler,
  listMyPetVaccinationsHandler,
  getMyPetVaccinationHandler,
  createMyPetVaccinationHandler,
  updateMyPetVaccinationHandler,
  deleteMyPetVaccinationHandler,
  getMyPetMedicalHistoryHandler,
  listMyPetMedicalHistoryRecordsHandler,
  getMyPetMedicalHistoryRecordHandler,
  createMyPetMedicalHistoryRecordHandler,
  updateMyPetMedicalHistoryRecordHandler,
  deleteMyPetMedicalHistoryRecordHandler,
  listMyPetDewormingRecordsHandler,
  getMyPetDewormingRecordHandler,
  createMyPetDewormingRecordHandler,
  updateMyPetDewormingRecordHandler,
  deleteMyPetDewormingRecordHandler,
  listMyPetWeightRecordsHandler,
  getMyPetWeightRecordHandler,
  createMyPetWeightRecordHandler,
  updateMyPetWeightRecordHandler,
  deleteMyPetWeightRecordHandler,
  listMyPetDocumentsHandler,
  getMyPetDocumentHandler,
  uploadMyPetDocumentHandler,
  updateMyPetDocumentHandler,
  deleteMyPetDocumentHandler,
  uploadMyPetProfileImageHandler,
  removeMyPetProfileImageHandler,
} from './me.controller';
import { localProfileUpdateSchema } from './me.profile.types';
import {
  createDewormingRecordSchema,
  createMedicalHistoryRecordSchema,
  createMyPetSchema,
  createPetDocumentMetadataSchema,
  createPetVaccinationSchema,
  createWeightRecordSchema,
  dewormingParamsSchema,
  documentParamsSchema,
  medicalHistoryParamsSchema,
  petIdParamsSchema,
  updateDewormingRecordSchema,
  updateMedicalHistoryRecordSchema,
  updateMyPetSchema,
  updatePetDocumentMetadataSchema,
  updatePetVaccinationSchema,
  updateWeightRecordSchema,
  vaccinationParamsSchema,
  weightParamsSchema,
} from './me.pets.types';
import { uploadPetAsset } from './me.pet-upload.middleware';

const router = Router();

router.use(requireCentralAuthUser);

// GET /api/v1/me/dashboard
router.get('/dashboard', dashboardHandler);
// GET /api/v1/me/donations
router.get('/donations', listMyDonationsHandler);
// GET /api/v1/me/vaccination-cards
router.get('/vaccination-cards', listMyVaccinationCardsHandler);
// GET /api/v1/me/pet-census
router.get('/pet-census', listMyPetCensusEntriesHandler);
// GET /api/v1/me/event-passes
router.get('/event-passes', listMyEventPassesHandler);
// GET /api/v1/me/elections
router.get('/elections', listMyElectionsHandler);
// GET /api/v1/me/pets
router.get('/pets', listMyPetsHandler);
// POST /api/v1/me/pets
router.post('/pets', validate(createMyPetSchema, 'body'), createMyPetHandler);
router.get('/pets/:petId', validate(petIdParamsSchema, 'params'), getMyPetHandler);
router.patch('/pets/:petId', validate(petIdParamsSchema, 'params'), validate(updateMyPetSchema, 'body'), updateMyPetHandler);
router.delete('/pets/:petId', validate(petIdParamsSchema, 'params'), deleteMyPetHandler);

router.get('/pets/:petId/vaccinations', validate(petIdParamsSchema, 'params'), listMyPetVaccinationsHandler);
router.get('/pets/:petId/vaccinations/:vaccinationId', validate(vaccinationParamsSchema, 'params'), getMyPetVaccinationHandler);
router.post('/pets/:petId/vaccinations', validate(petIdParamsSchema, 'params'), validate(createPetVaccinationSchema, 'body'), createMyPetVaccinationHandler);
router.patch('/pets/:petId/vaccinations/:vaccinationId', validate(vaccinationParamsSchema, 'params'), validate(updatePetVaccinationSchema, 'body'), updateMyPetVaccinationHandler);
router.delete('/pets/:petId/vaccinations/:vaccinationId', validate(vaccinationParamsSchema, 'params'), deleteMyPetVaccinationHandler);

router.get('/pets/:petId/medical-history', validate(petIdParamsSchema, 'params'), getMyPetMedicalHistoryHandler);
router.get('/pets/:petId/medical-history/records', validate(petIdParamsSchema, 'params'), listMyPetMedicalHistoryRecordsHandler);
router.get('/pets/:petId/medical-history/records/:recordId', validate(medicalHistoryParamsSchema, 'params'), getMyPetMedicalHistoryRecordHandler);
router.post('/pets/:petId/medical-history/records', validate(petIdParamsSchema, 'params'), validate(createMedicalHistoryRecordSchema, 'body'), createMyPetMedicalHistoryRecordHandler);
router.patch('/pets/:petId/medical-history/records/:recordId', validate(medicalHistoryParamsSchema, 'params'), validate(updateMedicalHistoryRecordSchema, 'body'), updateMyPetMedicalHistoryRecordHandler);
router.delete('/pets/:petId/medical-history/records/:recordId', validate(medicalHistoryParamsSchema, 'params'), deleteMyPetMedicalHistoryRecordHandler);

router.get('/pets/:petId/deworming', validate(petIdParamsSchema, 'params'), listMyPetDewormingRecordsHandler);
router.get('/pets/:petId/deworming/:recordId', validate(dewormingParamsSchema, 'params'), getMyPetDewormingRecordHandler);
router.post('/pets/:petId/deworming', validate(petIdParamsSchema, 'params'), validate(createDewormingRecordSchema, 'body'), createMyPetDewormingRecordHandler);
router.patch('/pets/:petId/deworming/:recordId', validate(dewormingParamsSchema, 'params'), validate(updateDewormingRecordSchema, 'body'), updateMyPetDewormingRecordHandler);
router.delete('/pets/:petId/deworming/:recordId', validate(dewormingParamsSchema, 'params'), deleteMyPetDewormingRecordHandler);

router.get('/pets/:petId/weights', validate(petIdParamsSchema, 'params'), listMyPetWeightRecordsHandler);
router.get('/pets/:petId/weights/:recordId', validate(weightParamsSchema, 'params'), getMyPetWeightRecordHandler);
router.post('/pets/:petId/weights', validate(petIdParamsSchema, 'params'), validate(createWeightRecordSchema, 'body'), createMyPetWeightRecordHandler);
router.patch('/pets/:petId/weights/:recordId', validate(weightParamsSchema, 'params'), validate(updateWeightRecordSchema, 'body'), updateMyPetWeightRecordHandler);
router.delete('/pets/:petId/weights/:recordId', validate(weightParamsSchema, 'params'), deleteMyPetWeightRecordHandler);

router.get('/pets/:petId/documents', validate(petIdParamsSchema, 'params'), listMyPetDocumentsHandler);
router.get('/pets/:petId/documents/:documentId', validate(documentParamsSchema, 'params'), getMyPetDocumentHandler);
router.post('/pets/:petId/documents', validate(petIdParamsSchema, 'params'), uploadPetAsset, validate(createPetDocumentMetadataSchema, 'body'), uploadMyPetDocumentHandler);
router.patch('/pets/:petId/documents/:documentId', validate(documentParamsSchema, 'params'), validate(updatePetDocumentMetadataSchema, 'body'), updateMyPetDocumentHandler);
router.delete('/pets/:petId/documents/:documentId', validate(documentParamsSchema, 'params'), deleteMyPetDocumentHandler);

router.post('/pets/:petId/profile-image', validate(petIdParamsSchema, 'params'), uploadPetAsset, uploadMyPetProfileImageHandler);
router.delete('/pets/:petId/profile-image', validate(petIdParamsSchema, 'params'), removeMyPetProfileImageHandler);

router.get('/profile', getProfileHandler);
router.patch('/profile', validate(localProfileUpdateSchema, 'body'), updateProfileHandler);

export default router;
