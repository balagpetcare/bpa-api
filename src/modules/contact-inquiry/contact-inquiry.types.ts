import { z } from 'zod';
import { InquiryPriority, InquiryStatus } from '@prisma/client';

// ─── Public Submission ────────────────────────────────────────────

export const submitInquirySchema = z.object({
  contactTypeId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(120),
  email: z.string().email('Invalid email address').max(255),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  organizationName: z.string().max(255).optional(),
  designation: z.string().max(120).optional(),
  website: z.string().url('Invalid URL').max(500).optional().or(z.literal('')),
  subject: z.string().min(1, 'Subject is required').max(500),
  message: z.string().min(10, 'Message must be at least 10 characters').max(10000),
  attachmentUrl: z.string().url().max(2000).optional(),
  consentGiven: z.boolean().refine((v) => v === true, { message: 'You must consent to submit' }),
});

// ─── Admin Query ──────────────────────────────────────────────────

export const inquiryListQuerySchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  limit: z.coerce.number().positive().max(100).optional().default(20),
  search: z.string().optional(),
  status: z.nativeEnum(InquiryStatus).optional(),
  priority: z.nativeEnum(InquiryPriority).optional(),
  contactTypeId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  country: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ─── Admin Actions ────────────────────────────────────────────────

export const updateInquiryStatusSchema = z.object({
  status: z.nativeEnum(InquiryStatus),
});

export const assignInquirySchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  priority: z.nativeEnum(InquiryPriority).optional(),
});

export const replyInquirySchema = z.object({
  fromAccountId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1, 'Reply body is required'),
  useTemplate: z.boolean().optional().default(false),
  layoutKey: z.string().optional(),
  markResolved: z.boolean().optional().default(false),
});

export const forwardInquirySchema = z.object({
  fromAccountId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1, 'Forward body is required'),
  note: z.string().optional(),
});

export const sendSmsInquirySchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  message: z.string().min(1).max(500),
});

export const addNoteSchema = z.object({
  note: z.string().min(1, 'Note content is required').max(5000),
});

// ─── Config Management ────────────────────────────────────────────

export const upsertContactTypeSchema = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric'),
  labelEn: z.string().min(1).max(120),
  labelBn: z.string().max(120).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().optional().default(0),
});

export const upsertCategorySchema = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric'),
  labelEn: z.string().min(1).max(120),
  labelBn: z.string().max(120).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().optional().default(0),
});

export const upsertDepartmentSchema = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric'),
  nameEn: z.string().min(1).max(120),
  nameBn: z.string().max(120).optional(),
  description: z.string().optional(),
  contactEmail: z.string().email().max(255).optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().optional().default(0),
});

export const upsertPriorityRuleSchema = z.object({
  contactTypeSlug: z.string().max(60).optional(),
  categorySlug: z.string().max(60).optional(),
  priority: z.nativeEnum(InquiryPriority),
  departmentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().optional().default(0),
});

// ─── Types ────────────────────────────────────────────────────────

export type SubmitInquiryDto = z.infer<typeof submitInquirySchema>;
export type InquiryListQuery = z.infer<typeof inquiryListQuerySchema>;
export type UpdateInquiryStatusDto = z.infer<typeof updateInquiryStatusSchema>;
export type AssignInquiryDto = z.infer<typeof assignInquirySchema>;
export type ReplyInquiryDto = z.infer<typeof replyInquirySchema>;
export type ForwardInquiryDto = z.infer<typeof forwardInquirySchema>;
export type SendSmsDto = z.infer<typeof sendSmsInquirySchema>;
export type AddNoteDto = z.infer<typeof addNoteSchema>;
export type UpsertContactTypeDto = z.infer<typeof upsertContactTypeSchema>;
export type UpsertCategoryDto = z.infer<typeof upsertCategorySchema>;
export type UpsertDepartmentDto = z.infer<typeof upsertDepartmentSchema>;
export type UpsertPriorityRuleDto = z.infer<typeof upsertPriorityRuleSchema>;
