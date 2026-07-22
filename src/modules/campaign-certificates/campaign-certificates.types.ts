import { z } from 'zod';

export const IssueCertificateSchema = z.object({
  petBookingId: z.string().uuid(),
});

export const ReissueCertificateSchema = z.object({
  reason: z.string().max(255).optional(),
});

export const CertificateListQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const PublicVerifyQuerySchema = z.object({
  certificateNumber: z.string().optional(),
});

export type IssueCertificateDto = z.infer<typeof IssueCertificateSchema>;
export type ReissueCertificateDto = z.infer<typeof ReissueCertificateSchema>;
export type CertificateListQuery = z.infer<typeof CertificateListQuerySchema>;
