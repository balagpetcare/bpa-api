import 'dotenv/config';

import { config } from './config';
import app from './app';
import { prisma } from './database/prisma';
import { startCampaignCleanupJob } from './jobs/campaign-cleanup.job';
import { startSpayPaymentPendingCleanupJob } from './jobs/spay-payment-pending-cleanup.job';
import { startSpayHoldCleanupJob } from './jobs/spay-hold-cleanup.job';
import { startMailSyncJob } from './jobs/mail-sync.job';
import { startMembershipExpiryJob } from './jobs/membership-expiry.job';
import { checkStorageHealth } from './storage/storage.service';
import { validateEPSStartup } from './services/eps.service';

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  console.log('Database connection established');

  try {
    await checkStorageHealth();
    console.log(`Storage backend initialized (${config.STORAGE_DRIVER})`);
  } catch (err: any) {
    console.warn(`[WARNING] Storage health check failed: ${err.message}`);
    if (config.NODE_ENV === 'production') {
      console.error('CRITICAL: Storage must be healthy in production.');
      process.exit(1);
    }
    console.warn('Continuing in development mode, but media uploads will likely fail.');
  }

  validateEPSStartup();
  const cleanupTimer = startCampaignCleanupJob();
  const spayPaymentPendingTimer = startSpayPaymentPendingCleanupJob();
  const spayHoldTimer = startSpayHoldCleanupJob();
  const syncTimer = startMailSyncJob();
  startMembershipExpiryJob();

  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`BPA API running on port ${config.PORT} [${config.NODE_ENV}]`);
    // Signal PM2 that this worker is ready to receive traffic (cluster mode).
    // Optional chaining prevents a crash when running outside PM2 (tests, Docker).
    process.send?.('ready');
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    clearInterval(cleanupTimer);
    clearInterval(spayPaymentPendingTimer);
    clearInterval(spayHoldTimer);
    clearInterval(syncTimer);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('Database disconnected');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

