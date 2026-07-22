import { syncAllActiveMailboxes } from '../modules/mail/mailbox-sync.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startMailSyncJob(): NodeJS.Timeout {
  console.log(`[MailSyncJob] Starting — interval: ${SYNC_INTERVAL_MS / 60000}min`);
  
  // Run immediately on startup, then on interval
  syncAllActiveMailboxes().catch((err) => {
    console.error('[MailSyncJob] Initial sync failed:', err);
  });

  return setInterval(async () => {
    try {
      await syncAllActiveMailboxes();
    } catch (err) {
      console.error('[MailSyncJob] Unexpected error during sync cycle:', err);
    }
  }, SYNC_INTERVAL_MS);
}
