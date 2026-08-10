import { Request, Response, NextFunction } from 'express';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { auditContextFromRequest } from '../../utils/audit';
import { getRequestId } from '../../middlewares/requestId';
import { getPublicOffer, getPublicOfferVideo, listAvailableDates, listAvailableStarts, listPublicOffers } from './spay-neuter.availability.service';
import { computePaymentDueAt, normalizeServiceType } from './spay-neuter.domain';
import { getClinicBookingById, listClinicOperations, lookupClinicBooking } from './spay-neuter.clinic-dashboard.service';
import { createHold, rescheduleBooking } from './spay-neuter.hold.service';
import { createBookingFromHold, retrySpayBookingPayment, getOwnedSpayPaymentReturnStatus, reconcileOwnedSpayBookingPayment } from './spay-neuter.booking.service';
import { cancelBookingByAdmin, cancelBookingByClinic, cancelBookingByOwner, markMedicallyUnfit, markNoShow } from './spay-neuter.cancellation.service';
import {
  adminMarkCompleted,
  checkInBooking,
  completeOperation,
  completePreOpAssessment,
  markReadyForOperation,
  moveCheckedInBookingEarlier,
  sendPostOperativeUpdate,
  startOperation,
  startPreOpAssessment,
} from './spay-neuter.clinic-ops.service';
import {
  approveRefund,
  createManualRefundRequest,
  listRefundRequests,
  processRefund,
  rejectRefund,
} from './spay-neuter.refund.service';
import { getBookingReceipt, getPublicBookingPaymentStatus, lookupByBookingCode, verifyByQrToken } from './spay-neuter.verification.service';
import * as admin from './spay-neuter.admin.service';
import * as reports from './spay-neuter.reports.service';
import { prisma } from '../../database/prisma';
import type {
  AddBlockedPeriodDto,
  AddBreakDto,
  AddScheduleDto,
  AdminBookingListQuery,
  AdminCompleteBookingDto,
  AdminCancelBookingDto,
  ApproveRefundDto,
  AvailableDatesQuery,
  AvailableStartsQuery,
  BookingsExportQuery,
  CancelBookingDto,
  ClinicBookingLookupQuery,
  ClinicCheckInDto,
  ClinicMoveEarlierDto,
  ClinicOperationListQuery,
  ClinicStatusReasonDto,
  CompletePreOpAssessmentDto,
  CompleteOperationDto,
  CreateBookingDto,
  CreateManualSlotDto,
  CreateSlotHoldDto,
  LinkOfferClinicDto,
  ManualRefundRequestDto,
  ReorderDto,
  ReportFilterQuery,
  UpcomingOperationsQuery,
  PatchClinicProfileBodyDto,
  PatchOfferBodyDto,
  PostOperativeUpdateDto,
  ProcessRefundDto,
  ReadyForOperationDto,
  RejectRefundDto,
  ReportQuery,
  RescheduleBookingDto,
  RetryPaymentDto,
  StartPreOpAssessmentDto,
  StartOperationDto,
  UpsertClinicProfileBodyDto,
  UpsertClinicServiceDto,
  UpsertDateExceptionDto,
  UpsertOfferBodyDto,
} from './spay-neuter.types';

export async function getAvailableStarts(req: Request, res: Response, next: NextFunction) {
  try {
    const { clinicBranchId } = req.params;
    const { procedure: rawProcedure, date } = req.query as unknown as AvailableStartsQuery;
    const procedure = normalizeServiceType(rawProcedure);
    const windows = await listAvailableStarts(clinicBranchId, procedure, date);
    sendSuccess(res, windows);
  } catch (err) {
    next(err);
  }
}

export async function getPublicOffersList(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await listPublicOffers());
  } catch (err) {
    next(err);
  }
}

export async function getPublicOfferDetail(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getPublicOffer(req.params.offerId));
  } catch (err) {
    next(err);
  }
}

export async function getPublicOfferVideoDetail(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getPublicOfferVideo(req.params.offerId, req.params.videoId));
  } catch (err) {
    next(err);
  }
}

export async function getAvailableDates(req: Request, res: Response, next: NextFunction) {
  try {
    const { clinicBranchId } = req.params;
    const { procedure: rawProcedure, from, to } = req.query as unknown as AvailableDatesQuery;
    const procedure = normalizeServiceType(rawProcedure);
    if (from > to) throw AppError.badRequest("'from' must not be after 'to'", 'SPAY_INVALID_DATE_RANGE');
    const dates = await listAvailableDates(clinicBranchId, procedure, from, to);
    sendSuccess(res, { dates });
  } catch (err) {
    next(err);
  }
}

