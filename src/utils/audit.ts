import { Request } from 'express';
import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export interface AuditContext {
  actorId?: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string | null;
  effectiveAt?: Date | null;
  existingMembersAffected?: boolean | null;
}

export function auditContextFromRequest(req: Request): AuditContext {
  return {
    actorId: req.user?.sub,
    actorEmail: req.user?.email,
    ipAddress:
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

export async function writeAuditLog(
  entry: AuditEntry,
  ctx: AuditContext,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: ctx.actorId ?? null,
        actorEmail: ctx.actorEmail ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        oldValues: entry.oldValues as Prisma.InputJsonValue | undefined,
        newValues: entry.newValues as Prisma.InputJsonValue | undefined,
        reason: entry.reason ?? null,
        effectiveAt: entry.effectiveAt ?? null,
        existingMembersAffected: entry.existingMembersAffected ?? null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  } catch {
    // Audit log failure must never interrupt the main request
    console.error('[AuditLog] Failed to write audit entry', entry);
  }
}

export async function auditCreate(
  resource: string,
  resourceId: string,
  newValues: Record<string, unknown>,
  ctx: AuditContext,
): Promise<void> {
  await writeAuditLog({ action: AuditAction.create, resource, resourceId, newValues }, ctx);
}

export async function auditUpdate(
  resource: string,
  resourceId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  ctx: AuditContext,
): Promise<void> {
  await writeAuditLog({ action: AuditAction.update, resource, resourceId, oldValues, newValues }, ctx);
}

export async function auditDelete(
  resource: string,
  resourceId: string,
  oldValues: Record<string, unknown>,
  ctx: AuditContext,
): Promise<void> {
  await writeAuditLog({ action: AuditAction.delete, resource, resourceId, oldValues }, ctx);
}

export async function auditPublish(
  resource: string,
  resourceId: string,
  ctx: AuditContext,
): Promise<void> {
  await writeAuditLog({ action: AuditAction.publish, resource, resourceId }, ctx);
}

export async function auditUnpublish(
  resource: string,
  resourceId: string,
  ctx: AuditContext,
): Promise<void> {
  await writeAuditLog({ action: AuditAction.unpublish, resource, resourceId }, ctx);
}
