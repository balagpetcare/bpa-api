import { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { EmailLogListQuery, EmailLogResponse } from './email-logs.types';

function format(r: {
  id: string; to: string; subject: string; body: string | null; status: EmailStatus;
  provider: string; providerRef: string | null; failureReason: string | null;
  payload: Prisma.JsonValue; sentAt: Date | null; createdAt: Date; updatedAt: Date;
}): EmailLogResponse {
  return {
    id: r.id, to: r.to, subject: r.subject, body: r.body, status: r.status,
    provider: r.provider, providerRef: r.providerRef, failureReason: r.failureReason,
    payload: r.payload as Record<string, unknown> | null,
    sentAt: r.sentAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export async function listEmailLogs(query: EmailLogListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.EmailLogWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.provider) where.provider = { equals: query.provider, mode: 'insensitive' };
  if (query.search) {
    const s = query.search;
    where.OR = [
      { to: { contains: s, mode: 'insensitive' } },
      { subject: { contains: s, mode: 'insensitive' } },
      { providerRef: { contains: s, mode: 'insensitive' } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }
  const [items, total] = await Promise.all([
    prisma.emailLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.emailLog.count({ where }),
  ]);
  return { items: items.map(format), meta: buildPaginationMeta(total, page, limit) };
}

export async function getEmailLogById(id: string): Promise<EmailLogResponse | null> {
  const r = await prisma.emailLog.findUnique({ where: { id } });
  return r ? format(r) : null;
}
