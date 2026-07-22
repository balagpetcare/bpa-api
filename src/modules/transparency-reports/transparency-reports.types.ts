import { z } from 'zod';
import { TransparencyReportStatus } from '@prisma/client';

export const createTransparencyReportSchema = z.object({
  title: z.string().min(2).max(255),
  slug: z.string().min(2).max(280).regex(/^[a-z0-9-]+$/),
  reportType: z.string().max(60).default('quarterly'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCollectedBdt: z.number().min(0).default(0),
  totalSpentBdt: z.number().min(0).default(0),
  balanceBdt: z.number().optional(),
  breakdownJson: z.record(z.unknown()).optional(),
  summaryMd: z.string().max(20000).optional(),
  bodyMd: z.string().max(50000).optional(),
  attachmentUrl: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  coverImageId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
}).refine((data) => new Date(data.periodEnd) >= new Date(data.periodStart), {
  message: 'Period end must be on or after period start',
  path: ['periodEnd'],
});

export const updateTransparencyReportSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  slug: z.string().min(2).max(280).regex(/^[a-z0-9-]+$/).optional(),
  reportType: z.string().max(60).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  totalCollectedBdt: z.number().min(0).optional(),
  totalSpentBdt: z.number().min(0).optional(),
  balanceBdt: z.number().optional(),
  breakdownJson: z.record(z.unknown()).optional().nullable(),
  summaryMd: z.string().max(20000).optional().nullable(),
  bodyMd: z.string().max(50000).optional().nullable(),
  attachmentUrl: z.string().url().optional().nullable().or(z.literal('')).transform((v) => v || null).optional(),
  coverImageId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null).optional(),
}).refine((data) => {
  if (!data.periodStart || !data.periodEnd) return true;
  return new Date(data.periodEnd) >= new Date(data.periodStart);
}, {
  message: 'Period end must be on or after period start',
  path: ['periodEnd'],
});

export const reportListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(TransparencyReportStatus).optional(),
  reportType: z.string().optional(),
  search: z.string().optional(),
});

export type CreateTransparencyReportDto = z.infer<typeof createTransparencyReportSchema>;
export type UpdateTransparencyReportDto = z.infer<typeof updateTransparencyReportSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
