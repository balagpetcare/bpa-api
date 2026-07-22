import { AppError } from '../../utils/AppError';
import * as repo from './sms-logs.repository';
import { resendSmsLog, retryFailedSms, getSmsStats } from '../../services/sms.service';
import type { SmsLogListQuery, ResendSmsBody, RetryFailedBody } from './sms-logs.types';

export async function listSmsLogs(query: SmsLogListQuery) {
  return repo.listSmsLogs(query);
}

export async function getSmsLog(id: string) {
  const r = await repo.getSmsLogById(id);
  if (!r) throw AppError.notFound('SMS log not found');
  return r;
}

export async function resendSms(id: string, adminUserId: string, body: ResendSmsBody) {
  const log = await repo.getSmsLogById(id);
  if (!log) throw AppError.notFound('SMS log not found');
  return resendSmsLog(id, adminUserId, { force: body.force });
}

export async function retryFailed(body: RetryFailedBody, adminUserId: string) {
  return retryFailedSms(
    {
      module: body.module,
      messageType: body.messageType,
      failureReason: body.failureReason,
      dateFrom: body.dateFrom ? new Date(body.dateFrom) : undefined,
      dateTo: body.dateTo ? new Date(body.dateTo) : undefined,
      limit: body.limit,
      force: body.force,
    },
    adminUserId,
  );
}

export async function getStats() {
  return getSmsStats();
}
