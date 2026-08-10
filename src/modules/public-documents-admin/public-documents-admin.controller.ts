import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './public-documents-admin.service';
import type {
  CreatePublicDocumentDto,
  UpdatePublicDocumentDto,
  PublicDocumentAdminListQuery,
} from './public-documents-admin.types';

export async function createPublicDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreatePublicDocumentDto;
    const item = await svc.createPublicDocument(dto);
    auditCreate('public_documents', item.id, { key: dto.key }, auditContextFromRequest(req));
    sendCreated(res, item);
  } catch (err) { next(err); }
}

export async function listPublicDocumentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listPublicDocuments(req.query as never as PublicDocumentAdminListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPublicDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getPublicDocument(req.params.id));
  } catch (err) { next(err); }
}

export async function updatePublicDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdatePublicDocumentDto;
    const updated = await svc.updatePublicDocument(req.params.id, dto);
    auditUpdate('public_documents', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deletePublicDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deletePublicDocument(req.params.id);
    auditDelete('public_documents', req.params.id, {}, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) { next(err); }
}
