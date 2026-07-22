import { Prisma, NotificationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { CreateNotificationDto, ListNotificationsQuery } from './notifications.types';

// ─── Create (with deduplication) ─────────────────────────────────

export async function createNotification(dto: CreateNotificationDto) {
  if (dto.dedupeKey) {
    const existing = await prisma.adminNotification.findUnique({
      where: { dedupeKey: dto.dedupeKey },
      select: { id: true },
    });
    if (existing) return null; // deduplicated — silent skip
  }
  return prisma.adminNotification.create({
    data: {
      type:            dto.type,
      title:           dto.title,
      message:         dto.message,
      module:          dto.module,
      entityType:      dto.entityType,
      entityId:        dto.entityId,
      priority:        dto.priority ?? 'normal',
      actionUrl:       dto.actionUrl,
      metadata:        dto.metadata as Prisma.InputJsonValue | undefined,
      dedupeKey:       dto.dedupeKey,
      createdForRole:  dto.createdForRole,
      createdForUserId: dto.createdForUserId,
    },
  });
}

// ─── List ─────────────────────────────────────────────────────────

export async function listNotifications(q: ListNotificationsQuery) {
  const skip = (q.page - 1) * q.limit;

  const where: Prisma.AdminNotificationWhereInput = {};
  if (q.status !== 'all') where.status = q.status as NotificationStatus;
  if (q.priority)         where.priority = q.priority;
  if (q.type)             where.type = q.type;
  if (q.module)           where.module = q.module;

  const [total, items] = await Promise.all([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: q.limit,
    }),
  ]);

  return { total, items };
}

// ─── Unread count ─────────────────────────────────────────────────

export async function getUnreadCount() {
  return prisma.adminNotification.count({
    where: { status: 'unread' },
  });
}

// ─── Mark single read ─────────────────────────────────────────────

export async function markNotificationRead(id: string) {
  return prisma.adminNotification.updateMany({
    where: { id, status: { not: 'dismissed' } },
    data: { status: 'read', readAt: new Date() },
  });
}

// ─── Dismiss ─────────────────────────────────────────────────────

export async function dismissNotification(id: string) {
  return prisma.adminNotification.updateMany({
    where: { id },
    data: { status: 'dismissed', dismissedAt: new Date() },
  });
}

// ─── Mark all read ────────────────────────────────────────────────

export async function markAllRead(filter?: { type?: string; module?: string }) {
  const where: Prisma.AdminNotificationWhereInput = { status: 'unread' };
  if (filter?.type)   where.type   = filter.type as any;
  if (filter?.module) where.module = filter.module;

  return prisma.adminNotification.updateMany({
    where,
    data: { status: 'read', readAt: new Date() },
  });
}

// ─── Find by id ───────────────────────────────────────────────────

export async function findNotificationById(id: string) {
  return prisma.adminNotification.findUnique({ where: { id } });
}
