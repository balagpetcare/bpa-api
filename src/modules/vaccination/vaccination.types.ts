import { z } from 'zod';

export const checkInSchema = z.object({
  token: z.string().min(1, 'Token or reference number is required'),
  venueId: z.string().uuid().optional().nullable(),
  sessionId: z.string().uuid().optional().nullable(),
});

export const markVaccinatedSchema = z.object({
  petRegistrationId: z.string().uuid('Invalid pet registration ID format'),
  doctorId: z.string().uuid('Invalid doctor ID format').optional().nullable(),
  vaccineId: z.string().uuid('Invalid vaccine ID format').optional().nullable(),
  batchNo: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  adminOverride: z.boolean().optional().default(false),
});

export const issueCertificateSchema = z.object({
  petRegistrationId: z.string().uuid('Invalid pet registration ID format'),
});

export const revokeCertificateSchema = z.object({
  certificateId: z.string().uuid('Invalid certificate ID format'),
  reason: z.string().min(1, 'Reason for revocation is required').max(500),
});

export type CheckInDto = z.infer<typeof checkInSchema>;
export type MarkVaccinatedDto = z.infer<typeof markVaccinatedSchema>;
export type IssueCertificateDto = z.infer<typeof issueCertificateSchema>;
export type RevokeCertificateDto = z.infer<typeof revokeCertificateSchema>;
