import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog } from '../../utils/audit';
import { AuditAction } from '@prisma/client';
import type { AssignStaffDto, UpdateStaffAssignmentDto, BulkAssignStaffDto, ListStaffAssignmentsQuery } from './campaign-staff-assignments.types';

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userRoles: { select: { role: { select: { name: true } } } },
} as const;

export async function listStaffAssignments(campaignId: string, query: ListStaffAssignmentsQuery) {
  const where: any = { campaignId };
  if (query.sessionId) where.sessionId = query.sessionId;
  if (query.dutyRole) where.dutyRole = query.dutyRole;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  return prisma.campaignStaffAssignment.findMany({
    where,
    orderBy: [{ sessionId: 'asc' }, { dutyRole: 'asc' }, { createdAt: 'asc' }],
    include: {
      user: { select: userSelect },
      session: { select: { id: true, sessionDate: true, startTime: true, endTime: true, venue: { select: { name: true } } } },
      assignedByUser: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function assignStaff(campaignId: string, dto: AssignStaffDto, actorId: string, ipAddress?: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw AppError.notFound('Campaign');

  const user = await prisma.user.findUnique({
    where: { id: dto.userId },
    select: { id: true, isActive: true, userRoles: { select: { role: { select: { name: true } } } } },
  });
  if (!user) throw AppError.notFound('User');
  if (!user.isActive) throw AppError.badRequest('User is inactive and cannot be assigned');

  if (dto.sessionId) {
    const session = await prisma.campaignSession.findFirst({ where: { id: dto.sessionId, campaignId } });
    if (!session) throw AppError.notFound('Session');
  }

  const duplicate = await prisma.campaignStaffAssignment.findFirst({
    where: {
      campaignId,
      userId: dto.userId,
      sessionId: dto.sessionId ?? null,
      dutyRole: dto.dutyRole,
      isActive: true,
    },
  });
  if (duplicate) {
    throw AppError.conflict('This staff member is already assigned to this campaign/session with the same duty role');
  }

  const assignment = await prisma.campaignStaffAssignment.create({
    data: {
      campaignId,
      sessionId: dto.sessionId ?? null,
      userId: dto.userId,
      dutyRole: dto.dutyRole,
      notes: dto.notes ?? null,
      assignedBy: actorId,
    },
    include: {
      user: { select: userSelect },
      session: { select: { id: true, sessionDate: true, startTime: true, venue: { select: { name: true } } } },
    },
  });

  await writeAuditLog(
    { action: AuditAction.create, resource: 'campaign_staff_assignment', resourceId: assignment.id, newValues: { campaignId, userId: dto.userId, dutyRole: dto.dutyRole, sessionId: dto.sessionId } },
    { actorId, ipAddress },
  );

  return assignment;
}

export async function updateStaffAssignment(campaignId: string, assignmentId: string, dto: UpdateStaffAssignmentDto, actorId: string, ipAddress?: string) {
  const existing = await prisma.campaignStaffAssignment.findUnique({ where: { id: assignmentId } });
  if (!existing || existing.campaignId !== campaignId) throw AppError.notFound('Staff assignment');

  if (dto.sessionId) {
    const session = await prisma.campaignSession.findFirst({ where: { id: dto.sessionId, campaignId } });
    if (!session) throw AppError.notFound('Session');
  }

  const updated = await prisma.campaignStaffAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(dto.sessionId !== undefined && { sessionId: dto.sessionId }),
      ...(dto.dutyRole && { dutyRole: dto.dutyRole }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    },
    include: {
      user: { select: userSelect },
      session: { select: { id: true, sessionDate: true, startTime: true, venue: { select: { name: true } } } },
    },
  });

  await writeAuditLog(
    { action: AuditAction.update, resource: 'campaign_staff_assignment', resourceId: assignmentId, oldValues: existing as any, newValues: dto as any },
    { actorId, ipAddress },
  );

  return updated;
}

export async function deactivateStaffAssignment(campaignId: string, assignmentId: string, actorId: string, ipAddress?: string) {
  const existing = await prisma.campaignStaffAssignment.findUnique({ where: { id: assignmentId } });
  if (!existing || existing.campaignId !== campaignId) throw AppError.notFound('Staff assignment');

  await prisma.campaignStaffAssignment.update({ where: { id: assignmentId }, data: { isActive: false } });

  await writeAuditLog(
    { action: AuditAction.update, resource: 'campaign_staff_assignment', resourceId: assignmentId, newValues: { isActive: false } },
    { actorId, ipAddress },
  );
}

export async function bulkAssignStaff(campaignId: string, dto: BulkAssignStaffDto, actorId: string, ipAddress?: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw AppError.notFound('Campaign');

  const results: { success: boolean; userId: string; dutyRole: string; sessionId?: string; error?: string }[] = [];

  for (const item of dto.assignments) {
    try {
      const user = await prisma.user.findUnique({ where: { id: item.userId }, select: { id: true, isActive: true } });
      if (!user) { results.push({ success: false, userId: item.userId, dutyRole: item.dutyRole, error: 'User not found' }); continue; }
      if (!user.isActive) { results.push({ success: false, userId: item.userId, dutyRole: item.dutyRole, error: 'User inactive' }); continue; }

      if (item.sessionId) {
        const session = await prisma.campaignSession.findFirst({ where: { id: item.sessionId, campaignId } });
        if (!session) { results.push({ success: false, userId: item.userId, dutyRole: item.dutyRole, sessionId: item.sessionId, error: 'Session not found in this campaign' }); continue; }
      }

      const duplicate = await prisma.campaignStaffAssignment.findFirst({
        where: { campaignId, userId: item.userId, sessionId: item.sessionId ?? null, dutyRole: item.dutyRole, isActive: true },
      });
      if (duplicate) { results.push({ success: false, userId: item.userId, dutyRole: item.dutyRole, sessionId: item.sessionId, error: 'Already assigned' }); continue; }

      await prisma.campaignStaffAssignment.create({
        data: {
          campaignId,
          sessionId: item.sessionId ?? null,
          userId: item.userId,
          dutyRole: item.dutyRole,
          notes: item.notes ?? null,
          assignedBy: actorId,
        },
      });

      results.push({ success: true, userId: item.userId, dutyRole: item.dutyRole, sessionId: item.sessionId });
    } catch (err: any) {
      results.push({ success: false, userId: item.userId, dutyRole: item.dutyRole, error: err.message });
    }
  }

  await writeAuditLog(
    { action: AuditAction.create, resource: 'campaign_staff_assignment_bulk', resourceId: campaignId, newValues: { count: dto.assignments.length, results } },
    { actorId, ipAddress },
  );

  return { results, total: dto.assignments.length, succeeded: results.filter((r) => r.success).length };
}

export async function getMyAssignedCampaigns(userId: string) {
  const assignments = await prisma.campaignStaffAssignment.findMany({
    where: { userId, isActive: true },
    include: {
      campaign: {
        include: {
          sessions: {
            where: { isActive: true },
            orderBy: { sessionDate: 'asc' },
            include: { venue: { select: { name: true, address: true } } },
          },
        },
      },
      session: { include: { venue: { select: { name: true, address: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by campaign
  const campaignMap = new Map<string, any>();
  for (const a of assignments) {
    if (!campaignMap.has(a.campaignId)) {
      campaignMap.set(a.campaignId, { ...a.campaign, myAssignments: [] });
    }
    campaignMap.get(a.campaignId).myAssignments.push({
      id: a.id,
      dutyRole: a.dutyRole,
      sessionId: a.sessionId,
      session: a.session,
      isActive: a.isActive,
    });
  }

  return Array.from(campaignMap.values());
}
