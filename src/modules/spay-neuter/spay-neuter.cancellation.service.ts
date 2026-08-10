import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import { archiveSpayReminderNotifications, notifySpayCancellation, notifySpayRefundRequested } from './spay-neuter.notifications';

// ─── Cancellation → refund-eligibility state machine ────────────────
//
// Booking status, payment status, and refund status are three separate
// state machines (see spay-neuter.refund.service.ts for the refund one).
// This module only ever WRITES SpayBookingStatus and, when eligible, opens
// a SpayRefundRequest in `pending` — it never marks a refund approved or
// processed. That split is enforced at the RBAC layer (see
// spay-neuter.router.ts's permission matrix) and re-asserted here in code:
// creating a SpayRefundRequest always leaves it `pending`, regardless of
// who triggered the cancellation.

const NON_CANCELLABLE_STATUSES = new Set([
  'completed',
  'medically_unfit',
  'cancelled_by_owner',
  'cancelled_by_clinic',
  'no_show',
  'refund_pending',
  'refunded',
]);

// Exported so the admin-console cancellation path can reuse the exact same
// blocklist (rather than re-deriving it) — this is what makes
// COMPLETED -> CANCELLED impossible through the normal cancel operation.
export async function assertCancellable(bookingId: string) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (NON_CANCELLABLE_STATUSES.has(booking.status)) {
    throw AppError.conflict(`Cannot cancel a ${booking.status} booking`, 'SPAY_BOOKING_NOT_CANCELLABLE');
  }
  return booking;
}

/** Opens a pending refund request for the booking's paid advance. Never auto-approves. */
export async function openRefundRequest(
  tx: Prisma.TransactionClient,
  bookingId: string,
  amountBdt: number,
  reason: string,
  requestedById?: string,
  requestedByCentralAuthUserId?: string,
) {
  if (amountBdt <= 0) return null; // nothing was ever charged (e.g. payment never completed) — no refund to raise
  return tx.spayRefundRequest.create({
    data: {
      bookingId,
      requestedById,
      requestedByCentralAuthUserId,
      amountBdt,
      reason,
      status: 'pending',
    },
  });
}

export type CancelByOwnerInput = { bookingId: string; centralAuthUserId: string; reason?: string };

/** Owner-initiated cancellation. Refundable iff strictly before the frozen cancellationCutoffAt. */
export async function cancelBookingByOwner(input: CancelByOwnerInput, auditCtx: AuditContext = {}) {
  const booking = await assertCancellable(input.bookingId);
  if (booking.centralAuthUserId !== input.centralAuthUserId) {
    throw AppError.forbidden('This booking belongs to a different account');
  }

  const now = new Date();
  const beforeCutoff = now.getTime() < booking.cancellationCutoffAt.getTime();
  const reasonCode = beforeCutoff ? 'owner_before_cutoff' : 'owner_late';

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: { status: 'cancelled_by_owner', cancelledAt: now, cancellationReason: input.reason, cancellationReasonCode: reasonCode },
    });
    if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: 'cancelled_by_owner',
        reason: `${reasonCode}${input.reason ? `: ${input.reason}` : ''}`,
      },
    });

    let refundRequest = null;
    if (beforeCutoff && Number(booking.advancePaidBdt) > 0) {
      refundRequest = await openRefundRequest(
        tx,
        booking.id,
        Number(booking.advancePaidBdt),
        'Owner cancelled before the cancellation cutoff — advance refundable',
        undefined,
        input.centralAuthUserId,
      );
    }

    return { booking: await tx.spayBooking.findUniqueOrThrow({ where: { id: booking.id } }), refundRequest };
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      newValues: { status: 'cancelled_by_owner', reasonCode, refundable: beforeCutoff },
    },
    auditCtx,
  );

  await archiveSpayReminderNotifications(booking.id, 'BOOKING_CANCELLED');
  await notifySpayCancellation(
    booking.id,
    'SPAY_BOOKING_CANCELLED',
    'Booking cancelled',
    'বুকিং বাতিল হয়েছে',
    `Booking ${booking.bookingNumber} was cancelled by the owner.`,
    `বুকিং ${booking.bookingNumber} মালিকের অনুরোধে বাতিল করা হয়েছে।`,
  );
  if (result.refundRequest) {
    await notifySpayRefundRequested(booking.id, result.refundRequest.id);
  }

  return result;
}

