import { expireStaleHolds } from '../modules/spay-neuter/spay-neuter.repository';

const CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

async function runSpayHoldCleanup(): Promise<void> {
  try {
    const expiredCount = await expireStaleHolds();
    if (expiredCount > 0) {
      console.log(`[SpayHoldCleanupJob] Expired ${expiredCount} stale slot hold(s)`);
    }
  } catch (err) {
    console.error('[SpayHoldCleanupJob] Error expiring stale holds:', err);
  }
}

export function startSpayHoldCleanupJob(): NodeJS.Timeout {
  console.log(`[SpayHoldCleanupJob] Starting — interval: ${CLEANUP_INTERVAL_MS / 60000}min`);
  runSpayHoldCleanup();
  return setInterval(runSpayHoldCleanup, CLEANUP_INTERVAL_MS);
}
