import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createPublicDocumentSchema,
  updatePublicDocumentSchema,
  publicDocumentAdminListQuerySchema,
} from './public-documents-admin.types';
import {
  createPublicDocumentHandler,
  listPublicDocumentsHandler,
  getPublicDocumentHandler,
  updatePublicDocumentHandler,
  deletePublicDocumentHandler,
} from './public-documents-admin.controller';

export const publicDocumentsAdminRouter = Router();
publicDocumentsAdminRouter.use(authenticate);

publicDocumentsAdminRouter.get('/', authorize(RESOURCES.PUBLIC_DOCUMENTS, ACTIONS.READ), validate(publicDocumentAdminListQuerySchema, 'query'), listPublicDocumentsHandler);
publicDocumentsAdminRouter.post('/', authorize(RESOURCES.PUBLIC_DOCUMENTS, ACTIONS.CREATE), validate(createPublicDocumentSchema), createPublicDocumentHandler);
publicDocumentsAdminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.PUBLIC_DOCUMENTS, ACTIONS.READ), getPublicDocumentHandler);
publicDocumentsAdminRouter.patch('/:id', validateUuid('id'), authorize(RESOURCES.PUBLIC_DOCUMENTS, ACTIONS.UPDATE), validate(updatePublicDocumentSchema), updatePublicDocumentHandler);
publicDocumentsAdminRouter.delete('/:id', validateUuid('id'), authorize(RESOURCES.PUBLIC_DOCUMENTS, ACTIONS.DELETE), deletePublicDocumentHandler);
