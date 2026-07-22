import { z } from 'zod';
import { StaffDutyRole } from '@prisma/client';

export const assignStaffSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  dutyRole: z.nativeEnum(StaffDutyRole),
  notes: z.string().max(500).optional().nullable(),
});

export const updateStaffAssignmentSchema = z.object({
  sessionId: z.string().uuid().optional().nullable(),
  dutyRole: z.nativeEnum(StaffDutyRole).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const bulkAssignStaffSchema = z.object({
  assignments: z.array(z.object({
    userId: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    dutyRole: z.nativeEnum(StaffDutyRole),
    notes: z.string().max(500).optional().nullable(),
  })).min(1).max(100),
});

export const listStaffAssignmentsQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  dutyRole: z.nativeEnum(StaffDutyRole).optional(),
  isActive: z.preprocess((v) => v === 'true' ? true : v === 'false' ? false : undefined, z.boolean().optional()),
});

export type AssignStaffDto = z.infer<typeof assignStaffSchema>;
export type UpdateStaffAssignmentDto = z.infer<typeof updateStaffAssignmentSchema>;
export type BulkAssignStaffDto = z.infer<typeof bulkAssignStaffSchema>;
export type ListStaffAssignmentsQuery = z.infer<typeof listStaffAssignmentsQuerySchema>;
