import crypto from 'crypto';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { sendCampaignSms } from '../../services/campaign-sms.service';
import type { BulkSmsDto, BulkSmsPreviewDto } from './participants.types';

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function computeTemplateHash(template: string): string {
  return crypto.createHash('sha256').update(template, 'utf8').digest('hex');
}

function buildDedupeKey(campaignId: string, templateHash: string, filterJson: string): string {
  const raw = `${campaignId}:${templateHash}:${filterJson}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function validateTemplate(template: string): void {
  if (template.length > 5000) {
    throw AppError.badRequest('SMS template exceeds maximum length of 5000 characters');
  }
}

interface ParticipantInfo {
  id: string;
  bookingNumber: string;
  ownerName: string;
  mobile: string;
  campaignTitle: string;
  sessionDate: string;
  venueName: string;
  paymentStatus: string;
}

async function fetchParticipantsForSms(
  campaignId: string,
  filters: BulkSmsDto['filters'],
): Promise<ParticipantInfo[]> {
  const conditions: string[] = ['cr.campaign_id = $1::uuid'];
  const params: any[] = [campaignId];
  let idx = 2;

  if (filters.search) {
    conditions.push(`(cr.booking_number ILIKE $${idx} OR po.owner_name ILIKE $${idx} OR po.mobile ILIKE $${idx} OR po.email ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.paymentStatus) {
    conditions.push(`pay.status = $${idx}`);
    params.push(filters.paymentStatus);
    idx++;
  }
  if (filters.registrationStatus) {
    conditions.push(`cr.status = $${idx}`);
    params.push(filters.registrationStatus);
    idx++;
  }
  if (filters.sessionId) {
    conditions.push(`cr.session_id = $${idx}::uuid`);
    params.push(filters.sessionId);
    idx++;
  }
  if (filters.venueId) {
    conditions.push(`cs.venue_id = $${idx}::uuid`);
    params.push(filters.venueId);
    idx++;
  }
  if (filters.dateFrom) {
    conditions.push(`cr.created_at >= $${idx}::timestamp`);
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    conditions.push(`cr.created_at <= $${idx}::timestamp`);
    params.push(filters.dateTo);
    idx++;
  }
  if (filters.onlyFailedPayment) {
    conditions.push(`(pay.status = 'failed' OR pay.status = 'cancelled')`);
  }
  if (filters.onlyPendingPayment) {
    conditions.push(`(pay.status IS NULL OR pay.status = 'pending')`);
  }

  const whereClause = conditions.join(' AND ');

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
    SELECT DISTINCT ON (cr.id)
      cr.id,
      cr.booking_number,
      po.owner_name,
      po.mobile,
      c.title AS campaign_title,
      cs.session_date,
      v.name AS venue_name,
      COALESCE(pay.status, 'none') AS payment_status
    FROM campaign_registrations cr
    INNER JOIN pet_owners po ON po.id = cr.owner_id
    INNER JOIN campaigns c ON c.id = cr.campaign_id
    INNER JOIN campaign_sessions cs ON cs.id = cr.session_id
    INNER JOIN venues v ON v.id = cs.venue_id
    LEFT JOIN payments pay ON pay.id = cr.payment_id
    WHERE ${whereClause}
    ORDER BY cr.id
  `, ...params);

  return rows.map((r: any) => ({
    id: String(r.id),
    bookingNumber: String(r.booking_number || ''),
    ownerName: String(r.owner_name || ''),
    mobile: String(r.mobile || ''),
    campaignTitle: String(r.campaign_title || ''),
    sessionDate: r.session_date ? new Date(r.session_date).toISOString().split('T')[0] : '',
    venueName: String(r.venue_name || ''),
    paymentStatus: String(r.payment_status || ''),
  }));
}

export async function previewBulkSms(
  campaignId: string,
  dto: BulkSmsPreviewDto,
  _userId: string,
) {
  validateTemplate(dto.template);
  const participants = await fetchParticipantsForSms(campaignId, dto.filters);
  const sampleSize = Math.min(3, participants.length);
  const previews = participants.slice(0, sampleSize).map((p) => ({
    bookingNumber: p.bookingNumber,
    ownerName: p.ownerName,
    mobile: p.mobile,
    rendered: renderTemplate(dto.template, {
      ownerName: p.ownerName,
      campaignTitle: p.campaignTitle,
      sessionDate: p.sessionDate,
      venueName: p.venueName,
      bookingRef: p.bookingNumber,
      paymentStatus: p.paymentStatus,
    }),
  }));

  return {
    totalRecipients: participants.length,
    previews,
    template: dto.template,
  };
}

export async function sendBulkSms(
  campaignId: string,
  dto: BulkSmsDto,
  userId: string,
) {
  if (!dto.confirmation) {
    throw AppError.badRequest('Confirmation required before sending bulk SMS');
  }

  validateTemplate(dto.template);

  // Compute unique dedupe key
  const templateHash = computeTemplateHash(dto.template);
  const filterJson = JSON.stringify(dto.filters);
  const dedupeKey = buildDedupeKey(campaignId, templateHash, filterJson);

  // Check for existing batch with same dedupe key
  const existing = await prisma.bulkSmsBatch.findUnique({ where: { dedupeKey } });
  if (existing) {
    throw AppError.badRequest(`Bulk SMS already sent to this filter set (batch: ${existing.id})`);
  }

  // Fetch participants
  const participants = await fetchParticipantsForSms(campaignId, dto.filters);

  // If specific IDs were selected, filter to those
  let recipients = participants;
  if (dto.filters.selectedIds && dto.filters.selectedIds.length > 0) {
    const selectedSet = new Set(dto.filters.selectedIds);
    recipients = participants.filter((p) => selectedSet.has(p.id));
  }

  if (recipients.length === 0) {
    throw AppError.badRequest('No recipients match the filters');
  }

  if (dto.previewCount !== recipients.length) {
    throw AppError.badRequest(
      `Recipient count mismatch: expected ${dto.previewCount} but found ${recipients.length}. Preview first.`,
    );
  }

  // Create batch record
  const batch = await prisma.bulkSmsBatch.create({
    data: {
      campaignId,
      createdById: userId,
      template: dto.template,
      templateHash,
      filters: dto.filters as any,
      recipientCount: recipients.length,
      status: 'processing',
      dedupeKey,
    },
  });

  // Fire-and-forget: queue SMS for each recipient
  let queuedCount = 0;
  let failedCount = 0;

  for (const p of recipients) {
    const rendered = renderTemplate(dto.template, {
      ownerName: p.ownerName,
      campaignTitle: p.campaignTitle,
      sessionDate: p.sessionDate,
      venueName: p.venueName,
      bookingRef: p.bookingNumber,
      paymentStatus: p.paymentStatus,
    });

    try {
      await sendCampaignSms({
        to: p.mobile,
        message: rendered,
        campaignId,
      });

      // Log the SMS
      await prisma.smsLog.create({
        data: {
          to: p.mobile,
          body: rendered,
          messageType: 'campaign_bulk_sms',
          module: 'campaign_registration',
          entityType: 'CampaignRegistration',
          entityId: p.id,
          reference: p.bookingNumber,
          status: 'queued',
          provider: 'bulksmsbd',
          idempotencyKey: `${dedupeKey}:${p.id}`,
        },
      });

      queuedCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.smsLog.create({
        data: {
          to: p.mobile,
          body: rendered,
          messageType: 'campaign_bulk_sms',
          module: 'campaign_registration',
          entityType: 'CampaignRegistration',
          entityId: p.id,
          reference: p.bookingNumber,
          status: 'failed',
          provider: 'bulksmsbd',
          idempotencyKey: `${dedupeKey}:${p.id}`,
          failureReason: errMsg.slice(0, 60),
        },
      });
      failedCount++;
    }
  }

  // Update batch record
  await prisma.bulkSmsBatch.update({
    where: { id: batch.id },
    data: {
      queuedCount,
      failedCount,
      status: failedCount > 0 && queuedCount === 0 ? 'failed' : queuedCount > 0 ? 'completed' : 'partial_failure',
    },
  });

  return {
    batchId: batch.id,
    recipientCount: recipients.length,
    queuedCount,
    failedCount,
  };
}

export async function getBulkSmsHistory(campaignId: string) {
  return prisma.bulkSmsBatch.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      template: true,
      filters: true,
      recipientCount: true,
      queuedCount: true,
      failedCount: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
}
