import { dispatchDueScheduledCampaigns } from '../modules/admin-push-notifications/admin-push-notifications.service';

const SCAN_INTERVAL_MS = 60 * 1000; // 1 minute — schedule granularity admins expect

export function startScheduledCampaignDispatchJob(): NodeJS.Timeout {
  dispatchDueScheduledCampaigns()
    .then((n) => n > 0 && console.log(`[ScheduledCampaignDispatch] dispatched ${n} due campaign(s)`))
    .catch((err) => console.error('[ScheduledCampaignDispatch] initial scan failed:', err));

  return setInterval(() => {
    dispatchDueScheduledCampaigns()
      .then((n) => n > 0 && console.log(`[ScheduledCampaignDispatch] dispatched ${n} due campaign(s)`))
      .catch((err) => console.error('[ScheduledCampaignDispatch] scan failed:', err));
  }, SCAN_INTERVAL_MS);
}
