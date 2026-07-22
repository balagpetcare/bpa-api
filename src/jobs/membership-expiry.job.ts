import { prisma } from '../database/prisma';
import { writeAuditLog, type AuditContext } from '../utils/audit';

const BATCH_SIZE = 100;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour

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
