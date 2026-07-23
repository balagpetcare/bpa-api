import { prisma } from '../database/prisma';
import { writeAuditLog, type AuditContext } from '../utils/audit';
import { publishOutboxEvent } from '../modules/push-notifications/outbox';

const BATCH_SIZE = 100;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour
const EXPIRING_REMINDER_OFFSETS_DAYS = [30, 7, 1] as const;
const EXPIRING_REMINDER_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/**
 * Emits MEMBERSHIP_EXPIRING at {30, 7, 1} days before validUntil — distinct
 * from runMembershipExpiryJob() above, which transitions already-past
 * memberships to 'expired'. Runs from the notification worker process
 * (see src/worker.ts), not the API process, since it only produces
 * notifications rather than mutating membership state.
 */
export async function runMembershipExpiringReminderScan(): Promise<number> {
  let emitted = 0;
  const now = new Date();

  for (const offsetDays of EXPIRING_REMINDER_OFFSETS_DAYS) {
    const targetDate = new Date(now);
    targetDate.setUTCHours(0, 0, 0, 0);
    targetDate.setUTCDate(targetDate.getUTCDate() + offsetDays);
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const expiring = await prisma.membership.findMany({
      where: { status: 'active', validUntil: { gte: targetDate, lt: nextDay } },
      select: { id: true, membershipNumber: true, userId: true, validUntil: true },
    });

    for (const membership of expiring) {
      if (!membership.userId) continue;
      const dedupeKey = `membership_expiring:${membership.id}:${offsetDays}d`;
      await publishOutboxEvent({
        eventType: 'MEMBERSHIP_EXPIRING',
        entityType: 'membership',
        entityId: membership.id,
        dedupeKey,
        payload: {
          category: 'membership',
          priority: offsetDays <= 1 ? 'high' : 'normal',
          title: `Your membership expires in ${offsetDays} day${offsetDays === 1 ? '' : 's'}`,
          titleBn: `আপনার সদস্যপদ ${offsetDays} দিনের মধ্যে মেয়াদ শেষ হবে`,
          body: `Membership ${membership.membershipNumber} expires on ${membership.validUntil?.toISOString().slice(0, 10)}. Renew to keep your benefits.`,
          bodyBn: `সদস্যপদ ${membership.membershipNumber} ${membership.validUntil?.toISOString().slice(0, 10)} তারিখে মেয়াদ শেষ হবে। সুবিধা বজায় রাখতে নবায়ন করুন।`,
          deepLink: 'bpa://membership/card',
          targetUserIds: [membership.userId],
        },
      });
      emitted++;
    }
  }

  return emitted;
}

let expiringReminderHandle: NodeJS.Timeout | null = null;

export function startMembershipExpiringReminderJob(): NodeJS.Timeout {
  runMembershipExpiringReminderScan()
    .then((n) => console.log(`[MembershipExpiringReminder] initial scan: ${n} events`))
    .catch((err) => console.error('[MembershipExpiringReminder] initial scan failed:', err));

  expiringReminderHandle = setInterval(() => {
    runMembershipExpiringReminderScan()
      .then((n) => console.log(`[MembershipExpiringReminder] scan: ${n} events`))
      .catch((err) => console.error('[MembershipExpiringReminder] scan failed:', err));
  }, EXPIRING_REMINDER_SCAN_INTERVAL_MS);

  return expiringReminderHandle;
}

/**
 * Finds active memberships with validUntil in the past and marks them as expired.
 * Idempotent: safe to run repeatedly. Skips already-expired/cancelled records.
 */
async function runMembershipExpiryJob(): Promise<void> {
  const now = new Date();
  let processed = 0;
  let expired = 0;

  try {
    // Find all active memberships past their validity date
    const toExpire = await prisma.membership.findMany({
      where: {
        status: 'active',
        validUntil: { lt: now },
        membershipRecordStatus: { not: 'expired' },
      },
      select: {
        id: true,
        membershipNumber: true,
        userId: true,
        validUntil: true,
      },
      take: BATCH_SIZE,
    });

    if (toExpire.length === 0) {
      console.log('[MembershipExpiryJob] No memberships to expire');
      return;
    }

    console.log(`[MembershipExpiryJob] Expiring ${toExpire.length} membership(s)`);

    for (const membership of toExpire) {
      try {
        await prisma.membership.update({
          where: { id: membership.id },
          data: {
            status: 'expired',
            membershipRecordStatus: 'expired',
          },
        });

        // Audit log the expiry
        const ctx: AuditContext = {
          ipAddress: '[SYSTEM]',
          userAgent: '[MEMBERSHIP_EXPIRY_JOB]',
        };
        await writeAuditLog({
          resource: 'membership_auto_expire',
          action: 'auto_expire' as any,
          resourceId: membership.id,
          newValues: {
            status: 'expired',
            validUntil: membership.validUntil?.toISOString() || 'unknown',
          },
        }, ctx);

        expired++;
        console.log(
          `[MembershipExpiryJob] Expired membership ${membership.membershipNumber} (${membership.id})`,
        );
      } catch (err) {
        console.error(
          `[MembershipExpiryJob] Error expiring membership ${membership.id}:`,
          err,
        );
        // Continue processing other memberships even if one fails
      }
    }

    processed = toExpire.length;

    // If we processed a full batch, there may be more — log for monitoring
    if (processed === BATCH_SIZE) {
      console.log(
        `[MembershipExpiryJob] Processed full batch (${BATCH_SIZE}) — may be more pending`,
      );
    }
  } catch (err) {
    console.error('[MembershipExpiryJob] Unexpected error:', err);
  }

  console.log(
    `[MembershipExpiryJob] Completed: ${expired} memberships expired out of ${processed} processed`,
  );
}

/**
 * Starts the membership expiry job.
 * Runs immediately on startup, then on the configured interval.
 * Safe to call multiple times (subsequent calls are no-ops).
 */
let expiryJobHandle: NodeJS.Timeout | null = null;

export function startMembershipExpiryJob(): void {
  if (expiryJobHandle !== null) {
    console.log('[MembershipExpiryJob] Already running, skipping duplicate start');
    return;
  }

  console.log(
    `[MembershipExpiryJob] Starting — batch size: ${BATCH_SIZE}, interval: ${CLEANUP_INTERVAL_MS / 60000}min`,
  );

  // Run immediately on startup
  runMembershipExpiryJob();

  // Then run on interval
  expiryJobHandle = setInterval(runMembershipExpiryJob, CLEANUP_INTERVAL_MS);
}

export function stopMembershipExpiryJob(): void {
  if (expiryJobHandle !== null) {
    clearInterval(expiryJobHandle);
    expiryJobHandle = null;
    console.log('[MembershipExpiryJob] Stopped');
  }
}

/**
 * One-time execution for testing/backfill
 */
export async function runMembershipExpiryJobOnce(): Promise<{ processed: number; expired: number }> {
  console.log('[MembershipExpiryJob] Running one-time execution');
  const now = new Date();

  const toExpire = await prisma.membership.findMany({
    where: {
      status: 'active',
      validUntil: { lt: now },
      membershipRecordStatus: { not: 'expired' },
    },
    select: { id: true, membershipNumber: true, validUntil: true },
  });

  let expired = 0;
  for (const membership of toExpire) {
    try {
      await prisma.membership.update({
        where: { id: membership.id },
        data: {
          status: 'expired',
          membershipRecordStatus: 'expired',
        },
      });
      expired++;
    } catch (err) {
      console.error(`Error expiring ${membership.id}:`, err);
    }
  }

  return { processed: toExpire.length, expired };
}
