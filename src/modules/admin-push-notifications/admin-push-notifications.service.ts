import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { prisma } from '../../database/prisma';
import { publishOutboxEvent, enqueueIfNew } from '../push-notifications/outbox';
import { firebaseProvider, mapCategoryToAndroidChannel } from '../../providers/firebase.provider';
import { resolveAudienceUserIds } from './audience';
import * as repo from './admin-push-notifications.repository';
import type {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  TestSendDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
} from './admin-push-notifications.types';

// ─── Templates ───────────────────────────────────────────────────

export async function listTemplates(page: number, limit: number, category?: string) {
  const { items, total } = await repo.listTemplates(page, limit, category);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getTemplate(id: string) {
  const template = await repo.findTemplateById(id);
  if (!template) throw AppError.notFound('Template');
  return template;
}

export async function createTemplate(dto: CreateTemplateDto, createdById: string) {
  const existing = await repo.findTemplateByKey(dto.key);
  if (existing) throw AppError.conflict(`Template key "${dto.key}" already exists`);
  return repo.createTemplate(dto, createdById);
}

export async function updateTemplate(id: string, dto: UpdateTemplateDto) {
  await getTemplate(id);
  return repo.updateTemplate(id, dto);
}

export async function deleteTemplate(id: string) {
  await getTemplate(id);
  return repo.deleteTemplate(id);
}

// ─── Campaigns ───────────────────────────────────────────────────

export async function listCampaigns(page: number, limit: number, status?: string) {
  const { items, total } = await repo.listCampaigns(page, limit, status);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

async function getCampaignOrThrow(id: string) {
  const campaign = await repo.findCampaignById(id);
  if (!campaign) throw AppError.notFound('Notification campaign');
  return campaign;
}

export async function createCampaign(dto: CreateCampaignDto, createdById: string) {
  if (dto.category === 'emergency') {
    throw AppError.badRequest(
      'Emergency broadcasts must be sent via the emergency send-now flow (requires notification:emergency), not created as a regular draft.',
    );
  }
  return repo.createCampaign(dto, createdById);
}

export async function getCampaign(id: string) {
  return getCampaignOrThrow(id);
}

export async function updateCampaign(id: string, dto: UpdateCampaignDto) {
  const campaign = await getCampaignOrThrow(id);
  if (campaign.status !== 'draft') {
    throw AppError.badRequest('Only draft campaigns can be edited');
  }
  return repo.updateCampaign(id, dto);
}

export async function deleteCampaign(id: string) {
  const campaign = await getCampaignOrThrow(id);
  if (campaign.status !== 'draft') {
    throw AppError.badRequest('Only draft campaigns can be deleted');
  }
  return repo.deleteCampaign(id);
}

export async function estimateAudience(id: string) {
  const campaign = await getCampaignOrThrow(id);
  const userIds = await resolveAudienceUserIds(
    campaign.audienceType,
    campaign.audienceFilter as any,
  );
  await prisma.notificationCampaign.update({ where: { id }, data: { estimatedReach: userIds.length } });
  return { estimatedReach: userIds.length };
}

export async function previewCampaign(id: string) {
  const campaign = await getCampaignOrThrow(id);
  return {
    android: {
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl,
      channelId: mapCategoryToAndroidChannel(campaign.category),
    },
    ios: {
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl,
    },
    bengali: {
      title: campaign.titleBn || campaign.title,
      body: campaign.bodyBn || campaign.body,
    },
  };
}

export async function testSendCampaign(id: string, dto: TestSendDto) {
  const campaign = await getCampaignOrThrow(id);
  const device = await prisma.deviceInstallation.findUnique({ where: { installationId: dto.installationId } });
  if (!device) throw AppError.notFound('Device installation');
  if (!device.fcmToken) throw AppError.badRequest('This device has no registered push token');

  const result = await firebaseProvider.send({
    fcmToken: device.fcmToken,
    title: device.locale === 'bn' && campaign.titleBn ? campaign.titleBn : campaign.title,
    body: device.locale === 'bn' && campaign.bodyBn ? campaign.bodyBn : campaign.body,
    imageUrl: campaign.imageUrl,
    deepLink: campaign.deepLink,
    category: campaign.category,
    priority: campaign.priority,
    data: { testSend: 'true', campaignId: id },
  });

  if (result.ok) return { sent: true };
  return { sent: false, error: result.error };
}

export async function approveCampaign(id: string, approvedById: string) {
  const campaign = await getCampaignOrThrow(id);
  if (campaign.status !== 'draft' && campaign.status !== 'pending_approval') {
    throw AppError.badRequest(`Cannot approve a campaign in status "${campaign.status}"`);
  }
  return repo.setCampaignStatus(id, 'draft', { approvedById, approvedAt: new Date() });
}

async function dispatchCampaignNow(campaignId: string) {
  const campaign = await getCampaignOrThrow(campaignId);
  const userIds = await resolveAudienceUserIds(campaign.audienceType, campaign.audienceFilter as any);

  const result = await publishOutboxEvent({
    eventType: campaign.category === 'emergency' ? 'EMERGENCY_ALERT' : 'CAMPAIGN_UPDATED',
    entityType: 'notification_campaign',
    entityId: campaignId,
    dedupeKey: `admin_campaign_sent:${campaignId}`,
    payload: {
      category: campaign.category,
      priority: campaign.priority,
      title: campaign.title,
      titleBn: campaign.titleBn || undefined,
      body: campaign.body,
      bodyBn: campaign.bodyBn || undefined,
      imageUrl: campaign.imageUrl || undefined,
      deepLink: campaign.deepLink || undefined,
      targetUserIds: userIds,
      bypassPreferences: campaign.category === 'emergency',
      expiresAt: campaign.expiresAt?.toISOString(),
      campaignId,
    },
  });
  await enqueueIfNew(result);

  await repo.setCampaignStatus(campaignId, 'sending', { sentAt: new Date(), targetedCount: userIds.length });
}

export async function sendCampaignNow(id: string, requesterHasEmergencyPermission: boolean) {
  const campaign = await getCampaignOrThrow(id);

  if (campaign.category === 'emergency') {
    if (!requesterHasEmergencyPermission) {
      throw AppError.forbidden('Emergency broadcasts require the notification:emergency permission');
    }
  } else if (!campaign.approvedAt) {
    throw AppError.badRequest('Campaign must be approved before it can be sent');
  }

  if (!['draft', 'pending_approval', 'scheduled'].includes(campaign.status)) {
    throw AppError.badRequest(`Cannot send a campaign in status "${campaign.status}"`);
  }

  await dispatchCampaignNow(id);
  return { id, status: 'sending' };
}

export async function scheduleCampaign(id: string, dto: ScheduleCampaignDto) {
  const campaign = await getCampaignOrThrow(id);
  if (campaign.category !== 'emergency' && !campaign.approvedAt) {
    throw AppError.badRequest('Campaign must be approved before it can be scheduled');
  }
  const scheduledAt = new Date(dto.scheduledAt);
  if (scheduledAt.getTime() <= Date.now()) {
    throw AppError.badRequest('scheduledAt must be in the future');
  }
  return repo.setCampaignStatus(id, 'scheduled', { scheduledAt });
}

export async function cancelCampaign(id: string) {
  const campaign = await getCampaignOrThrow(id);
  if (!['scheduled', 'pending_approval', 'draft'].includes(campaign.status)) {
    throw AppError.badRequest(`Cannot cancel a campaign in status "${campaign.status}"`);
  }
  return repo.setCampaignStatus(id, 'cancelled', { cancelledAt: new Date() });
}

export async function getCampaignAnalytics(id: string) {
  const campaign = await getCampaignOrThrow(id);
  return {
    targetedCount: campaign.targetedCount,
    attemptedCount: campaign.attemptedCount,
    acceptedCount: campaign.acceptedCount,
    failedCount: campaign.failedCount,
    openedCount: campaign.openedCount,
    clickedCount: campaign.clickedCount,
  };
}

/**
 * Drains due scheduled campaigns — called on an interval from the worker
 * process (see src/jobs/scheduled-campaign-dispatch.job.ts).
 */
export async function dispatchDueScheduledCampaigns(): Promise<number> {
  const due = await prisma.notificationCampaign.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const campaign of due) {
    await dispatchCampaignNow(campaign.id);
  }
  return due.length;
}

// ─── Automation rules ──────────────────────────────────────────────

export async function listAutomationRules() {
  return repo.listAutomationRules();
}

export async function createAutomationRule(dto: CreateAutomationRuleDto, createdById: string) {
  return repo.createAutomationRule(dto, createdById);
}

export async function updateAutomationRule(id: string, dto: UpdateAutomationRuleDto) {
  const rule = await repo.findAutomationRuleById(id);
  if (!rule) throw AppError.notFound('Automation rule');
  return repo.updateAutomationRule(id, dto);
}

export async function deleteAutomationRule(id: string) {
  const rule = await repo.findAutomationRuleById(id);
  if (!rule) throw AppError.notFound('Automation rule');
  return repo.deleteAutomationRule(id);
}

// ─── Failed deliveries ───────────────────────────────────────────

export async function listFailedDeliveries(page: number, limit: number) {
  const { items, total } = await repo.listFailedDeliveries(page, limit);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function retryFailedDelivery(id: string) {
  const delivery = await repo.findDeliveryById(id);
  if (!delivery) throw AppError.notFound('Delivery');
  if (delivery.status === 'invalid_token') {
    throw AppError.badRequest('Cannot retry a delivery with an invalidated device token');
  }
  const updated = await repo.resetDeliveryForRetry(id);
  const { enqueueDelivery } = await import('../../queue/queues');
  await enqueueDelivery(id);
  return { id: updated.id, status: updated.status };
}

// ─── Audit ─────────────────────────────────────────────────────────

export async function listAuditTrail(page: number, limit: number) {
  const { items, total } = await repo.listCampaignAuditTrail(page, limit);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}
