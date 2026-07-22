import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createVaccineCatalogSchema, updateVaccineCatalogSchema, vaccineCatalogListQuerySchema,
  createCertificateTemplateSchema, updateCertificateTemplateSchema,
} from './vaccine-catalog.types';
import {
  createVaccineHandler, listVaccinesHandler, getVaccineHandler,
  updateVaccineHandler, deleteVaccineHandler,
  createTemplateHandler, listTemplatesHandler, getTemplateHandler, updateTemplateHandler,
} from './vaccine-catalog.controller';

const router = Router();

router.use(authenticate);

// ─── Vaccine Catalog ─────────────────────────────────────────────

router.get('/', authorize(RESOURCES.VACCINE_CATALOG, ACTIONS.READ), validate(vaccineCatalogListQuerySchema, 'query'), listVaccinesHandler);
router.post('/', authorize(RESOURCES.VACCINE_CATALOG, ACTIONS.CREATE), validate(createVaccineCatalogSchema), createVaccineHandler);

// ─── Certificate Templates (must be before /:id to avoid route conflict) ─────

router.get('/certificate-templates', authorize(RESOURCES.CERTIFICATE_TEMPLATES, ACTIONS.READ), listTemplatesHandler);
router.post('/certificate-templates', authorize(RESOURCES.CERTIFICATE_TEMPLATES, ACTIONS.CREATE), validate(createCertificateTemplateSchema), createTemplateHandler);
router.get('/certificate-templates/:id', authorize(RESOURCES.CERTIFICATE_TEMPLATES, ACTIONS.READ), getTemplateHandler);
router.patch('/certificate-templates/:id', authorize(RESOURCES.CERTIFICATE_TEMPLATES, ACTIONS.UPDATE), validate(updateCertificateTemplateSchema), updateTemplateHandler);

// ─── Vaccine Catalog by ID ────────────────────────────────────────

router.get('/:id', authorize(RESOURCES.VACCINE_CATALOG, ACTIONS.READ), getVaccineHandler);
router.patch('/:id', authorize(RESOURCES.VACCINE_CATALOG, ACTIONS.UPDATE), validate(updateVaccineCatalogSchema), updateVaccineHandler);
router.delete('/:id', authorize(RESOURCES.VACCINE_CATALOG, ACTIONS.DELETE), deleteVaccineHandler);

export default router;
