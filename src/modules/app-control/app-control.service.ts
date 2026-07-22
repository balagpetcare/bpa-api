import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { AuditContext } from '../../utils/audit';
import {
  AppAuditLogListQuery,
  AppControlListQuery,
  AppControlPublishDto,
  AppControlReorderDto,
  APP_CONTROL_PAGE_KEYS,
} from './app-control.types';

type DestinationType = 'CAMPAIGN' | 'MEMBERSHIP' | 'DONATION' | 'PET_CENSUS' | 'SERVICE' | 'INTERNAL_PAGE' | 'EXTERNAL_URL' | 'NONE';
type ContentStatus = 'draft' | 'published' | 'archived';

type EntityConfig = {
  key: string;
  delegate: string;
  entityType: string;
  versioned?: boolean;
  themed?: boolean;
};

const ENTITIES: Record<string, EntityConfig> = {
  'home-sections': { key: 'home-sections', delegate: 'appHomeSection', entityType: 'AppHomeSection' },
  banners: { key: 'banners', delegate: 'appBanner', entityType: 'AppBanner' },
  'quick-actions': { key: 'quick-actions', delegate: 'appQuickAction', entityType: 'AppQuickAction' },
  'featured-services': { key: 'featured-services', delegate: 'appFeaturedService', entityType: 'AppFeaturedService' },
  offers: { key: 'offers', delegate: 'appOffer', entityType: 'AppOffer' },
  'navigation-items': { key: 'navigation-items', delegate: 'appNavigationItem', entityType: 'AppNavigationItem' },
  'page-contents': { key: 'page-contents', delegate: 'appPageContent', entityType: 'AppPageContent' },
  'theme-settings': { key: 'theme-settings', delegate: 'appThemeSetting', entityType: 'AppThemeSetting', themed: true },
  'version-settings': { key: 'version-settings', delegate: 'appVersionSetting', entityType: 'AppVersionSetting', versioned: true },
  'popup-notices': { key: 'popup-notices', delegate: 'appPopupNotice', entityType: 'AppPopupNotice' },
  'tutorials-guides': { key: 'tutorials-guides', delegate: 'appTutorialGuide', entityType: 'AppTutorialGuide' },
};

function getConfig(resource: string): EntityConfig {
  const cfg = ENTITIES[resource];
  if (!cfg) throw AppError.notFound('App Control resource');
  return cfg;
}

function getDelegate(resource: string): any {
  return (prisma as any)[getConfig(resource).delegate];
}

function normalizeDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function toRecord(row: any) {
  return {
    ...row,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function validateDestination(type: DestinationType, value: string | null | undefined) {
  if (type === 'NONE') return;
  if (!value) throw AppError.badRequest('destinationValue is required for the selected destinationType');

  if (type === 'EXTERNAL_URL') {
    try { new URL(value); } catch { throw AppError.badRequest('destinationValue must be a valid URL'); }
    return;
  }

  if (type === 'INTERNAL_PAGE') {
    if (!APP_CONTROL_PAGE_KEYS.includes(value as typeof APP_CONTROL_PAGE_KEYS[number])) {
      throw AppError.badRequest('destinationValue must be a known app page key');
    }
    return;
  }

  if (type === 'CAMPAIGN') {
    const resolved = (isUuid(value)
      ? await prisma.campaign.findUnique({ where: { id: value }, select: { id: true, slug: true } })
      : null) ?? await prisma.campaign.findFirst({ where: { slug: value }, select: { id: true, slug: true } });

    if (!resolved) throw AppError.badRequest('destinationValue must be a valid campaign ID or slug');
    return;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildWhere(query: AppControlListQuery): Prisma.InputJsonValue | any {
  const and: any[] = [];
  if (query.status) and.push({ status: query.status });
  if (query.isActive) and.push({ isActive: query.isActive === 'true' });
  if (query.destinationType) and.push({ destinationType: query.destinationType });
  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subtitle: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { destinationValue: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function buildData(dto: Record<string, any>, actorId?: string, mode: 'create' | 'update' = 'create') {
  const base: Record<string, any> = {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
    ...(dto.mobileImageUrl !== undefined && { mobileImageUrl: dto.mobileImageUrl }),
    ...(dto.ctaText !== undefined && { ctaText: dto.ctaText }),
    ...(dto.destinationType !== undefined && { destinationType: dto.destinationType }),
    ...(dto.destinationValue !== undefined && { destinationValue: dto.destinationValue }),
    ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    ...(dto.startsAt !== undefined && { startsAt: normalizeDate(dto.startsAt) }),
    ...(dto.endsAt !== undefined && { endsAt: normalizeDate(dto.endsAt) }),
    ...(dto.targetAudience !== undefined && { targetAudience: dto.targetAudience }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
    ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
    ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
    ...(dto.fontFamily !== undefined && { fontFamily: dto.fontFamily }),
    ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
    ...(dto.minimumVersion !== undefined && { minimumVersion: dto.minimumVersion }),
    ...(dto.latestVersion !== undefined && { latestVersion: dto.latestVersion }),
    ...(dto.forceUpdate !== undefined && { forceUpdate: dto.forceUpdate }),
    ...(dto.releaseNotes !== undefined && { releaseNotes: dto.releaseNotes }),
  };

  if (mode === 'create') {
    base.createdById = actorId ?? null;
    base.updatedById = actorId ?? null;
  } else {
    base.updatedById = actorId ?? null;
  }
  return base;
}

async function writeAppAuditLog(entityType: string, entityId: string | null, action: AuditAction, ctx: AuditContext, payload?: Record<string, unknown>, previousPayload?: Record<string, unknown>) {
  await (prisma as any).appAuditLog.create({
    data: {
      entityType,
      entityId,
      action,
      title: payload?.title as string | undefined ?? previousPayload?.title as string | undefined ?? null,
      summary: `${action} ${entityType}`,
      payload: payload as Prisma.InputJsonValue | undefined,
      previousPayload: previousPayload as Prisma.InputJsonValue | undefined,
      createdById: ctx.actorId ?? null,
      updatedById: ctx.actorId ?? null,
    },
  }).catch(() => {});
}

export async function listEntities(resource: string, query: AppControlListQuery) {
  const delegate = getDelegate(resource);
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where = buildWhere(query);
  const [data, total] = await Promise.all([
    delegate.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip, take: limit }),
    delegate.count({ where }),
  ]);
  return { data: data.map(toRecord), meta: buildPaginationMeta(total, page, limit) };
}

export async function getEntity(resource: string, id: string) {
  const row = await getDelegate(resource).findUnique({ where: { id } });
  if (!row) throw AppError.notFound(getConfig(resource).entityType);
  return toRecord(row);
}

export async function createEntity(resource: string, dto: Record<string, any>, ctx: AuditContext) {
  const cfg = getConfig(resource);
  await validateDestination((dto.destinationType ?? 'NONE') as DestinationType, dto.destinationValue);
  const row = await getDelegate(resource).create({ data: buildData(dto, ctx.actorId, 'create') });
  await writeAppAuditLog(cfg.entityType, row.id, AuditAction.create, ctx, toRecord(row));
  return toRecord(row);
}

export async function updateEntity(resource: string, id: string, dto: Record<string, any>, ctx: AuditContext) {
  const cfg = getConfig(resource);
  const existing = await getDelegate(resource).findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(cfg.entityType);
  const merged = { ...existing, ...dto };
  await validateDestination(merged.destinationType, merged.destinationValue);
  const row = await getDelegate(resource).update({ where: { id }, data: buildData(dto, ctx.actorId, 'update') });
  await writeAppAuditLog(cfg.entityType, row.id, AuditAction.update, ctx, toRecord(row), toRecord(existing));
  return toRecord(row);
}

export async function deleteEntity(resource: string, id: string, ctx: AuditContext) {
  const cfg = getConfig(resource);
  const existing = await getDelegate(resource).findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(cfg.entityType);
  await getDelegate(resource).delete({ where: { id } });
  await writeAppAuditLog(cfg.entityType, id, AuditAction.delete, ctx, undefined, toRecord(existing));
}

export async function publishEntity(resource: string, id: string, dto: AppControlPublishDto, ctx: AuditContext) {
  const cfg = getConfig(resource);
  const existing = await getDelegate(resource).findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(cfg.entityType);
  const status: ContentStatus = dto.published ? 'published' : 'draft';
  const row = await getDelegate(resource).update({
    where: { id },
    data: { status, isActive: dto.published ? true : existing.isActive, updatedById: ctx.actorId ?? null },
  });
  await writeAppAuditLog(cfg.entityType, id, dto.published ? AuditAction.publish : AuditAction.unpublish, ctx, toRecord(row), toRecord(existing));
  return toRecord(row);
}

export async function reorderEntities(resource: string, dto: AppControlReorderDto, ctx: AuditContext) {
  const cfg = getConfig(resource);
  await prisma.$transaction(
    dto.items.map((item) =>
      getDelegate(resource).update({ where: { id: item.id }, data: { sortOrder: item.sortOrder, updatedById: ctx.actorId ?? null } }),
    ),
  );
  await writeAppAuditLog(cfg.entityType, null, AuditAction.update, ctx, { action: 'reorder', items: dto.items });
  return { reordered: dto.items.length };
}

export async function listAuditLogs(query: AppAuditLogListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const and: any[] = [];
  if (query.action) and.push({ action: query.action });
  if (query.entityType) and.push({ entityType: query.entityType });
  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
        { entityType: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }
  const where = and.length ? { AND: and } : {};
  const [data, total] = await Promise.all([
    (prisma as any).appAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    (prisma as any).appAuditLog.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getAuditLog(id: string) {
  const row = await (prisma as any).appAuditLog.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('AppAuditLog');
  return row;
}
