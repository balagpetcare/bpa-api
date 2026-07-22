import { z } from 'zod';

export const applyMembershipSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  membershipType: z.enum(['regular', 'student', 'corporate']),
  message: z.string().max(2000).optional(),
});

export type ApplyMembershipDto = z.infer<typeof applyMembershipSchema>;
