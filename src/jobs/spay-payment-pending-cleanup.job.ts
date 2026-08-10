import { prisma } from '../database/prisma';
import { SPAY_PENDING_PAYMENT_MINUTES } from '../modules/spay-neuter/spay-neuter.domain';
import { expireStalePendingPaymentBooking } from '../modules/spay-neuter/spay-neuter.booking.service';

// Enforces the slot policy documented on SPAY_PENDING_PAYMENT_MINUTES
// (spay-neuter.domain.ts): a Spay & Neuter booking sits in `pending_payment`
// — occupying real clinic capacity, since that status is NOT in
// OCCUPYING_BOOKING_STATUSES_EXCLUDED — from the instant its hold converts
// until the BDT 500 advance is verified. Left unchecked, an owner who never
// completes payment (or an environment where EPS is simply unavailable)
// would block that slot forever. This job finds every booking past its
// computePaymentDueAt() deadline and cancels it, freeing the slot — mirrors
// campaign-cleanup.job.ts's runPendingPaymentCleanup for the campaign flow.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes — a tighter loop than the campaign job's 15min, since a live slot (not a waitlist) is being held hostage

async function runSpayPaymentPendingCleanup(): Promise<void> {
  const threshold = new Date(Date.now() - SPAY_PENDING_PAYMENT_MINUTES * 60_000);

  // computePaymentDueAt(createdAt) = createdAt + N minutes, so "past due"
  // is equivalent to "createdAt < now - N minutes" — computed once here
  // rather than per-row for the query, but expireStalePendingPaymentBooking
  // re-derives and trusts only the booking's own createdAt, never this
  // query's snapshot of "now".
  const stale = await prisma.spayBooking.findMany({
    where: { status: 'pending_payment', createdAt: { lt: threshold } },
    select: { id: true, bookingNumber: true },
  });

  if (stale.length === 0) return;

  console.log(`[SpayPaymentPendingCleanupJob] Expiring ${stale.length} stale pending_payment booking(s) past their ${SPAY_PENDING_PAYMENT_MINUTES}min payment window`);

  for (const booking of stale) {
    try {
      const expired = await expireStalePendingPaymentBooking(booking.id);
      if (expired) {
        console.log(`[SpayPaymentPendingCleanupJob] Expired booking ${booking.bookingNumber} — payment window elapsed, slot released`);
      }
    } catch (err) {
      console.error(`[SpayPaymentPendingCleanupJob] Error expiring booking ${booking.id}:`, err);
    }
  }
}

export function startSpayPaymentPendingCleanupJob(): NodeJS.Timeout {
  console.log(`[SpayPaymentPendingCleanupJob] Starting — payment window: ${SPAY_PENDING_PAYMENT_MINUTES}min, interval: ${CLEANUP_INTERVAL_MS / 60000}min`);
  runSpayPaymentPendingCleanup();
  return setInterval(runSpayPaymentPendingCleanup, CLEANUP_INTERVAL_MS);
}
