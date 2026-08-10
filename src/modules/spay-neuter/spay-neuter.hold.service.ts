import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { HTTP_STATUS } from '../../config/constants';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import {
  assertClinicParticipatesInOffer,
  fetchDayWindowInputs,
  fetchOccupyingIntervals,
  loadClinicServiceContext,
} from './spay-neuter.availability.service';
import { hasCapacity, resolveDayWindows } from './spay-neuter.scheduling';
import { dhakaWallClockToUtc, toDhakaDateString } from './spay-neuter.timezone';
import { assertOfferBookable, isWithinAnyWindow, toServiceTypeCode } from './spay-neuter.domain';
import type { SpayProcedureKind } from './spay-neuter.types';
import { archiveSpayReminderNotifications, notifySpayRescheduled } from './spay-neuter.notifications';

// ─── Locking strategy ────────────────────────────────────────────────
//
// A Postgres session-scoped advisory lock (`pg_advisory_xact_lock`), keyed by
// hashtext("spay:<clinicBranchId>:<Asia/Dhaka date>"), taken at the start of
// the transaction and released automatically on commit/rollback. This
// serializes every hold/booking/reschedule attempt for the SAME clinic on
// the SAME calendar day — exactly the granularity that matters, since
// capacity is checked per clinic per day — while leaving other clinics and
// other dates fully concurrent. It is deliberately coarser than row locking
// because there is no longer a single "capacity row" to lock (see
// spay-neuter.scheduling.ts): capacity is derived live from whichever hold/
// booking rows exist, so the thing that needs serializing is the
// read-check-then-write sequence itself, not a particular row.
async function withClinicDateLock<T>(
  tx: Prisma.TransactionClient,
  clinicBranchId: string,
  dateStr: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `spay:${clinicBranchId}:${dateStr}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  return fn();
}

function assertEligibleWindow(
  freeWindows: { start: Date; end: Date }[],
  candidateStart: Date,
  candidateEnd: Date,
): void {
  if (!isWithinAnyWindow(freeWindows, candidateStart, candidateEnd)) {
    throw AppError.badRequest(
      'This time is not within the clinic\'s bookable schedule (closed, on break, or blocked)',
      'SLOT_UNAVAILABLE',
    );
  }
}

export type CreateHoldInput = {
  offerId: string;
  clinicBranchId: string;
  procedure: SpayProcedureKind;
  startAt: Date;
  centralAuthUserId: string;
  petCount?: number;
  idempotencyKey: string;
};

/**
 * Creates a slot hold. Every input from the client — including anything
 * that resembles a cached availabilityId — is re-validated against a fresh
 * database read inside the lock; nothing about a previously returned
 * availability listing is trusted here.
 */
export async function createHold(input: CreateHoldInput) {
  const petCount = input.petCount ?? 1;

  // Idempotent replay: a prior successful call with the same key returns
  // its result again rather than erroring or double-booking.
  const existing = await prisma.spaySlotHold.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const now = new Date();
  if (input.startAt.getTime() <= now.getTime()) {
    throw AppError.badRequest('Cannot book a time in the past', 'SPAY_PAST_TIME');
  }

  const offer = await prisma.spayOffer.findUnique({ where: { id: input.offerId } });
  if (!offer) throw AppError.notFound('Offer');
  assertOfferBookable(offer, now, input.startAt);

  const clinicBranch = await prisma.clinicBranch.findUnique({ where: { id: input.clinicBranchId } });
  if (!clinicBranch || clinicBranch.archivedAt) {
    throw AppError.badRequest('This clinic is not currently active', 'SPAY_CLINIC_INACTIVE');
  }
  // A clinic can have its own SpayClinicProfile/services configured without
  // ever having been linked to THIS offer — participation is a distinct,
  // admin-controlled fact (SpayOfferClinic) that must be revalidated here,
  // not assumed from clinic activity alone.
  await assertClinicParticipatesInOffer(input.offerId, input.clinicBranchId);

  const ctx = await loadClinicServiceContext(input.clinicBranchId, input.procedure);

  const maxStartAt = new Date(now.getTime() + ctx.bookingHorizonDays * 86_400_000);
  if (input.startAt.getTime() > maxStartAt.getTime()) {
    throw AppError.badRequest('This time is beyond the clinic\'s booking horizon', 'SPAY_BEYOND_HORIZON');
  }

  const candidateStart = input.startAt;
  const candidateEnd = new Date(candidateStart.getTime() + ctx.durationMinutes * 60_000);
  const dateStr = toDhakaDateString(candidateStart);

  const windowInputs = await fetchDayWindowInputs(ctx, dateStr);
  const freeWindows = resolveDayWindows(windowInputs);
  if (!isWithinAnyWindow(freeWindows, candidateStart, candidateEnd)) {
    // Distinguish "this exact time exists but is scheduled for the OTHER
    // procedure only" from "no window/capacity exists here for anyone" —
    // a materially more actionable error for the client than a flat 400.
    const otherProcedure: SpayProcedureKind = input.procedure === 'neuter' ? 'spay' : 'neuter';
    let eligibleForOther = false;
    try {
      const otherCtx = await loadClinicServiceContext(input.clinicBranchId, otherProcedure);
      const otherWindowInputs = await fetchDayWindowInputs(otherCtx, dateStr);
      const otherFreeWindows = resolveDayWindows(otherWindowInputs);
      const otherEnd = new Date(candidateStart.getTime() + otherCtx.durationMinutes * 60_000);
      eligibleForOther = isWithinAnyWindow(otherFreeWindows, candidateStart, otherEnd);
    } catch {
      eligibleForOther = false; // other procedure isn't offered here at all either
    }
    if (eligibleForOther) {
      throw AppError.badRequest(
        `This time is only bookable for ${toServiceTypeCode(otherProcedure)}, not ${toServiceTypeCode(input.procedure)}`,
        'SLOT_SERVICE_MISMATCH',
      );
    }
    throw AppError.badRequest(
      'This time is not within the clinic\'s bookable schedule (closed, on break, or blocked)',
      'SLOT_UNAVAILABLE',
    );
  }

  const dayStartUtc = dhakaWallClockToUtc(dateStr, '00:00');
  const dayEndUtc = new Date(dayStartUtc.getTime() + 86_400_000);

  try {
    return await prisma.$transaction(async (tx) => {
      return withClinicDateLock(tx, input.clinicBranchId, dateStr, async () => {
        // Re-fetch occupying intervals INSIDE the lock — this is the "do not
        // trust cached availability" guarantee: even the freeWindows/occupying
        // read done above (before the lock) is treated only as a fast-fail
        // pre-check. The authoritative check happens here, serialized.
        const occupying = await fetchOccupyingIntervals(
          input.clinicBranchId,
          ctx.clinicProfileId,
          dayStartUtc,
          dayEndUtc,
          undefined,
          new Date(),
        );

        if (!hasCapacity({ start: candidateStart, end: candidateEnd }, occupying, ctx.concurrentOperationCapacity)) {
          throw new AppError(HTTP_STATUS.CONFLICT, 'SPAY_SLOT_FULL', 'No capacity remains for this time');
        }

        return tx.spaySlotHold.create({
          data: {
            offerId: input.offerId,
            clinicBranchId: input.clinicBranchId,
            serviceId: ctx.serviceId,
            procedure: input.procedure,
            candidateStartAt: candidateStart,
            candidateEndAt: candidateEnd,
            centralAuthUserId: input.centralAuthUserId,
            petCount,
            status: 'active',
            expiresAt: new Date(Date.now() + ctx.slotHoldMinutes * 60_000),
            idempotencyKey: input.idempotencyKey,
          },
        });
      });
    });
  } catch (err) {
    // A concurrent request that won the idempotency-key race lands here as
    // a unique-constraint violation; treat it the same as the fast-path hit.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.spaySlotHold.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (winner) return winner;
    }
    throw err;
  }
}

// Owner-facing reschedule (an arbitrary new time, via /me) is only valid
// before the booking has entered any clinic-side workflow.
const OWNER_RESCHEDULABLE_STATUSES = ['pending_payment', 'confirmed'];

/**
 * Reschedules an existing booking to a new start time, under the same
 * clinic/date advisory lock, excluding the booking's own current interval
 * from the occupancy check (so shifting within an already-reserved window
 * never spuriously collides with itself).
 *
 * `allowedFromStatuses` defaults to OWNER_RESCHEDULABLE_STATUSES — pass a
 * wider set only for a trusted internal caller with its own additional
 * guard (see moveCheckedInBookingEarlier in spay-neuter.clinic-ops.service.ts,
 * which restricts itself to checked_in/pre_op_assessment/ready_for_operation
 * and only ever moves the time *earlier*, never to an arbitrary new slot).
 */
export async function rescheduleBooking(
  bookingId: string,
  newStartAt: Date,
  reason?: string,
  changedById?: string,
  auditCtx: AuditContext = {},
  allowedFromStatuses?: string[],
) {
  const now = new Date();
  if (newStartAt.getTime() <= now.getTime()) {
    throw AppError.badRequest('Cannot reschedule to a time in the past', 'SPAY_PAST_TIME');
  }

  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  // Default (owner-facing, via postReschedule) is deliberately narrow: only
  // a booking that hasn't started any clinic-side workflow yet may be freely
  // rescheduled to an arbitrary new time. Once the pet is checked in,
  // mid pre-op assessment, ready for operation, or actually in surgery, an
  // owner-initiated "pick any new time" must be rejected — this was
  // previously only excluding terminal statuses, which meant an owner could
  // reschedule a booking while their pet was on the operating table.
  // moveCheckedInBookingEarlier (clinic staff, "move earlier" override only)
  // passes its own narrower, earlier-only allowlist explicitly.
  const allowedFrom = allowedFromStatuses ?? OWNER_RESCHEDULABLE_STATUSES;
  if (!allowedFrom.includes(booking.status)) {
    throw AppError.badRequest(`Cannot reschedule a ${booking.status} booking`, 'SPAY_BOOKING_NOT_RESCHEDULABLE');
  }

  const ctx = await loadClinicServiceContext(booking.clinicBranchId, booking.procedure);
  const newEnd = new Date(newStartAt.getTime() + booking.durationMinutesSnapshot * 60_000);
  const dateStr = toDhakaDateString(newStartAt);

  const windowInputs = await fetchDayWindowInputs(ctx, dateStr);
  const freeWindows = resolveDayWindows(windowInputs);
  assertEligibleWindow(freeWindows, newStartAt, newEnd);

  const dayStartUtc = dhakaWallClockToUtc(dateStr, '00:00');
  const dayEndUtc = new Date(dayStartUtc.getTime() + 86_400_000);

  const updated = await prisma.$transaction(async (tx) => {
    return withClinicDateLock(tx, booking.clinicBranchId, dateStr, async () => {
      const occupying = await fetchOccupyingIntervals(
        booking.clinicBranchId,
        ctx.clinicProfileId,
        dayStartUtc,
        dayEndUtc,
        booking.id, // exclude the booking's own current interval
        new Date(),
      );

      if (!hasCapacity({ start: newStartAt, end: newEnd }, occupying, ctx.concurrentOperationCapacity)) {
        throw new AppError(HTTP_STATUS.CONFLICT, 'SPAY_SLOT_FULL', 'No capacity remains for the requested time');
      }

      const arriveByAt = new Date(newStartAt.getTime() - ctx.arriveBeforeMinutes * 60_000);
      const checkinOpensAt = new Date(newStartAt.getTime() - ctx.checkinEarlyMinutes * 60_000);
      const cancellationCutoffAt = new Date(newStartAt.getTime() - ctx.cancellationCutoffHours * 3_600_000);

      // Status is deliberately NOT touched here — a reschedule changes only
      // the time. Forcing 'confirmed' would wrongly mark a still-unpaid
      // pending_payment booking as paid; forcing anything else would
      // regress a genuinely confirmed one. Price, advance, balance, and
      // payment linkage snapshots are likewise never touched.
      const updated = await tx.spayBooking.update({
        where: { id: booking.id },
        data: {
          scheduledStartAt: newStartAt,
          scheduledEndAt: newEnd,
          arriveByAt,
          checkinOpensAt,
          cancellationCutoffAt,
          rescheduleCount: { increment: 1 },
        },
      });

      await tx.spayBookingRescheduleEvent.create({
        data: {
          bookingId: booking.id,
          fromSlotId: booking.slotId, // null unless the booking originated from a manual slot
          toSlotId: null, // schedule-computed candidates have no SpaySlot row at all
          fromScheduledStartAt: booking.scheduledStartAt,
          toScheduledStartAt: newStartAt,
          reason,
          changedById,
        },
      });

      await tx.spayBookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: booking.status,
          reason: `Rescheduled from ${booking.scheduledStartAt.toISOString()} to ${newStartAt.toISOString()}${reason ? `: ${reason}` : ''}`,
          changedById,
        },
      });

      return updated;
    });
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      reason: reason ?? 'Booking rescheduled',
      newValues: {
        previousScheduledStartAt: booking.scheduledStartAt.toISOString(),
        scheduledStartAt: newStartAt.toISOString(),
      },
    },
    auditCtx,
  );

  await archiveSpayReminderNotifications(booking.id, 'BOOKING_RESCHEDULED');
  await notifySpayRescheduled(booking.id);

  return updated;
}
