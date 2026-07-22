import { ContactStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import * as repo from './contacts.repository';
import type { CreateContactDto, ContactListQuery } from './contacts.types';

export async function submitContact(dto: CreateContactDto) {
  return repo.createContact(dto);
}

export async function listContacts(query: ContactListQuery) {
  return repo.listContacts(query);
}

export async function getContact(id: string) {
  const c = await repo.getContactById(id);
  if (!c) throw AppError.notFound('Contact submission not found');
  return c;
}

export async function updateContactStatus(id: string, status: ContactStatus, actorId?: string) {
  const existing = await repo.getContactById(id);
  if (!existing) throw AppError.notFound('Contact submission not found');
  return repo.updateContactStatus(id, status, actorId);
}
