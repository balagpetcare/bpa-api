import { z } from 'zod';

export const localProfileUpdateSchema = z.object({
  divisionId: z.string().uuid().nullable().optional(),
  districtId: z.string().uuid().nullable().optional(),
  upazilaId: z.string().uuid().nullable().optional(),
  unionId: z.string().uuid().nullable().optional(),
  cityCorporationId: z.string().uuid().nullable().optional(),
  cityZoneId: z.string().uuid().nullable().optional(),
  wardId: z.string().uuid().nullable().optional(),
  addressLine: z.string().max(500).nullable().optional(),
}).strict();

export type LocalProfileUpdateDto = z.infer<typeof localProfileUpdateSchema>;
