import { z } from 'zod';

export const qrVerifySchema = z.object({
  qrToken: z.string().min(1).optional(),
  bookingReference: z.string().min(1).optional(),
  sessionId: z.string().uuid().optional(),
}).refine((d) => d.qrToken || d.bookingReference, { message: 'qrToken or bookingReference is required' });

export const checkInSchema = z.object({
  registrationId: z.string().uuid().optional(),
  petBookingId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  token: z.string().min(1).optional(),
  adminOverride: z.boolean().default(false),
}).refine((d) => d.registrationId || d.petBookingId || d.token, { message: 'registrationId, petBookingId, or token is required' });

export const vaccinationCompleteSchema = z.object({
  petBookingId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  vaccineName: z.string().max(120).optional(),
  batchNumber: z.string().max(120).optional(),
  dose: z.string().max(50).optional(),
  vaccinatedAt: z.string().datetime().optional(),
  signingDoctorId: z.string().uuid().optional(),
  remarks: z.string().max(1000).optional(),
  adminOverride: z.boolean().default(false),
});

export const issueCertificateSchema = z.object({
  petBookingId: z.string().uuid(),
  signingDoctorId: z.string().uuid().optional(),
});

export const resendCertificateSchema = z.object({
  petBookingId: z.string().uuid(),
});

export const scanLogsQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  sessionId: z.string().uuid().optional(),
  scanResult: z.string().optional(),
  scannedById: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type QrVerifyDto = z.infer<typeof qrVerifySchema>;
export type CheckInDto = z.infer<typeof checkInSchema>;
export type VaccinationCompleteDto = z.infer<typeof vaccinationCompleteSchema>;
export type IssueCertificateDto = z.infer<typeof issueCertificateSchema>;
export type ResendCertificateDto = z.infer<typeof resendCertificateSchema>;
export type ScanLogsQuery = z.infer<typeof scanLogsQuerySchema>;
