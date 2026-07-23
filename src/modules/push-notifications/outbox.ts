import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { enqueueOutboxEvent } from '../../queue/queues';

export type DomainEventType =
  | 'VIDEO_PUBLISHED'
  | 'POST_PUBLISHED'
  | 'CAMPAIGN_PUBLISHED'
  | 'CAMPAIGN_STARTING_SOON'
  | 'CAMPAIGN_UPDATED'
  | 'BOOKING_CONFIRMED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'CERTIFICATE_READY'
  | 'MEMBERSHIP_EXPIRING'
  | 'PET_VACCINATION_DUE'
  | 'PET_VACCINATION_OVERDUE'
  | 'PET_DEWORMING_DUE'
  | 'PET_GROOMING_DUE'
  | 'PET_MEDICAL_FOLLOWUP'
  | 'EMERGENCY_ALERT';

export type PublishOutboxEventInput = {
  eventType: DomainEventType;
  entityType?: string;
  entityId?: string;
  /**
   * Deterministic dedup key — must be the same for logically-identical
   * events (e.g. `video_published:<videoId>`, or for reminders
   * `pet_vaccination_due:<petId>:<vaccinationId>:<dueDate>`), so re-firing
   * the same trigger never creates a second outbox row (unique constraint).
   */
  dedupeKey: string;
  payload: Record<string, unknown>;
};

/**
 * Writes an outbox row inside the caller's transaction (pass `tx`), or
 * standalone if omitted. Enqueues the BullMQ drain job only after the
 * transaction commits so a rollback never orphans a queued job pointing at
 * a nonexistent row.
 */
export async function publishOutboxEvent(
  input: PublishOutboxEventInput,
  tx?: Prisma.TransactionClient,
): Promise<{ id: string; deduped: boolean }> {
  const client = tx ?? prisma;

  try {
    const event = await client.notificationOutboxEvent.create({
      data: {
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });

    // When called inside a transaction, the caller must await
    // enqueueIfNew(result) themselves once the transaction has committed —
    // enqueuing here would race a job against a not-yet-durable row.
    if (!tx) {
      await enqueueOutboxEvent(event.id);
    }

    return { id: event.id, deduped: false };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Unique constraint on dedupeKey — this exact logical event was
      // already recorded; treat as success, not an error.
      const existing = await client.notificationOutboxEvent.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      return { id: existing?.id ?? '', deduped: true };
    }
    throw err;
  }
}

/**
 * Call after a transaction that used publishOutboxEvent(..., tx) commits,
 * to actually enqueue the drain job. Usage:
 *   const result = await prisma.$transaction(async (tx) => {
 *     ...domain writes...
 *     return publishOutboxEvent({...}, tx);
 *   });
 *   await enqueueIfNew(result);
 */
export async function enqueueIfNew(result: { id: string; deduped: boolean }): Promise<void> {
  if (result.id && !result.deduped) {
    await enqueueOutboxEvent(result.id);
  }
}
