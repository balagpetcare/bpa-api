import { z } from 'zod';

export const createDoctorSchema = z.object({
  name: z.string().min(1).max(120),
  nameBn: z.string().max(120).optional().nullable(),
  licenseNumber: z.string().min(1).max(80).optional(),
  licenseNo: z.string().min(1).max(80).optional(),
  specialization: z.string().max(120).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  organization: z.string().max(120).optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
}).refine(
  (data) => data.licenseNumber || data.licenseNo,
  { message: 'Either licenseNumber or licenseNo is required', path: ['licenseNumber'] }
);

export const updateDoctorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nameBn: z.string().max(120).optional().nullable(),
  licenseNumber: z.string().min(1).max(80).optional(),
  licenseNo: z.string().min(1).max(80).optional(),
  specialization: z.string().max(120).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  organization: z.string().max(120).optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const doctorListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false', 'all']).optional(),
  specialization: z.string().optional(),
});

export type CreateDoctorDto = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorDto = z.infer<typeof updateDoctorSchema>;
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;
