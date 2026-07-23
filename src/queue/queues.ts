import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis';

export const OUTBOX_QUEUE_NAME = 'notification-outbox';
export const DELIVERY_QUEUE_NAME = 'notification-delivery';

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86_400 * 7 },
};

let outboxQueue: Queue | null = null;
let deliveryQueue: Queue | null = null;

export function getOutboxQueue(): Queue {
  if (!outboxQueue) {
    outboxQueue = new Queue(OUTBOX_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }
  return outboxQueue;
}

export function getDeliveryQueue(): Queue {
  if (!deliveryQueue) {
    deliveryQueue = new Queue(DELIVERY_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }
  return deliveryQueue;
}

/**
 * Enqueue draining of a single outbox event. Job id = event id, so
 * re-enqueuing the same event (e.g. a duplicate publish call in the same
 * request cycle) is naturally deduplicated by BullMQ.
 */
export async function enqueueOutboxEvent(outboxEventId: string): Promise<void> {
  await getOutboxQueue().add(
    'process-outbox-event',
    { outboxEventId },
    { jobId: `outbox-${outboxEventId}` },
  );
}

export async function enqueueDelivery(deliveryId: string): Promise<void> {
  await getDeliveryQueue().add(
    'send-push',
    { deliveryId },
    { jobId: `delivery-${deliveryId}` },
  );
}

export function createQueueEvents(queueName: string): QueueEvents {
  return new QueueEvents(queueName, { connection: getRedisConnection() });
}
