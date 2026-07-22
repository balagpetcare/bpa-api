import { z } from 'zod';
import { VolunteerStatus } from '@prisma/client';

export const createVolunteerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  areaOfInterest: z.string().max(500).optional(),
  availability: z.string().max(500).optional(),
  message: z.string().max(3000).optional(),
});

export const updateVolunteerStatusSchema = z.object({
  status: z.nativeEnum(VolunteerStatus),
});

export const volunteerListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(VolunteerStatus).optional(),
});

export type CreateVolunteerDto = z.infer<typeof createVolunteerSchema>;
export type UpdateVolunteerStatusDto = z.infer<typeof updateVolunteerStatusSchema>;
export type VolunteerListQuery = z.infer<typeof volunteerListQuerySchema>;

export interface VolunteerResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  areaOfInterest: string | null;
  availability: string | null;
  message: string | null;
  status: VolunteerStatus;
  createdAt: Date;
  updatedAt: Date;
}
