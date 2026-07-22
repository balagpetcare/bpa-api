import { config } from '../config';
import { prisma } from '../database/prisma';
import { SmsStatus } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────

export interface SmsOptions {
  to: string;
  message: string;
}

export interface CreateSmsLogInput {
  to: string;
  message: string;
  messageType?: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  reference?: string;
  isOtp?: boolean;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface SendTransactionalSmsInput extends CreateSmsLogInput {
  /** When true, skips the idempotency check and always creates a new log */
  force?: boolean;
}

export interface ResendResult {
  smsLogId: string;
  status: SmsStatus;
  skipped: boolean;
  skipReason?: string;
}

export interface RetryFailedFilters {
  module?: string;
  messageType?: string;
  failureReason?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  force?: boolean;
}

export interface RetryFailedResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedOtp: number;
  skippedMaxAttempts: number;
}

// ─── Failure codes ──────────────────────────────────────────────────

export type SmsFailureReason =
  | 'insufficient_balance'
  | 'gateway_timeout'
  | 'invalid_number'
  | 'gateway_error'
  | 'rate_limited'
  | 'otp_not_allowed'
  | 'unknown_error';

// ─── Helpers ────────────────────────────────────────────────────────

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return digits.slice(0, 2) + '*'.repeat(digits.length - 4) + digits.slice(-2);
}

export function normalizeGatewayError(err: unknown): { code: SmsFailureReason; detail: string } {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (
    msg.includes('insufficient balance') ||
    msg.includes('low balance') ||
    msg.includes('balance') ||
    msg.includes('recharge')
  ) {
    return { code: 'insufficient_balance', detail: String(err instanceof Error ? err.message : err) };
  }
  if (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused')
  ) {
    return { code: 'gateway_timeout', detail: String(err instanceof Error ? err.message : err) };
  }
  if (
    msg.includes('invalid phone') ||
    msg.includes('invalid msisdn') ||
    msg.includes('invalid number') ||
    msg.includes('number not found')
  ) {
    return { code: 'invalid_number', detail: String(err instanceof Error ? err.message : err) };
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
    return { code: 'rate_limited', detail: String(err instanceof Error ? err.message : err) };
  }
  if (msg.includes('gateway') || msg.includes('http 5') || msg.includes('service unavailable')) {
    return { code: 'gateway_error', detail: String(err instanceof Error ? err.message : err) };
  }
  return { code: 'unknown_error', detail: String(err instanceof Error ? err.message : err) };
}

function getProvider(): string {
  return config.SMS_API_URL ? 'android-gateway' : 'mock-gateway';
}

// ─── Core: create log record ─────────────────────────────────────────

export async function createSmsLog(input: CreateSmsLogInput): Promise<string> {
  const log = await prisma.smsLog.create({
    data: {
      to: input.to,
      recipientMasked: maskPhone(input.to),
      body: input.message,
      messageType: input.messageType,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      reference: input.reference,
      isOtp: input.isOtp ?? false,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? 3,
      status: SmsStatus.queued,
      provider: getProvider(),
    },
  });
  return log.id;
}

// ─── Core: send one attempt via gateway ─────────────────────────────

