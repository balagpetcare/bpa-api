import { ContactStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateContactDto, ContactListQuery, ContactResponse } from './contacts.types';

function format(c: {
  id: string; name: string; email: string; phone: string | null;
  subject: string | null; message: string; status: ContactStatus;
  repliedAt: Date | null; createdAt: Date;
}): ContactResponse {
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    subject: c.subject, message: c.message, status: c.status,
    repliedAt: c.repliedAt, createdAt: c.createdAt,
  };
}

export async function createContact(dto: CreateContactDto): Promise<ContactResponse> {
  const c = await prisma.contactSubmission.create({ data: dto });
  return format(c);
}

export async function listContacts(query: ContactListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.ContactSubmissionWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    const s = query.search;
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { subject: { contains: s, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.contactSubmission.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.contactSubmission.count({ where }),
  ]);
  return { items: items.map(format), meta: buildPaginationMeta(total, page, limit) };
}

export async function getContactById(id: string): Promise<ContactResponse | null> {
  const c = await prisma.contactSubmission.findUnique({ where: { id } });
  return c ? format(c) : null;
}

export async function updateContactStatus(id: string, status: ContactStatus, repliedById?: string): Promise<ContactResponse | null> {
  const c = await prisma.contactSubmission.update({
    where: { id },
    data: {
      status,
      repliedById: status === ContactStatus.replied ? repliedById ?? null : undefined,
      repliedAt: status === ContactStatus.replied ? new Date() : undefined,
    },
  });
  return format(c);
}
