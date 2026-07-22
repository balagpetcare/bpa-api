import { z } from 'zod';

export const scanQrSchema = z.object({
  qrToken: z.string().min(1),
});

export const searchBookingSchema = z.object({
  q: z.string().min(1).max(200),
  campaignId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

export const vaccinateSchema = z.object({
  services: z.array(z.object({
    campaignServiceId: z.string().uuid(),
    batchNumber: z.string().max(120).optional(),
  })).min(1),
  doctorId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

export const vaccinationRecordListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  petId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

export type ScanQrDto = z.infer<typeof scanQrSchema>;
export type SearchBookingDto = z.infer<typeof searchBookingSchema>;
export type VaccinateDto = z.infer<typeof vaccinateSchema>;
export type VaccinationRecordListQuery = z.infer<typeof vaccinationRecordListQuerySchema>;
