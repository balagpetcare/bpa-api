import { prisma } from '../database/prisma';
import { sendSms } from './sms.service';

/**
 * Sends an SMS and increments totalSmsSent / totalSmsFailed on the campaign analytics row.
 * Fire-and-forget: never throws. campaignId is required for counter tracking.
 */
export function sendCampaignSms(opts: {
  to: string;
  message: string;
  campaignId: string;
}): void {
  sendSms({ to: opts.to, message: opts.message })
    .then(() => {
      prisma.campaignAnalytics.upsert({
        where: { campaignId: opts.campaignId },
        update: { totalSmsSent: { increment: 1 } },
        create: { campaignId: opts.campaignId, totalSmsSent: 1 },
      }).catch(() => { /* analytics failure is non-critical */ });
    })
    .catch(() => {
      prisma.campaignAnalytics.upsert({
        where: { campaignId: opts.campaignId },
        update: { totalSmsFailed: { increment: 1 } },
        create: { campaignId: opts.campaignId, totalSmsFailed: 1 },
      }).catch(() => { /* analytics failure is non-critical */ });
    });
}
