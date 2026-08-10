import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import {
  notifySpayRefundApproved,
  notifySpayRefundCompleted,
  notifySpayRefundInitiated,
  notifySpayRefundRejected,
  notifySpayRefundRequested,
} from './spay-neuter.notifications';

// ─── Refund status — its own state machine ───────────────────────────
//
// pending -> approved -> processed
// pending -> rejected
//
// Clinic staff can only ever CREATE a request (spay-neuter.cancellation.
// service.ts, or createManualRefundRequest below) — every transition here
// requires the caller to already hold spay_refunds:approve, which the RBAC
// seed (prisma/seed/roles-permissions.seed.ts) grants ONLY to super_admin/
// admin, never to clinic_admin/clinic_vet/clinic_front_desk. This module
// re-asserts that split defensively: there is no code path here that a
// clinic-scoped caller can reach that mutates status away from `pending`.

export async function createManualRefundRequest(
  bookingId: string,
  staffUserId: string,
  amountBdt: number,
  reason: string,
  auditCtx: AuditContext = {},
) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (amountBdt <= 0 || amountBdt > Number(booking.advancePaidBdt)) {
    throw AppError.badRequest('Refund amount must be positive and not exceed the paid advance', 'SPAY_INVALID_REFUND_AMOUNT');
  }

  const request = await prisma.spayRefundRequest.create({
    data: { bookingId, requestedById: staffUserId, amountBdt, reason, status: 'pending' },
  });

  await writeAuditLog(
    { action: 'create', resource: 'spay_refunds', resourceId: request.id, newValues: { bookingId, amountBdt, status: 'pending' } },
    auditCtx,
  );
  await notifySpayRefundRequested(bookingId, request.id);
  return request;
}

async function assertPending(refundRequestId: string) {
  const request = await prisma.spayRefundRequest.findUnique({ where: { id: refundRequestId } });
  if (!request) throw AppError.notFound('Refund request');
  if (request.status !== 'pending') {
    throw AppError.conflict(`Refund request is already ${request.status}`, 'SPAY_REFUND_NOT_PENDING');
  }
  return request;
}

/** BPA Central Admin only — enforced by authorize('spay_refunds', 'approve') at the router layer. */
export async function approveRefund(refundRequestId: string, adminUserId: string, reviewNotes?: string, auditCtx: AuditContext = {}) {
  const request = await assertPending(refundRequestId);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.spayRefundRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'approved', reviewedById: adminUserId, reviewedAt: new Date(), reviewNotes },
    });
    if (result.count !== 1) throw AppError.conflict('Refund request was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBooking.updateMany({
      where: { id: request.bookingId, status: { in: ['cancelled_by_owner', 'cancelled_by_clinic', 'no_show'] } },
      data: { status: 'refund_pending' },
    });

    return tx.spayRefundRequest.findUniqueOrThrow({ where: { id: request.id } });
  });

  await writeAuditLog(
    { action: 'approve', resource: 'spay_refunds', resourceId: request.id, newValues: { status: 'approved' } },
    auditCtx,
  );
  await notifySpayRefundApproved(request.bookingId, request.id);
  await notifySpayRefundInitiated(request.bookingId, request.id);
  return updated;
}

export async function rejectRefund(refundRequestId: string, adminUserId: string, reviewNotes: string, auditCtx: AuditContext = {}) {
  const request = await assertPending(refundRequestId);

  const result = await prisma.spayRefundRequest.updateMany({
    where: { id: request.id, status: 'pending' },
    data: { status: 'rejected', reviewedById: adminUserId, reviewedAt: new Date(), reviewNotes },
  });
  if (result.count !== 1) throw AppError.conflict('Refund request was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

  await writeAuditLog(
    { action: 'reject', resource: 'spay_refunds', resourceId: request.id, newValues: { status: 'rejected' }, reason: reviewNotes },
    auditCtx,
  );
  await notifySpayRefundRejected(request.bookingId, request.id);
  return prisma.spayRefundRequest.findUniqueOrThrow({ where: { id: request.id } });
}

/**
 * Marks a refund as executed OUTSIDE this system — BPA's EPS integration
 * has no supported refund API (confirmed: src/services/eps.service.ts
 * exposes no refund method). This function therefore never calls a
 * gateway and never fabricates a provider success: `externalRefundRef` is
 * a mandatory, admin-supplied reference (bank transaction id, EPS merchant
 * portal reference, mobile wallet payout id) proving the transfer was
 * actually made, so this is an honest record of a manual action, not an
 * automated one. Reconciliation is Admin's responsibility — this is the
 * system of record for that decision, not the payment execution itself.
 */
export async function processRefund(
  refundRequestId: string,
  adminUserId: string,
  externalRefundRef: string,
  auditCtx: AuditContext = {},
) {
  if (!externalRefundRef?.trim()) {
    throw AppError.badRequest('An external refund reference is required to mark a refund as processed', 'SPAY_REFUND_REF_REQUIRED');
  }

  const request = await prisma.spayRefundRequest.findUnique({ where: { id: refundRequestId } });
  if (!request) throw AppError.notFound('Refund request');
  if (request.status !== 'approved') {
    throw AppError.conflict('Only an approved refund request can be marked as processed', 'SPAY_REFUND_NOT_APPROVED');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.spayRefundRequest.updateMany({
      where: { id: request.id, status: 'approved' },
      data: { status: 'processed', processedAt: new Date(), processedById: adminUserId, externalRefundRef: externalRefundRef.trim() },
    });
    if (result.count !== 1) throw AppError.conflict('Refund request was modified concurrently — please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBooking.updateMany({
      where: { id: request.bookingId, status: 'refund_pending' },
      data: { status: 'refunded' },
    });
    if (request.bookingId) {
      const booking = await tx.spayBooking.findUnique({ where: { id: request.bookingId }, select: { paymentId: true } });
      if (booking?.paymentId) {
        await tx.payment.update({ where: { id: booking.paymentId }, data: { status: 'refunded' } });
      }
    }

    return tx.spayRefundRequest.findUniqueOrThrow({ where: { id: request.id } });
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_refunds',
      resourceId: request.id,
      newValues: { status: 'processed', externalRefundRef },
    },
    auditCtx,
  );
  await notifySpayRefundCompleted(request.bookingId, request.id);
  return updated;
}

export async function listRefundRequests(params: { status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const where = params.status ? { status: params.status as never } : {};
  const [items, total] = await Promise.all([
    prisma.spayRefundRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.spayRefundRequest.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } };
}
