import { SmsStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { SmsLogListQuery, SmsLogResponse, SmsAttemptResponse } from './sms-logs.types';

function formatAttempt(a: {
  id: string; attemptNumber: number; status: SmsStatus; provider: string;
  providerMessageId: string | null; errorCode: string | null; errorMessage: string | null;
  attemptedBy: string | null; attemptedAt: Date;
}): SmsAttemptResponse {
  return {
    id: a.id, attemptNumber: a.attemptNumber, status: a.status, provider: a.provider,
    providerMessageId: a.providerMessageId, errorCode: a.errorCode,
    errorMessage: a.errorMessage, attemptedBy: a.attemptedBy, attemptedAt: a.attemptedAt,
  };
}

function format(
  r: {
    id: string; to: string; recipientMasked: string | null; body: string;
    messageType: string | null; module: string | null; entityType: string | null;
    entityId: string | null; reference: string | null; status: SmsStatus; provider: string;
    providerRef: string | null; failureReason: string | null; failureDetail: string | null;
    payload: Prisma.JsonValue; attemptCount: number; maxAttempts: number;
    lastAttemptAt: Date | null; sentAt: Date | null; failedAt: Date | null;
    lastError: string | null; isOtp: boolean; idempotencyKey: string | null;
    resentById: string | null; createdAt: Date; updatedAt: Date;
    attempts?: Array<{
      id: string; attemptNumber: number; status: SmsStatus; provider: string;
      providerMessageId: string | null; errorCode: string | null; errorMessage: string | null;
      attemptedBy: string | null; attemptedAt: Date;
    }>;
  },
  maskBody = false,
): SmsLogResponse {
  return {
    id: r.id, to: r.to, recipientMasked: r.recipientMasked,
    body: maskBody ? null : r.body,
    messageType: r.messageType, module: r.module,
    entityType: r.entityType, entityId: r.entityId, reference: r.reference,
    status: r.status, provider: r.provider, providerRef: r.providerRef,
    failureReason: r.failureReason, failureDetail: r.failureDetail,
    payload: r.payload as Record<string, unknown> | null,
    attemptCount: r.attemptCount, maxAttempts: r.maxAttempts,
    lastAttemptAt: r.lastAttemptAt, sentAt: r.sentAt, failedAt: r.failedAt,
    lastError: r.lastError, isOtp: r.isOtp, idempotencyKey: r.idempotencyKey,
    resentById: r.resentById, createdAt: r.createdAt, updatedAt: r.updatedAt,
    attempts: r.attempts?.map(formatAttempt),
  };
}

export async function listSmsLogs(query: SmsLogListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.SmsLogWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.provider) where.provider = { equals: query.provider, mode: 'insensitive' };
  if (query.module) where.module = { equals: query.module, mode: 'insensitive' };
  if (query.messageType) where.messageType = { equals: query.messageType, mode: 'insensitive' };
  if (query.failureReason) where.failureReason = { equals: query.failureReason };
  if (query.reference) where.reference = { contains: query.reference, mode: 'insensitive' };
  if (query.recipient) {
    where.OR = [
      { to: { contains: query.recipient } },
      { recipientMasked: { contains: query.recipient } },
    ];
  }
  if (typeof query.isOtp === 'boolean') where.isOtp = query.isOtp;
  if (query.search) {
    const s = query.search;
    where.OR = [
      { to: { contains: s, mode: 'insensitive' } },
      { reference: { contains: s, mode: 'insensitive' } },
      { providerRef: { contains: s, mode: 'insensitive' } },
      { idempotencyKey: { contains: s, mode: 'insensitive' } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.smsLog.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.smsLog.count({ where }),
  ]);

  return {
    items: items.map((r) => format(r, r.isOtp)),
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function getSmsLogById(id: string): Promise<SmsLogResponse | null> {
  const r = await prisma.smsLog.findUnique({
    where: { id },
    include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
  });
  return r ? format(r, r.isOtp) : null;
}
