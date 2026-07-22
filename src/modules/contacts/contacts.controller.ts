import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate } from '../../utils/audit';
import * as svc from './contacts.service';
import type { CreateContactDto, UpdateContactStatusDto, ContactListQuery } from './contacts.types';

export async function submitContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateContactDto;
    const contact = await svc.submitContact(dto);
    const ctx = auditContextFromRequest(req);
    await auditCreate('contact_submission', contact.id, { email: dto.email, subject: dto.subject }, ctx);
    sendCreated(res, contact);
  } catch (err) {
    next(err);
  }
}

export async function listContactsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listContacts(req.query as never as ContactListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await svc.getContact(req.params.id);
    sendSuccess(res, contact);
  } catch (err) {
    next(err);
  }
}

export async function updateContactStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as UpdateContactStatusDto;
    const contact = await svc.updateContactStatus(req.params.id, status, req.user?.sub);
    sendSuccess(res, contact);
  } catch (err) {
    next(err);
  }
}