export async function sendSmsNow(
  smsLogId: string,
  options: { attemptedBy?: string } = {},
): Promise<{ success: boolean; failureReason?: SmsFailureReason; detail?: string }> {
  const log = await prisma.smsLog.findUnique({ where: { id: smsLogId } });
  if (!log) return { success: false, failureReason: 'unknown_error', detail: 'SMS log not found' };

  const attemptNumber = log.attemptCount + 1;
  const provider = getProvider();

  await prisma.smsLog.update({
    where: { id: smsLogId },
    data: { status: SmsStatus.sending, lastAttemptAt: new Date(), attemptCount: { increment: 1 } },
  });

  let success = false;
  let providerMessageId: string | undefined;
  let gatewayResponseSummary: string | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let failureReason: SmsFailureReason | undefined;

  if (config.SMS_API_URL && config.SMS_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(config.SMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.SMS_API_KEY}`,
        },
        body: JSON.stringify({ to: log.to, message: log.body }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = await response.text().catch(() => '');
      let responseJson: Record<string, unknown> | null = null;
      try { responseJson = JSON.parse(responseText); } catch { /* not JSON */ }

      gatewayResponseSummary = responseText.slice(0, 500);

      if (!response.ok) {
        throw new Error(`Gateway returned HTTP ${response.status}: ${responseText.slice(0, 200)}`);
      }

      providerMessageId = responseJson
        ? String(responseJson['messageId'] ?? responseJson['id'] ?? responseJson['msg_id'] ?? '')
        : undefined;

      success = true;
    } catch (err: unknown) {
      const normalized = normalizeGatewayError(err);
      failureReason = normalized.code;
      errorCode = normalized.code;
      errorMessage = normalized.detail;
      console.error('[SmsService] Gateway call failed:', err);
    }
  } else {
    console.warn('[SmsService] SMS_API_URL/KEY not configured — mock send');
    success = true;
  }

  const now = new Date();

  await prisma.smsAttempt.create({
    data: {
      smsLogId,
      attemptNumber,
      status: success ? SmsStatus.sent : SmsStatus.failed,
      provider,
      providerMessageId: providerMessageId || null,
      gatewayResponseSummary: gatewayResponseSummary || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      attemptedBy: options.attemptedBy || null,
      attemptedAt: now,
    },
  });

  if (success) {
    await prisma.smsLog.update({
      where: { id: smsLogId },
      data: {
        status: SmsStatus.sent,
        sentAt: now,
        providerRef: providerMessageId || log.providerRef,
        failureReason: null,
        failureDetail: null,
        lastError: null,
        failedAt: null,
      },
    });
  } else {
    await prisma.smsLog.update({
      where: { id: smsLogId },
      data: {
        status: SmsStatus.failed,
        failureReason: failureReason || 'unknown_error',
        failureDetail: errorMessage || null,
        lastError: errorMessage || null,
        failedAt: now,
      },
    });
  }

  return { success, failureReason, detail: errorMessage };
}

// ─── Transactional SMS with idempotency ──────────────────────────────

export async function sendTransactionalSms(input: SendTransactionalSmsInput): Promise<string | null> {
  // Idempotency check
  if (!input.force && input.idempotencyKey) {
    const existing = await prisma.smsLog.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && ['sent', 'queued', 'sending'].includes(existing.status)) {
      console.log(`[SmsService] Idempotency skip: key=${input.idempotencyKey} status=${existing.status}`);
      return existing.id;
    }
  }

  const smsLogId = await createSmsLog(input);
  const result = await sendSmsNow(smsLogId);

  if (!result.success) {
    console.error(`[SmsService] transactional SMS failed: ${result.failureReason} — ${result.detail}`);
  }

  return smsLogId;
}

// ─── OTP SMS (not resendable by admin) ──────────────────────────────

export async function sendOtp(phone: string, otp: string): Promise<void> {
  const smsLogId = await createSmsLog({
    to: phone,
    message: `Your BPA verification code is: ${otp}. Valid for 10 minutes.`,
    messageType: 'otp',
    module: 'auth',
    isOtp: true,
    maxAttempts: 1,
  });
  await sendSmsNow(smsLogId);
}

// ─── Check if an SMS can be resent ──────────────────────────────────

export function canResendSms(log: {
  isOtp: boolean;
  status: SmsStatus;
  attemptCount: number;
  maxAttempts: number;
}, opts: { force?: boolean } = {}): { allowed: boolean; reason?: string } {
  if (log.isOtp) return { allowed: false, reason: 'otp_not_allowed' };
  if (log.status === 'sent' && !opts.force) return { allowed: false, reason: 'already_sent' };
  if (log.attemptCount >= log.maxAttempts && !opts.force) {
    return { allowed: false, reason: 'max_attempts_exceeded' };
  }
  return { allowed: true };
}

// ─── Admin: resend a specific SMS ───────────────────────────────────

export async function resendSmsLog(
  smsLogId: string,
  adminUserId: string,
  opts: { force?: boolean } = {},
): Promise<ResendResult> {
  const log = await prisma.smsLog.findUnique({ where: { id: smsLogId } });
  if (!log) return { smsLogId, status: SmsStatus.failed, skipped: true, skipReason: 'not_found' };

  const check = canResendSms(log, opts);
  if (!check.allowed) {
    return { smsLogId, status: log.status, skipped: true, skipReason: check.reason };
  }

  await prisma.smsLog.update({
    where: { id: smsLogId },
    data: { resentById: adminUserId },
  });

  const result = await sendSmsNow(smsLogId, { attemptedBy: adminUserId });
  const updated = await prisma.smsLog.findUnique({ where: { id: smsLogId } });

  return {
    smsLogId,
    status: updated?.status ?? (result.success ? SmsStatus.sent : SmsStatus.failed),
    skipped: false,
  };
}

// ─── Admin: bulk retry failed SMS ───────────────────────────────────

export async function retryFailedSms(
  filters: RetryFailedFilters,
  adminUserId: string,
): Promise<RetryFailedResult> {
  const result: RetryFailedResult = {
    attempted: 0, sent: 0, failed: 0, skipped: 0, skippedOtp: 0, skippedMaxAttempts: 0,
  };

  const where: import('@prisma/client').Prisma.SmsLogWhereInput = {
    status: { in: [SmsStatus.failed, SmsStatus.queued] },
    isOtp: false,
  };

  if (filters.module) where.module = filters.module;
  if (filters.messageType) where.messageType = filters.messageType;
  if (filters.failureReason) where.failureReason = filters.failureReason;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const logs = await prisma.smsLog.findMany({
    where,
    take: filters.limit ?? 50,
    orderBy: { createdAt: 'desc' },
  });

  for (const log of logs) {
    if (log.isOtp) { result.skippedOtp++; result.skipped++; continue; }
    if (log.status === SmsStatus.sent) { result.skipped++; continue; }

    const check = canResendSms(log, { force: filters.force });
    if (!check.allowed) {
      if (check.reason === 'max_attempts_exceeded') result.skippedMaxAttempts++;
      result.skipped++;
      continue;
    }

    result.attempted++;
    await prisma.smsLog.update({ where: { id: log.id }, data: { resentById: adminUserId } });
    const res = await sendSmsNow(log.id, { attemptedBy: adminUserId });
    if (res.success) result.sent++;
    else result.failed++;
  }

  return result;
}

// ─── Stats ──────────────────────────────────────────────────────────

export async function getSmsStats() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last60min = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    total, sent, failed, queued, sending,
    failedLast24h, insufficientBalance, gatewayTimeout,
    recentBalanceFail,
  ] = await Promise.all([
    prisma.smsLog.count(),
    prisma.smsLog.count({ where: { status: SmsStatus.sent } }),
    prisma.smsLog.count({ where: { status: SmsStatus.failed } }),
    prisma.smsLog.count({ where: { status: SmsStatus.queued } }),
    prisma.smsLog.count({ where: { status: SmsStatus.sending } }),
    prisma.smsLog.count({ where: { status: SmsStatus.failed, createdAt: { gte: last24h } } }),
    prisma.smsLog.count({ where: { failureReason: 'insufficient_balance' } }),
    prisma.smsLog.count({ where: { failureReason: 'gateway_timeout' } }),
    prisma.smsLog.count({
      where: {
        status: SmsStatus.failed,
        failureReason: { in: ['insufficient_balance', 'gateway_error'] },
        createdAt: { gte: last60min },
      },
    }),
  ]);

  // Group by module
  const byModule = await prisma.smsLog.groupBy({
    by: ['module'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Group by status
  const byStatus = await prisma.smsLog.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  return {
    total,
    sent,
    failed,
    queued,
    sending,
    failedLast24h,
    insufficientBalanceCount: insufficientBalance,
    gatewayTimeoutCount: gatewayTimeout,
    possibleGatewayIssue: recentBalanceFail >= 3,
    recentFailuresLast60min: recentBalanceFail,
    byModule: byModule.map((m) => ({ module: m.module ?? 'unknown', count: m._count.id })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
  };
}

// ─── Legacy shim — used by existing callers ──────────────────────────

export async function sendSms(options: SmsOptions): Promise<void> {
  const smsLogId = await createSmsLog({
    to: options.to,
    message: options.message,
  });
  await sendSmsNow(smsLogId);
}

export async function sendMembershipConfirmation(phone: string, name: string): Promise<void> {
  await sendTransactionalSms({
    to: phone,
    message: `Dear ${name}, your BPA membership has been activated. Thank you for joining!`,
    messageType: 'membership_activation',
    module: 'membership',
  });
}
