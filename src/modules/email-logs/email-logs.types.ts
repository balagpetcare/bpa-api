import { z } from 'zod';
import { EmailStatus } from '@prisma/client';

export const emailLogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(EmailStatus).optional(),
  provider: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

export type EmailLogListQuery = z.infer<typeof emailLogListQuerySchema>;

export interface EmailLogResponse {
  id: string;
  to: string;
  subject: string;
  body: string | null;
  status: EmailStatus;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  payload: Record<string, unknown> | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