export async function postHold(req: Request, res: Response, next: NextFunction) {
  const dto = req.body as CreateSlotHoldDto;
  try {
    const hold = await createHold({
      offerId: dto.offerId,
      clinicBranchId: dto.clinicBranchId,
      procedure: normalizeServiceType(dto.procedure),
      startAt: dto.startAt,
      petCount: dto.petCount,
      idempotencyKey: dto.idempotencyKey,
      centralAuthUserId: req.user.sub,
    });
    sendCreated(res, hold);
  } catch (err) {
    // Structured, PII-free trace for hold failures specifically — a hold
    // request never carries contact details or tokens (those only appear
    // at booking-creation time), so the offer/clinic/procedure identifiers
    // and error code below are safe to log and are exactly what's needed to
    // trace a stuck or repeatedly-failing hold attempt by requestId.
    console.warn('[SpayHold] hold creation failed', {
      requestId: getRequestId(req),
      code: err instanceof AppError ? err.code : 'UNKNOWN',
      offerId: dto?.offerId,
      clinicBranchId: dto?.clinicBranchId,
      procedure: dto?.procedure,
    });
    next(err);
  }
}

export async function getHoldStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { holdId } = req.params;
    const hold = await prisma.spaySlotHold.findUnique({
      where: { id: holdId },
    });
    if (!hold) {
      throw AppError.notFound('Hold');
    }
    if (hold.centralAuthUserId !== req.user.sub) {
      throw AppError.forbidden('This hold belongs to a different account');
    }
    const isExpired = hold.status === 'active' && hold.expiresAt.getTime() < Date.now();
    const status = isExpired ? 'expired' : hold.status;
    sendSuccess(res, {
      id: hold.id,
      offerId: hold.offerId,
      clinicBranchId: hold.clinicBranchId,
      procedure: hold.procedure,
      candidateStartAt: hold.candidateStartAt,
      candidateEndAt: hold.candidateEndAt,
      petCount: hold.petCount,
      status,
      expiresAt: hold.expiresAt,
    });
  } catch (err) {
    next(err);
  }
}


export async function postReschedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { bookingId } = req.params;
    const dto = req.body as RescheduleBookingDto;
    const booking = await rescheduleBooking(bookingId, dto.newStartAt, dto.reason, req.user.sub, auditContextFromRequest(req));
    sendSuccess(res, booking);
  } catch (err) {
    next(err);
  }
}

// ─── Me: booking creation, list, detail, cancel ────────────────────────

export async function postBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateBookingDto;
    const result = await createBookingFromHold(
      {
        holdId: dto.holdId,
        centralAuthUserId: req.user.sub,
        authToken: req.headers.authorization,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        externalPetId: dto.externalPetId,
        petNameSnapshot: dto.petNameSnapshot,
        speciesSnapshot: dto.speciesSnapshot,
        sexSnapshot: dto.sexSnapshot,
        breedSnapshot: dto.breedSnapshot,
        weightKgSnapshot: dto.weightKgSnapshot,
        ageMonthsSnapshot: dto.ageMonthsSnapshot,
        wasAlreadyNeuteredSnapshot: dto.wasAlreadyNeuteredSnapshot,
        notes: dto.notes,
        platform: dto.platform,
      },
      auditContextFromRequest(req),
    );
    sendCreated(res, result);
  } catch (err) {
    next(err);
  }
}

export async function postRetryPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as RetryPaymentDto;
    const result = await retrySpayBookingPayment(req.params.bookingId, req.user.sub, dto.idempotencyKey, dto.platform);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentReturnStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getOwnedSpayPaymentReturnStatus(req.params.ref, req.user.sub);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// Attaches the linked Payment's own status as a flat, additive field. The
// booking's own `status` stays 'pending_payment' for BOTH "nothing has
// happened yet" and "EPS flagged this for manual review" (settlePayment's
// pending_review outcome only ever updates Payment.status — see payments.
// service.ts) — the client cannot tell those apart, and therefore cannot
// show the required neutral "under review" copy, without this field. Also
// the only way to distinguish a gateway-declined payment ('failed') from a
// user-cancelled one ('cancelled') once cancelSpayBookingPayment has
// folded both into the same booking status + cancellation reason code.
// Never renames/removes an existing field — purely additive.
//
// paymentDueAt is likewise additive: the same server-authoritative deadline
// computePaymentDueAt() already hands back from booking-creation/retry-
// payment responses (see spay-neuter.booking.service.ts), recomputed here
// from the persisted createdAt so the list/detail GETs the app actually
// polls for its "Payment deadline" UI carry it too, instead of forcing the
// client to invent its own countdown. Only present while the booking is
// still actually payable ('pending_payment') — a confirmed, cancelled, or
// otherwise resolved booking has no meaningful deadline to show.
function withLinkedPaymentStatus<T extends { payment: { status: string } | null; status: string; createdAt: Date }>(
  booking: T,
): Omit<T, 'payment'> & { linkedPaymentStatus: string | null; paymentDueAt: string | null } {
  const { payment, ...rest } = booking;
  return {
    ...rest,
    linkedPaymentStatus: payment?.status ?? null,
    paymentDueAt: booking.status === 'pending_payment' ? computePaymentDueAt(booking.createdAt).toISOString() : null,
  };
}

