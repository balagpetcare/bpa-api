import { z } from 'zod';
import { PetType, PetGender } from '@prisma/client';

const locationFkFields = {
  // Location tree FK fields — schema already has these columns (added in Phase 1 migration)
  divisionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  districtId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  upazilaId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  unionId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityCorporationId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cityZoneId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  wardId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  addressLine: z.string().max(500).optional().nullable(),
};

export const createPetOwnerSchema = z.object({
  ownerName: z.string().min(1).max(120),
  mobile: z.string().min(7).max(20),
  email: z.string().email().max(255).optional(),
  address: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
  ...locationFkFields,
});

export const updatePetOwnerSchema = z.object({
  ownerName: z.string().min(1).max(120).optional(),
  mobile: z.string().min(7).max(20).optional(),
  email: z.string().email().max(255).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  ...locationFkFields,
});

export const createPetSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(120),
  petType: z.nativeEnum(PetType),
  gender: z.nativeEnum(PetGender),
  approxAge: z.number().int().min(0).optional(),
  breed: z.string().max(120).optional(),
  color: z.string().max(80).optional(),
  weightKg: z.number().positive().optional(),
  photoId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const updatePetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  petType: z.nativeEnum(PetType).optional(),
  gender: z.nativeEnum(PetGender).optional(),
  approxAge: z.number().int().min(0).optional().nullable(),
  breed: z.string().max(120).optional().nullable(),
  color: z.string().max(80).optional().nullable(),
  weightKg: z.number().positive().optional().nullable(),
  photoId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const petListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  petType: z.nativeEnum(PetType).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const petOwnerListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  mobile: z.string().optional(),
});

export type CreatePetOwnerDto = z.infer<typeof createPetOwnerSchema>;
export type UpdatePetOwnerDto = z.infer<typeof updatePetOwnerSchema>;
export type CreatePetDto = z.infer<typeof createPetSchema>;
export type UpdatePetDto = z.infer<typeof updatePetSchema>;
export type PetListQuery = z.infer<typeof petListQuerySchema>;
export type PetOwnerListQuery = z.infer<typeof petOwnerListQuerySchema>;