export type ClinicActionInput = { bookingId: string; staffUserId: string; reason?: string };

/** Clinic-initiated cancellation — always fully refundable, per spec. */
export async function cancelBookingByClinic(input: ClinicActionInput, auditCtx: AuditContext = {}) {
  const booking = await assertCancellable(input.bookingId);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: { status: 'cancelled_by_clinic', cancelledAt: now, cancelledById: input.staffUserId, cancellationReason: input.reason, cancellationReasonCode: 'clinic_cancelled' },
    });
    if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'cancelled_by_clinic', reason: input.reason ?? 'Cancelled by clinic', changedById: input.staffUserId },
    });

    const refundRequest = await openRefundRequest(
      tx,
      booking.id,
      Number(booking.advancePaidBdt),
      'Clinic cancelled the booking — advance fully refundable',
      input.staffUserId,
    );

    return { booking: await tx.spayBooking.findUniqueOrThrow({ where: { id: booking.id } }), refundRequest };
  });

  await writeAuditLog(
    { action: 'update', resource: 'spay_bookings', resourceId: booking.id, newValues: { status: 'cancelled_by_clinic' } },
    auditCtx,
  );

  await archiveSpayReminderNotifications(booking.id, 'BOOKING_CANCELLED');
  await notifySpayCancellation(
    booking.id,
    'SPAY_BOOKING_CANCELLED',
    'Clinic cancelled the booking',
    'ক্লিনিক বুকিং বাতিল করেছে',
    `Booking ${booking.bookingNumber} was cancelled by the clinic.`,
    `বুকিং ${booking.bookingNumber} ক্লিনিকের পক্ষ থেকে বাতিল করা হয়েছে।`,
  );
  if (result.refundRequest) {
    await notifySpayRefundRequested(booking.id, result.refundRequest.id);
  }

  return result;
}

/** No-show — clinic marks this after checkinOpensAt has passed with no check-in. Never refundable. */
export async function markNoShow(input: ClinicActionInput, auditCtx: AuditContext = {}) {
  const booking = await assertCancellable(input.bookingId);
  if (booking.checkedInAt) {
    throw AppError.badRequest('Booking was already checked in — cannot mark as no-show', 'SPAY_ALREADY_CHECKED_IN');
  }
  const now = new Date();
  if (now.getTime() < booking.scheduledStartAt.getTime()) {
    throw AppError.badRequest('Cannot mark no-show before the scheduled operation time', 'SPAY_TOO_EARLY_FOR_NO_SHOW');
  }

  const updated = await prisma.spayBooking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: { status: 'no_show', noShowAt: now, cancellationReasonCode: 'no_show', cancelledById: input.staffUserId },
  });
  if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

  await prisma.spayBookingStatusHistory.create({
    data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'no_show', reason: input.reason ?? 'Owner did not arrive', changedById: input.staffUserId },
  });

  await writeAuditLog({ action: 'update', resource: 'spay_bookings', resourceId: booking.id, newValues: { status: 'no_show' } }, auditCtx);
  await archiveSpayReminderNotifications(booking.id, 'BOOKING_NO_SHOW');
  await notifySpayCancellation(
    booking.id,
    'SPAY_BOOKING_CANCELLED',
    'Booking marked as no-show',
    'বুকিং নো-শো হিসেবে চিহ্নিত হয়েছে',
    `Booking ${booking.bookingNumber} was marked as no-show.`,
    `বুকিং ${booking.bookingNumber} নো-শো হিসেবে চিহ্নিত হয়েছে।`,
  );

  return prisma.spayBooking.findUniqueOrThrow({ where: { id: booking.id } });
}