export async function listMyBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const bookings = await prisma.spayBooking.findMany({
      where: { centralAuthUserId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      include: { pets: true, payment: { select: { status: true } } },
    });
    sendSuccess(res, bookings.map(withLinkedPaymentStatus));
  } catch (err) {
    next(err);
  }
}

export async function getMyBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await prisma.spayBooking.findUnique({
      where: { id: req.params.bookingId },
      include: { pets: true, payment: { select: { status: true } } },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.centralAuthUserId !== req.user.sub) throw AppError.forbidden('This booking belongs to a different account');
    sendSuccess(res, withLinkedPaymentStatus(booking));
  } catch (err) {
    next(err);
  }
}

// Distinct from getMyBooking above: this one actively re-verifies with EPS
// first (via reconcileOwnedSpayBookingPayment) when the booking is still
// pending_payment with a Payment stuck at 'pending' — see that function's
// own doc comment for why the mobile app's polling loop needs this instead
// of the plain GET. Same response shape as every other My Bookings
// endpoint (withLinkedPaymentStatus), so the client parses it identically.
export async function getMyBookingVerifiedStatus(req: Request, res: Response, next: NextFunction) {
  try {
    await reconcileOwnedSpayBookingPayment(req.params.bookingId, req.user.sub);
    const booking = await prisma.spayBooking.findUnique({
      where: { id: req.params.bookingId },
      include: { pets: true, payment: { select: { status: true } } },
    });
    if (!booking) throw AppError.notFound('Booking');
    sendSuccess(res, withLinkedPaymentStatus(booking));
  } catch (err) {
    next(err);
  }
}

export async function postCancelByOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CancelBookingDto;
    const result = await cancelBookingByOwner(
      { bookingId: req.params.bookingId, centralAuthUserId: req.user.sub, reason: dto.reason },
      auditContextFromRequest(req),
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMyReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const receipt = await getBookingReceipt(req.params.bookingId, req.user.sub);
    sendSuccess(res, receipt);
  } catch (err) {
    next(err);
  }
}

// ─── Public: booking lookup + QR verification ──────────────────────────

export async function getBookingLookup(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await lookupByBookingCode(req.params.bookingCode));
  } catch (err) {
    next(err);
  }
}

export async function getQrVerify(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await verifyByQrToken(req.params.qrToken, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function getBookingPaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getPublicBookingPaymentStatus(req.params.bookingNumber));
  } catch (err) {
    next(err);
  }
}

// ─── Clinic: check-in, operation lifecycle, no-show, cancel, refund requests ──

export async function getClinicOperations(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listClinicOperations(req.user.sub, req.user.roles, req.query as unknown as ClinicOperationListQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getClinicBookingLookup(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await lookupClinicBooking(req.query as unknown as ClinicBookingLookupQuery, req.user.sub, req.user.roles));
  } catch (err) {
    next(err);
  }
}

export async function getClinicBooking(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getClinicBookingById(req.params.bookingId, req.user.sub, req.user.roles));
  } catch (err) {
    next(err);
  }
}

