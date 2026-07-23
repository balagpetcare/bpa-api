import { prisma } from '../../database/prisma';
import type {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
} from './admin-push-notifications.types';

// ─── Templates ───────────────────────────────────────────────────

export async function listTemplates(page: number, limit: number, category?: string) {
  const where = category ? { category: category as any } : {};
  const [items, total] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationTemplate.count({ where }),
  ]);
  return { items, total };
}

export async function findTemplateById(id: string) {
  return prisma.notificationTemplate.findUnique({ where: { id } });
}

export async function findTemplateByKey(key: string) {
  return prisma.notificationTemplate.findUnique({ where: { key } });
}

export async function createTemplate(dto: CreateTemplateDto, createdById: string) {
  return prisma.notificationTemplate.create({ data: { ...dto, createdById } });
}

export async function updateTemplate(id: string, dto: UpdateTemplateDto) {
  return prisma.notificationTemplate.update({ where: { id }, data: dto });
}

export async function deleteTemplate(id: string) {
  return prisma.notificationTemplate.delete({ where: { id } });
}

// ─── Campaigns ───────────────────────────────────────────────────

export async function listCampaigns(page: number, limit: number, status?: string) {
  const where = status ? { status: status as any } : {};
  const [items, total] = await Promise.all([
    prisma.notificationCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationCampaign.count({ where }),
  ]);
  return { items, total };
}

export async function findCampaignById(id: string) {
  return prisma.notificationCampaign.findUnique({ where: { id } });
}

export async function createCampaign(dto: CreateCampaignDto, createdById: string) {
  return prisma.notificationCampaign.create({
    data: {
      ...dto,
      audienceFilter: dto.audienceFilter ?? undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdById,
    },
  });
}

export async function updateCampaign(id: string, dto: UpdateCampaignDto) {
  return prisma.notificationCampaign.update({
    where: { id },
    data: {
      ...dto,
      audienceFilter: dto.audienceFilter ?? undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    },
  });
}

export async function deleteCampaign(id: string) {
  return prisma.notificationCampaign.delete({ where: { id } });
}

export async function setCampaignStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  return prisma.notificationCampaign.update({ where: { id }, data: { status: status as any, ...extra } });
}

// ─── Automation rules ──────────────────────────────────────────────

export async function listAutomationRules() {
  return prisma.notificationAutomationRule.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function findAutomationRuleById(id: string) {
  return prisma.notificationAutomationRule.findUnique({ where: { id } });
}

export async function createAutomationRule(dto: CreateAutomationRuleDto, createdById: string) {
  return prisma.notificationAutomationRule.create({ data: { ...dto, createdById } });
}

export async function updateAutomationRule(id: string, dto: UpdateAutomationRuleDto) {
  return prisma.notificationAutomationRule.update({ where: { id }, data: dto });
}

export async function deleteAutomationRule(id: string) {
  return prisma.notificationAutomationRule.delete({ where: { id } });
}

// ─── Deliveries ──────────────────────────────────────────────────

export async function listFailedDeliveries(page: number, limit: number) {
  const where = { status: { in: ['failed', 'invalid_token'] as any } };
  const [items, total] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationDelivery.count({ where }),
  ]);
  return { items, total };
}

export async function findDeliveryById(id: string) {
  return prisma.notificationDelivery.findUnique({ where: { id }, include: { device: true } });
}

export async function resetDeliveryForRetry(id: string) {
  return prisma.notificationDelivery.update({
    where: { id },
    data: { status: 'pending', lastError: null },
  });
}

// ─── Audit (derived from campaign lifecycle timestamps — no separate audit table needed yet) ───

export async function listCampaignAuditTrail(page: number, limit: number) {
  const [items, total] = await Promise.all([
    prisma.notificationCampaign.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        createdById: true,
        approvedById: true,
        approvedAt: true,
        sentAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationCampaign.count(),
  ]);
  return { items, total };
}