// ─── Admin-console cancellation ──────────────────────────────────────
// A single central-admin entry point covering every cancellation reason.
// medically_unfit/no_show delegate straight to the existing dedicated
// functions below (same status/refund policy, not duplicated). Every other
// reason sets status to the existing 'cancelled_by_clinic' value — no new
// SpayBookingStatus is introduced, so no mobile/web consumer switching on
// booking status is affected — while cancellationReasonCode (including the
// 4 admin-only codes added for this console) still records *why*, which is
// what actually drives refund eligibility, per the existing decoupled model.

export type AdminCancelReasonCode =
  | 'owner_before_cutoff' | 'owner_late' | 'clinic_cancelled' | 'medically_unfit' | 'no_show'
  | 'payment_failed' | 'duplicate_booking' | 'scheduling_error' | 'administrative' | 'other';

export type CancelByAdminInput = { bookingId: string; adminUserId: string; reasonCode: AdminCancelReasonCode; note?: string };

export type RefundEligibility = 'eligible' | 'not_eligible' | 'requires_review';

// BPA/clinic-operational-fault reasons are treated as refund-eligible;
// owner-side reasons follow the same rule as owner-initiated cancellation
// (refundable only strictly before the cutoff); 'other' always requires a
// human to review since the reason is unstructured free text.
function eligibilityForReasonCode(reasonCode: AdminCancelReasonCode, beforeCutoff: boolean): RefundEligibility {
  switch (reasonCode) {
    case 'clinic_cancelled':
    case 'duplicate_booking':
    case 'scheduling_error':
    case 'administrative':
      return 'eligible';
    case 'owner_before_cutoff':
      return beforeCutoff ? 'eligible' : 'not_eligible';
    case 'owner_late':
    case 'payment_failed':
      return 'not_eligible';
    case 'other':
      return 'requires_review';
    default:
      return 'requires_review';
  }
}

export type AdminCancelResult = {
  booking: Awaited<ReturnType<typeof assertCancellable>>;
  refundRequest: { id: string; status: string; amountBdt: unknown } | null;
  eligibility: RefundEligibility;
};

