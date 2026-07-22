import { z } from 'zod';
import { ContactStatus } from '@prisma/client';

export const createContactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  subject: z.string().max(255).optional(),
  message: z.string().min(10).max(5000),
});

export const updateContactStatusSchema = z.object({
  status: z.nativeEnum(ContactStatus),
});

export const contactListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.nativeEnum(ContactStatus).optional(),
});

export type CreateContactDto = z.infer<typeof createContactSchema>;
export type UpdateContactStatusDto = z.infer<typeof updateContactStatusSchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export interface ContactResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactStatus;
  repliedAt: Date | null;
  createdAt: Date;
}
