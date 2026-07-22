import { z } from 'zod';
import { EventStatus, RegistrationStatus } from '@prisma/client';

// ─── Event DTOs ───────────────────────────────────────────────────

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(280).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  coverImageId: z.string().uuid().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  startsAt: z.string().datetime({ message: 'startsAt must be ISO 8601' }),
  endsAt: z.string().datetime().optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
  isPaid: z.boolean().optional(),
  fee: z.number().nonnegative().optional().nullable(),
});

export const updateEventSchema = createEventSchema.partial();

export const publishEventSchema = z.object({
  status: z.nativeEnum(EventStatus),
});

export const eventListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(EventStatus).optional(),
  upcoming: z.enum(['true', 'false']).optional(),
});

// ─── Registration DTOs ────────────────────────────────────────────

export const createRegistrationSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
});

export const registrationListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(RegistrationStatus).optional(),
});

export const updateRegistrationStatusSchema = z.object({
  status: z.nativeEnum(RegistrationStatus),
});

export type CreateEventDto = z.infer<typeof createEventSchema>;
export type UpdateEventDto = z.infer<typeof updateEventSchema>;
export type PublishEventDto = z.infer<typeof publishEventSchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type CreateRegistrationDto = z.infer<typeof createRegistrationSchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;
export type UpdateRegistrationStatusDto = z.infer<typeof updateRegistrationStatusSchema>;

// ─── Response shapes ──────────────────────────────────────────────

export interface EventResponse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number | null;
  isPaid: boolean;
  fee: string | null;
  status: EventStatus;
  registrationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationResponse {
  id: string;
  eventId: string;
  eventTitle: string;
  name: string;
  email: string;
  phone: string | null;
  status: RegistrationStatus;
  paymentId: string | null;
  createdAt: Date;
  requiresPayment?: boolean;
  redirectUrl?: string;
  amount?: number;
  currency?: string;
}
