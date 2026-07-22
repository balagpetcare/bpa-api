import { prisma } from '../database/prisma';

export interface ActivityEventData {
  type: string;
  module: string;
  action: string;
  userId?: string;
  sessionId?: string;
  visitorId?: string;
  entityType?: string;
  entityId?: string;
  title: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  path?: string;
  referrer?: string;
  device?: string;
}

export async function logActivityEvent(data: ActivityEventData): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        type: data.type,
        module: data.module,
        action: data.action,
        userId: data.userId ?? null,
        sessionId: data.sessionId ?? null,
        visitorId: data.visitorId ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        title: data.title,
        metadata: data.metadata ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        path: data.path ?? null,
        referrer: data.referrer ?? null,
        device: data.device ?? null,
      },
    });
  } catch (err) {
    // Activity logging must be safe and never interrupt main flows
    console.error('[ActivityLogger] Failed to write activity event:', err);
  }
}
