import { z } from 'zod';

export const participantsListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(50),
  paymentStatus: z.string().optional(),
  registrationStatus: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

export const bulkSmsSchema = z.object({
  template: z.string().min(1).max(5000),
  filters: z.object({
    paymentStatus: z.string().optional(),
    registrationStatus: z.string().optional(),
    sessionId: z.string().uuid().optional(),
    venueId: z.string().uuid().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    search: z.string().optional(),
    selectedIds: z.array(z.string().uuid()).optional(),
    onlyFailedPayment: z.boolean().optional(),
    onlyPendingPayment: z.boolean().optional(),
  }),
  previewCount: z.number().int().min(1),
  confirmation: z.boolean(),
});

export const bulkSmsPreviewSchema = z.object({
  template: z.string().min(1).max(5000),
  filters: z.object({
    paymentStatus: z.string().optional(),
    registrationStatus: z.string().optional(),
    sessionId: z.string().uuid().optional(),
    venueId: z.string().uuid().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    search: z.string().optional(),
    selectedIds: z.array(z.string().uuid()).optional(),
    onlyFailedPayment: z.boolean().optional(),
    onlyPendingPayment: z.boolean().optional(),
  }),
});

export type ParticipantsListQuery = z.infer<typeof participantsListQuerySchema>;
export type BulkSmsDto = z.infer<typeof bulkSmsSchema>;
export type BulkSmsPreviewDto = z.infer<typeof bulkSmsPreviewSchema>;
