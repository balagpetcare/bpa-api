import { z } from 'zod';
import { SmsStatus } from '@prisma/client';

export const smsLogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(SmsStatus).optional(),
  provider: z.string().optional(),
  module: z.string().optional(),
  messageType: z.string().optional(),
  failureReason: z.string().optional(),
  reference: z.string().optional(),
  recipient: z.string().optional(),
  isOtp: z.coerce.boolean().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

export type SmsLogListQuery = z.infer<typeof smsLogListQuerySchema>;

export const resendSmsBodySchema = z.object({
  force: z.boolean().optional(),
});

export const retryFailedBodySchema = z.object({
  module: z.string().optional(),
  messageType: z.string().optional(),
  failureReason: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  force: z.boolean().optional(),
});

export type ResendSmsBody = z.infer<typeof resendSmsBodySchema>;
export type RetryFailedBody = z.infer<typeof retryFailedBodySchema>;

export interface SmsAttemptResponse {
  id: string;
  attemptNumber: number;
  status: SmsStatus;
  provider: string;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptedBy: string | null;
  attemptedAt: Date;
}

export interface SmsLogResponse {
  id: string;
  to: string;
  recipientMasked: string | null;
  body: string | null;
  messageType: string | null;
  module: string | null;
  entityType: string | null;
  entityId: string | null;
  reference: string | null;
  status: SmsStatus;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  failureDetail: string | null;
  payload: Record<string, unknown> | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  isOtp: boolean;
  idempotencyKey: string | null;
  resentById: string | null;
  createdAt: Date;
  updatedAt: Date;
  attempts?: SmsAttemptResponse[];
}
