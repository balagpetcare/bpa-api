import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { SyncLogListQuery } from './pet-smart-solution.types';

export const PET_SMART_SETTING_KEYS = {
  baseUrl: 'PSS_API_BASE_URL',
  apiKey: 'PSS_API_KEY',
  syncEnabled: 'PSS_SYNC_ENABLED',
  syncEntities: 'PSS_SYNC_ENTITIES',
  webhookSecret: 'PSS_WEBHOOK_SECRET',
} as const;

export async function listSettings() {
  return prisma.petSmartSyncSetting.findMany({ orderBy: { settingKey: 'asc' } });
}

export async function getSettingById(id: string) {
  return prisma.petSmartSyncSetting.findUnique({ where: { id } });
}

export async function getSettingByKey(settingKey: string) {
  return prisma.petSmartSyncSetting.findUnique({ where: { settingKey } });
}

export async function getSettingsMap(client: DbClient = prisma) {
  const settings = await client.petSmartSyncSetting.findMany({
    where: { settingKey: { in: Object.values(PET_SMART_SETTING_KEYS) } },
  });
  return new Map(settings.map((setting) => [setting.settingKey, setting]));
}

export async function updateSettingByKey(
  settingKey: string,
  data: Prisma.PetSmartSyncSettingUncheckedUpdateInput,
  client: DbClient = prisma,
) {
  return client.petSmartSyncSetting.update({
    where: { settingKey },
    data,
  });
}

export async function listSyncLogs(query: SyncLogListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PetSmartSyncLogWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.syncType ? { syncType: query.syncType } : {}),
    ...(query.entityType
      ? { entityType: { equals: query.entityType, mode: 'insensitive' } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.petSmartSyncLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        setting: {
          select: {
            id: true,
            settingKey: true,
          },
        },
      },
    }),
    prisma.petSmartSyncLog.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getSyncLogById(id: string) {
  return prisma.petSmartSyncLog.findUnique({
    where: { id },
    include: {
      setting: {
        select: {
          id: true,
          settingKey: true,
        },
      },
    },
  });
}

export async function getLatestSyncStartedAt() {
  const latest = await prisma.petSmartSyncLog.findFirst({
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return latest?.startedAt ?? null;
}

export async function createSyncLog(
  data: Prisma.PetSmartSyncLogUncheckedCreateInput,
  client: DbClient = prisma,
) {
  return client.petSmartSyncLog.create({ data });
}
type DbClient = Prisma.TransactionClient | typeof prisma;
