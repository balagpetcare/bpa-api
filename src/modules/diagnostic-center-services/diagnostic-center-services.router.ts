import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createDiagnosticCenterServiceSchema,
  updateDiagnosticCenterServiceSchema,
  diagnosticCenterServiceListQuerySchema,
} from './diagnostic-center-services.types';
import {
  createDiagnosticServiceHandler,
  listDiagnosticServicesHandler,
  getDiagnosticServiceHandler,
  updateDiagnosticServiceHandler,
  deleteDiagnosticServiceHandler,
  listActiveDiagnosticServicesPublicHandler,
} from './diagnostic-center-services.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.DIAGNOSTIC_CENTER_SERVICES, ACTIONS.READ), validate(diagnosticCenterServiceListQuerySchema, 'query'), listDiagnosticServicesHandler);
adminRouter.post('/', authorize(RESOURCES.DIAGNOSTIC_CENTER_SERVICES, ACTIONS.CREATE), validate(createDiagnosticCenterServiceSchema), createDiagnosticServiceHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.DIAGNOSTIC_CENTER_SERVICES, ACTIONS.READ), getDiagnosticServiceHandler);
adminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.DIAGNOSTIC_CENTER_SERVICES, ACTIONS.UPDATE), validate(updateDiagnosticCenterServiceSchema), updateDiagnosticServiceHandler);
adminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.DIAGNOSTIC_CENTER_SERVICES, ACTIONS.DELETE), deleteDiagnosticServiceHandler);

const publicRouter = Router();
publicRouter.get('/', publicReadLimiter, listActiveDiagnosticServicesPublicHandler);

export { adminRouter as diagnosticCenterServicesAdminRouter, publicRouter as diagnosticCenterServicesPublicRouter };
