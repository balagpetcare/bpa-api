import { prisma } from '../database/prisma';
import { cancelRegistration, promoteNextWaitlistEntry } from '../modules/campaign-registrations/campaign-registrations.repository';

const PENDING_PAYMENT_THRESHOLD_HOURS = Number(process.env.PENDING_PAYMENT_CLEANUP_HOURS ?? '2');
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

/**
 * Finds stale pending_payment registrations older than threshold, cancels them,
 * releases capacity slots, and attempts to promote the next waitlist entry.
 */
async function runPendingPaymentCleanup(): Promise<void> {
  const threshold = new Date(Date.now() - PENDING_PAYMENT_THRESHOLD_HOURS * 60 * 60 * 1000);

  const stale = await prisma.campaignRegistration.findMany({
    where: { status: 'pending_payment', createdAt: { lt: threshold } },
    select: { id: true, sessionId: true, petBookings: { select: { id: true } } },
  });

  if (stale.length === 0) return;

  console.log(`[CampaignCleanupJob] Cancelling ${stale.length} stale pending_payment registration(s)`);

  for (const reg of stale) {
    try {
      await cancelRegistration(reg.id);
      // After releasing slots, try to promote next waitlist entry for the same session
      const released = reg.petBookings.length;
      const promoted = await promoteNextWaitlistEntry(reg.sessionId, released);
      if (promoted) {
        console.log(`[CampaignCleanupJob] Promoted waitlist entry ${promoted.id} for session ${reg.sessionId}`);
      }
    } catch (err) {
      console.error(`[CampaignCleanupJob] Error cancelling registration ${reg.id}:`, err);
    }
  }
}

/**
 * Expires promoted waitlist entries whose expiresAt has passed without registration.
 */
async function runWaitlistExpiryCleanup(): Promise<void> {
  const expired = await prisma.campaignWaitlist.findMany({
    where: {
      status: 'promoted',
      expiresAt: { lt: new Date() },
    },
    select: { id: true, sessionId: true, petCount: true },
  });

  if (expired.length === 0) return;

  console.log(`[CampaignCleanupJob] Expiring ${expired.length} promoted waitlist entries`);

  for (const entry of expired) {
    try {
      await prisma.campaignWaitlist.update({
        where: { id: entry.id },
        data: { status: 'expired' },
      });
      // Try to promote next entry in the queue
      const promoted = await promoteNextWaitlistEntry(entry.sessionId, entry.petCount);
      if (promoted) {
        console.log(`[CampaignCleanupJob] Promoted next waitlist entry ${promoted.id} for session ${entry.sessionId}`);
      }
    } catch (err) {
      console.error(`[CampaignCleanupJob] Error expiring waitlist entry ${entry.id}:`, err);
    }
  }
}

async function runAllJobs(): Promise<void> {
  try {
    await runPendingPaymentCleanup();
    await runWaitlistExpiryCleanup();
  } catch (err) {
    console.error('[CampaignCleanupJob] Unexpected error:', err);
  }
}

export function startCampaignCleanupJob(): NodeJS.Timeout {
  console.log(`[CampaignCleanupJob] Starting — cleanup threshold: ${PENDING_PAYMENT_THRESHOLD_HOURS}h, interval: ${CLEANUP_INTERVAL_MS / 60000}min`);
  // Run immediately on startup, then on interval
  runAllJobs();
  return setInterval(runAllJobs, CLEANUP_INTERVAL_MS);
}