export async function postCheckIn(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ClinicCheckInDto;
    sendSuccess(res, await checkInBooking(req.params.bookingId, req.user.sub, dto.actualArrivalAt, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postStartPreOpAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    void (req.body as StartPreOpAssessmentDto);
    sendSuccess(res, await startPreOpAssessment(req.params.bookingId, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postCompletePreOpAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CompletePreOpAssessmentDto;
    sendSuccess(res, await completePreOpAssessment(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postReadyForOperation(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ReadyForOperationDto;
    sendSuccess(res, await markReadyForOperation(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postMoveBookingEarlier(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ClinicMoveEarlierDto;
    sendSuccess(res, await moveCheckedInBookingEarlier(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postStartOperation(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as StartOperationDto;
    sendSuccess(res, await startOperation(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postCompleteOperation(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CompleteOperationDto;
    sendSuccess(
      res,
      await completeOperation(req.params.bookingId, req.user.sub, dto.balanceCollectedBdt, dto.clinicBalanceCollected, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function postNoShow(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ClinicStatusReasonDto;
    sendSuccess(
      res,
      await markNoShow({ bookingId: req.params.bookingId, staffUserId: req.user.sub, reason: dto.reason }, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function postMedicallyUnfit(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ClinicStatusReasonDto;
    sendSuccess(
      res,
      await markMedicallyUnfit(
        { bookingId: req.params.bookingId, staffUserId: req.user.sub, reason: dto.reason },
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function postCancelByClinic(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ClinicStatusReasonDto;
    sendSuccess(
      res,
      await cancelBookingByClinic(
        { bookingId: req.params.bookingId, staffUserId: req.user.sub, reason: dto.reason },
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function postPostOperativeUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as PostOperativeUpdateDto;
    sendSuccess(res, await sendPostOperativeUpdate(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postManualRefundRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ManualRefundRequestDto;
    const result = await createManualRefundRequest(
      req.params.bookingId,
      req.user.sub,
      dto.amountBdt,
      dto.reason,
      auditContextFromRequest(req),
    );
    sendCreated(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Admin: refund approval workflow ────────────────────────────────────

export async function getRefundRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, page, limit } = req.query as { status?: string; page?: string; limit?: string };
    const result = await listRefundRequests({ status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function postApproveRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ApproveRefundDto;
    sendSuccess(res, await approveRefund(req.params.refundRequestId, req.user.sub, dto.reviewNotes, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postRejectRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as RejectRefundDto;
    sendSuccess(res, await rejectRefund(req.params.refundRequestId, req.user.sub, dto.reviewNotes, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postProcessRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as ProcessRefundDto;
    sendSuccess(
      res,
      await processRefund(req.params.refundRequestId, req.user.sub, dto.externalRefundRef, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

// ─── Admin: dashboard, offers, clinic profiles, schedule config, bookings, reports, audit ──

export async function getDashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.getDashboardSummary());
  } catch (err) {
    next(err);
  }
}

export async function getOffers(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, search, page, limit } = req.query as { status?: string; search?: string; page?: string; limit?: string };
    const result = await admin.listOffers({ status, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getOffer(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.getOffer(req.params.offerId));
  } catch (err) {
    next(err);
  }
}

export async function postOffer(req: Request, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await admin.createOffer(req.body as UpsertOfferBodyDto, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function patchOffer(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.updateOffer(req.params.offerId, req.body as PatchOfferBodyDto, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

function offerLifecycleHandler(action: 'publish' | 'pause' | 'complete' | 'archive') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await admin.transitionOffer(req.params.offerId, action, req.user.sub, auditContextFromRequest(req)));
    } catch (err) {
      next(err);
    }
  };
}
export const postPublishOffer = offerLifecycleHandler('publish');
export const postPauseOffer = offerLifecycleHandler('pause');
export const postCompleteOffer = offerLifecycleHandler('complete');
export const postArchiveOffer = offerLifecycleHandler('archive');

export async function postLinkOfferClinic(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as LinkOfferClinicDto;
    sendCreated(res, await admin.linkOfferClinic(req.params.offerId, dto.clinicBranchId, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function deleteLinkOfferClinic(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.unlinkOfferClinic(req.params.offerId, req.params.clinicBranchId, auditContextFromRequest(req));
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// ── Admin: Offer Media ──────────────────────────────────────────────────

export async function getOfferMediaList(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.listOfferMedia(req.params.offerId));
  } catch (err) {
    next(err);
  }
}

export async function postOfferMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body;
    sendCreated(res, await admin.addOfferMedia(req.params.offerId, dto.mediaFileId, dto, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function patchOfferMedia(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.updateOfferMedia(req.params.mediaId, req.body, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function deleteOfferMedia(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeOfferMedia(req.params.mediaId, auditContextFromRequest(req));
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function postReorderOfferMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderedIds } = req.body as ReorderDto;
    await admin.reorderOfferMedia(req.params.offerId, orderedIds, auditContextFromRequest(req));
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// ── Admin: Offer Videos ─────────────────────────────────────────────────

export async function getOfferVideosList(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.listOfferVideos(req.params.offerId));
  } catch (err) {
    next(err);
  }
}

export async function postOfferVideo(req: Request, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await admin.createOfferVideo(req.params.offerId, req.body, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function patchOfferVideo(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.updateOfferVideo(req.params.videoId, req.body, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function deleteOfferVideo(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeOfferVideo(req.params.videoId, auditContextFromRequest(req));
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function postReorderOfferVideos(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderedIds } = req.body as ReorderDto;
    await admin.reorderOfferVideos(req.params.offerId, orderedIds, auditContextFromRequest(req));
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getClinicProfiles(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as { page?: string; limit?: string };
    const result = await admin.listClinicProfiles({ page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getClinicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.getClinicProfile(req.params.clinicProfileId));
  } catch (err) {
    next(err);
  }
}

export async function postClinicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await admin.createClinicProfile(req.body as UpsertClinicProfileBodyDto, req.user.sub, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function patchClinicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(
      res,
      await admin.updateClinicProfile(req.params.clinicProfileId, req.body as PatchClinicProfileBodyDto, req.user.sub, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function putClinicService(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as UpsertClinicServiceDto;
    sendSuccess(
      res,
      await admin.upsertClinicService(req.params.clinicProfileId, dto.procedure, dto.durationMinutes, dto.isActive, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function postSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as AddScheduleDto;
    sendCreated(res, await admin.addSchedule(req.params.clinicProfileId, dto.dayOfWeek, dto.startTime, dto.endTime));
  } catch (err) {
    next(err);
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeSchedule(req.params.clinicProfileId, req.params.scheduleId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function postBreak(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as AddBreakDto;
    sendCreated(res, await admin.addBreak(req.params.clinicProfileId, dto.dayOfWeek, dto.startTime, dto.endTime, dto.label));
  } catch (err) {
    next(err);
  }
}

export async function deleteBreak(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeBreak(req.params.clinicProfileId, req.params.breakId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function postBlockedPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as AddBlockedPeriodDto;
    sendCreated(res, await admin.addBlockedPeriod(req.params.clinicProfileId, dto.startAt, dto.endAt, dto.reason, req.user.sub));
  } catch (err) {
    next(err);
  }
}

export async function deleteBlockedPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeBlockedPeriod(req.params.clinicProfileId, req.params.blockedPeriodId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function putDateException(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as UpsertDateExceptionDto;
    sendSuccess(
      res,
      await admin.upsertDateException(req.params.clinicProfileId, dto.exceptionDate, dto.isClosed, dto.overrideStartTime, dto.overrideEndTime, dto.reason),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteDateException(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeDateException(req.params.clinicProfileId, req.params.exceptionId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function postManualSlot(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateManualSlotDto;
    sendCreated(res, await admin.createManualSlot(req.params.clinicProfileId, dto.slotDate, dto.startTime, dto.endTime, dto.capacity, dto.procedure));
  } catch (err) {
    next(err);
  }
}

export async function deleteManualSlot(req: Request, res: Response, next: NextFunction) {
  try {
    await admin.removeManualSlot(req.params.clinicProfileId, req.params.slotId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getScheduleConflicts(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.detectScheduleConflicts(req.params.clinicProfileId));
  } catch (err) {
    next(err);
  }
}

export async function getBookingsAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as AdminBookingListQuery;
    const result = await admin.listBookingsAdmin(q);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getBookingAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.getBookingAdmin(req.params.bookingId));
  } catch (err) {
    next(err);
  }
}

export async function postAdminCompleteBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as AdminCompleteBookingDto;
    sendSuccess(res, await adminMarkCompleted(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function postAdminCancelBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as AdminCancelBookingDto;
    sendSuccess(res, await cancelBookingByAdmin(req.params.bookingId, req.user.sub, dto, auditContextFromRequest(req)));
  } catch (err) {
    next(err);
  }
}

export async function getRevenueReport(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await admin.getRevenueReport(req.query as unknown as ReportQuery));
  } catch (err) {
    next(err);
  }
}

export async function getSummaryReport(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await reports.getSummaryReport(req.query as unknown as ReportFilterQuery));
  } catch (err) {
    next(err);
  }
}

export async function getUtilizationReport(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await reports.getUtilizationReport(req.query as unknown as ReportFilterQuery));
  } catch (err) {
    next(err);
  }
}

export async function getUpcomingOperationsReport(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as UpcomingOperationsQuery;
    sendSuccess(res, await reports.getUpcomingOperationsReport(q));
  } catch (err) {
    next(err);
  }
}

export async function getClinicPerformanceReport(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await reports.getClinicPerformanceReport(req.query as unknown as ReportFilterQuery));
  } catch (err) {
    next(err);
  }
}

export async function getBookingsExportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as BookingsExportQuery;
    const csv = await reports.exportBookingsCsv(q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=spay-neuter-bookings-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

export async function getSpayAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, resourceId } = req.query as { page?: string; limit?: string; resourceId?: string };
    const result = await admin.listSpayAuditLog({ page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined, resourceId });
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) {
    next(err);
  }
}
