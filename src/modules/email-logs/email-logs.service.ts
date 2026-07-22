import { AppError } from '../../utils/AppError';
import * as repo from './email-logs.repository';
import type { EmailLogListQuery } from './email-logs.types';

export async function listEmailLogs(query: EmailLogListQuery) {
  return repo.listEmailLogs(query);
}

export async function getEmailLog(id: string) {
  const r = await repo.getEmailLogById(id);
  if (!r) throw AppError.notFound('Email log not found');
  return r;
}
