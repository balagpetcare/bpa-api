import { prisma } from '../../database/prisma';
import { formatBookingNumber } from './spay-neuter.domain';

// ─── Atomic capacity primitives ─────────────────────────────────────
//
// Mirrors campaign-registrations.repository.ts's reserveSlots/releaseSlots:
// every capacity mutation is a conditional raw UPDATE that asserts
// rowCount === 1 (or, here, compares affected rows to the expected count),
// never a read-then-write. This is the only correct way to allocate spay
// capacity under concurrent requests — see implementation-contract.md §4.3.

/**
 * Increments held_count on a slot iff doing so would not exceed capacity.
 * Returns true iff exactly one row was updated (i.e. the hold was granted).
 */
export async function reserveHold(slotId: string, petCount: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE spay_slots
    SET held_count = held_count + ${petCount}
    WHERE id = ${slotId}::uuid
      AND booked_count + held_count + ${petCount} <= capacity
      AND is_active = true
  `;
  return result === 1;
}

/** Releases a hold's reservation back to the slot (expiry, manual release, or failed booking). */
export async function releaseHold(slotId: string, petCount: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE spay_slots
    SET held_count = GREATEST(0, held_count - ${petCount})
    WHERE id = ${slotId}::uuid
  `;
}

/**
 * Moves capacity from held to booked atomically. Guarded on held_count so a
 * hold that was already swept as expired cannot be converted (defends
 * against the race between the expiry job and a late booking submission).
 */
export async function convertHoldToBooking(slotId: string, petCount: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE spay_slots
    SET held_count = held_count - ${petCount},
        booked_count = booked_count + ${petCount}
    WHERE id = ${slotId}::uuid
      AND held_count >= ${petCount}
  `;
  return result === 1;
}

/** Releases booked capacity back to the slot (cancellation, no-show handling). */
export async function releaseBookingSlot(slotId: string, petCount: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE spay_slots
    SET booked_count = GREATEST(0, booked_count - ${petCount})
    WHERE id = ${slotId}::uuid
  `;
}

/**
 * Sweeps every hold whose TTL has elapsed, flipping it to `expired`.
 *
 * For the interval-based scheduling engine (spay-neuter.scheduling.ts /
 * spay-neuter.hold.service.ts — the mechanism used for schedule-computed
 * candidate windows), flipping status is the ENTIRE fix: capacity is
 * computed live from `status = 'active'` hold/booking rows on every check,
 * so an expired hold simply stops being counted — there is no counter to
 * decrement. The legacy `spay_slots.held_count` decrement below only
 * applies when the hold originated from a manual slot (slotId present);
 * it is a no-op (guarded) for schedule-computed holds, which never have a
 * slotId. Intended to be called both by the periodic worker job and lazily
 * on read (see spay-neuter.domain.ts:isHoldUsable) so an unswept hold never
 * blocks a booking even if the worker is down.
 */
export async function expireStaleHolds(now: Date = new Date()): Promise<number> {
  const staleHolds = await prisma.spaySlotHold.findMany({
    where: { status: 'active', expiresAt: { lt: now } },
    select: { id: true, slotId: true, petCount: true },
  });

  let expiredCount = 0;
  for (const hold of staleHolds) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.spaySlotHold.updateMany({
        where: { id: hold.id, status: 'active' },
        data: { status: 'expired' },
      });
      if (updated.count === 1) {
        if (hold.slotId) {
          await tx.$executeRaw`
            UPDATE spay_slots
            SET held_count = GREATEST(0, held_count - ${hold.petCount})
            WHERE id = ${hold.slotId}::uuid
          `;
        }
        expiredCount += 1;
      }
    });
  }
  return expiredCount;
}

// ─── Booking number ──────────────────────────────────────────────────

/**
 * Atomic, collision-free booking number via a Postgres sequence — NOT
 * count()+1 (see campaign-registrations.repository.ts:generateBookingNumber,
 * which is race-prone under concurrency; this deliberately avoids repeating
 * that bug for the spay/neuter domain).
 */
export async function generateSpayBookingNumber(date: Date = new Date()): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('spay_booking_number_seq')
  `;
  return formatBookingNumber(date, rows[0].nextval);
}
