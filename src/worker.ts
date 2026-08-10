import 'dotenv/config';
import http from 'http';
import { prisma } from './database/prisma';
import { closeRedisConnection, getRedisConnection } from './queue/redis';
import { createOutboxWorker } from './queue/workers/outbox.worker';
import { createDeliveryWorker } from './queue/workers/delivery.worker';
import { startPetReminderScanJob } from './jobs/pet-reminder-scan.job';
import { startMembershipExpiringReminderJob } from './jobs/membership-expiry.job';
import { startCampaignStartingSoonScanJob } from './jobs/campaign-starting-soon-scan.job';
import { startScheduledCampaignDispatchJob } from './jobs/scheduled-campaign-dispatch.job';
import { startSpayReminderScanJob } from './modules/spay-neuter/spay-neuter.notifications';

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  console.log('[Worker] Database connection established');

  const redis = getRedisConnection();
  await redis.ping();
  console.log('[Worker] Redis connection established');

  const outboxWorker = createOutboxWorker();
  const deliveryWorker = createDeliveryWorker();
  const reminderScanTimer = startPetReminderScanJob();
  const membershipExpiringTimer = startMembershipExpiringReminderJob();
  const campaignStartingSoonTimer = startCampaignStartingSoonScanJob();
  const scheduledCampaignDispatchTimer = startScheduledCampaignDispatchJob();
  const spayReminderTimer = startSpayReminderScanJob();

  console.log('[Worker] Notification outbox + delivery workers started');

  // Minimal HTTP health endpoint so this process can be probed the same way
  // as the API (readiness/liveness checks, load balancer, PM2, etc.).
  const healthPort = Number(process.env.WORKER_HEALTH_PORT) || 4100;
  const healthServer = http
    .createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            outboxWorkerRunning: outboxWorker.isRunning(),
            deliveryWorkerRunning: deliveryWorker.isRunning(),
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(healthPort, () => {
      console.log(`[Worker] Health endpoint listening on :${healthPort}/health`);
    });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Worker] Received ${signal}. Shutting down gracefully...`);
    clearInterval(reminderScanTimer);
    clearInterval(membershipExpiringTimer);
    clearInterval(campaignStartingSoonTimer);
    clearInterval(scheduledCampaignDispatchTimer);
    clearInterval(spayReminderTimer);
    healthServer.close();
    await Promise.all([outboxWorker.close(), deliveryWorker.close()]);
    await closeRedisConnection();
    await prisma.$disconnect();
    console.log('[Worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Worker] Failed to start:', err);
  process.exit(1);
});