/** Central-admin cancellation — covers every reason not already handled by a dedicated function. */
export async function cancelBookingByAdmin(
  bookingId: string,
  adminUserId: string,
  input: { reasonCode: AdminCancelReasonCode; note?: string },
  auditCtx: AuditContext = {},
): Promise<AdminCancelResult> {
  // medically_unfit/no_show have their own dedicated status + policy —
  // reuse them rather than re-implementing a second, possibly-diverging
  // path. Their (slightly differently-shaped) results are normalized to
  // the same { booking, refundRequest, eligibility } contract every other
  // reason returns, so callers never have to branch on which path ran.
  if (input.reasonCode === 'medically_unfit') {
    const result = await markMedicallyUnfit({ bookingId, staffUserId: adminUserId, reason: input.note }, auditCtx);
    return { booking: result.booking, refundRequest: result.refundRequest, eligibility: result.refundable ? 'eligible' : 'not_eligible' };
  }
  if (input.reasonCode === 'no_show') {
    const booking = await markNoShow({ bookingId, staffUserId: adminUserId, reason: input.note }, auditCtx);
    return { booking, refundRequest: null, eligibility: 'not_eligible' };
  }

  const booking = await assertCancellable(bookingId);
  const now = new Date();
  const beforeCutoff = now.getTime() < booking.cancellationCutoffAt.getTime();
  const eligibility = eligibilityForReasonCode(input.reasonCode, beforeCutoff);
  const cancellationReason = input.note ?? `Cancelled by admin (${input.reasonCode.replace(/_/g, ' ')})`;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: {
        status: 'cancelled_by_clinic',
        cancelledAt: now,
        cancelledById: adminUserId,
        cancellationReason,
        cancellationReasonCode: input.reasonCode,
      },
    });
    if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: 'cancelled_by_clinic',
        reason: `Admin cancellation (${input.reasonCode}): ${cancellationReason}`,
        changedById: adminUserId,
      },
    });

    const refundRequest = eligibility !== 'not_eligible'
      ? await openRefundRequest(
          tx,
          booking.id,
          Number(booking.advancePaidBdt),
          `Admin cancellation (${input.reasonCode}) — ${eligibility === 'eligible' ? 'refund-eligible' : 'requires manual review'}`,
          adminUserId,
        )
      : null;

    return { booking: await tx.spayBooking.findUniqueOrThrow({ where: { id: booking.id } }), refundRequest, eligibility };
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      newValues: { status: 'cancelled_by_clinic', reasonCode: input.reasonCode, eligibility },
      reason: `Admin console cancellation: ${cancellationReason}`,
    },
    auditCtx,
  );

  await archiveSpayReminderNotifications(booking.id, 'BOOKING_CANCELLED');
  await notifySpayCancellation(
    booking.id,
    'SPAY_BOOKING_CANCELLED',
    'Booking cancelled',
    'বুকিং বাতিল হয়েছে',
    `Booking ${booking.bookingNumber} was cancelled by BPA administration.`,
    `বুকিং ${booking.bookingNumber} বিপিএ প্রশাসনের পক্ষ থেকে বাতিল করা হয়েছে।`,
  );
  if (result.refundRequest) {
    await notifySpayRefundRequested(booking.id, result.refundRequest.id);
  }

  return result;
}

/** MEDICALLY_UNFIT — vet determines the pet cannot proceed. Refund follows the offer's snapshotted policy, not a fixed rule. */
export async function markMedicallyUnfit(input: ClinicActionInput, auditCtx: AuditContext = {}) {
  const booking = await assertCancellable(input.bookingId);
  const now = new Date();
  const refundable = booking.medicallyUnfitRefundableSnapshot;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: {
        status: 'medically_unfit',
        cancelledAt: now,
        cancelledById: input.staffUserId,
        cancellationReason: input.reason ?? 'Determined medically unfit for surgery',
        cancellationReasonCode: 'medically_unfit',
      },
    });
    if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: booking.status, toStatus: 'medically_unfit', reason: `medically_unfit (refundable=${refundable})`, changedById: input.staffUserId },
    });

    const refundRequest = refundable
      ? await openRefundRequest(
          tx,
          booking.id,
          Number(booking.advancePaidBdt),
          'Pet determined medically unfit for surgery — refundable per offer policy',
          input.staffUserId,
        )
      : null;

    return { booking: await tx.spayBooking.findUniqueOrThrow({ where: { id: booking.id } }), refundRequest, refundable };
  });

  await writeAuditLog(
    { action: 'update', resource: 'spay_bookings', resourceId: booking.id, newValues: { status: 'medically_unfit', reasonCode: 'medically_unfit', refundable } },
    auditCtx,
  );

  await archiveSpayReminderNotifications(booking.id, 'BOOKING_MEDICALLY_UNFIT');
  await notifySpayCancellation(
    booking.id,
    'SPAY_BOOKING_CANCELLED',
    'Pet marked medically unfit',
    'পোষ্যকে চিকিৎসাগতভাবে অনুপযুক্ত ধরা হয়েছে',
    `Booking ${booking.bookingNumber} was closed as medically unfit.`,
    `বুকিং ${booking.bookingNumber} চিকিৎসাগতভাবে অনুপযুক্ত হিসেবে বন্ধ করা হয়েছে।`,
  );
  if (result.refundRequest) {
    await notifySpayRefundRequested(booking.id, result.refundRequest.id);
  }

  return result;
}
