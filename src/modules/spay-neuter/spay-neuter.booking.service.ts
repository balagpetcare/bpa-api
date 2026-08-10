import { Prisma, type SpayPaymentAttemptStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { config } from '../../config';
import { generateMerchantTxnId, initializeEpsPayment, isEPSConfigured } from '../../services/eps.service';
import { generateSpayQrToken } from '../../utils/qr';
import { getFurtailPet } from '../me/furtail-pets.client';
import { assertOfferBookable, assertPetSexMatchesProcedure, computeBookingPrice, computeBookingSchedule, computePaymentDueAt } from './spay-neuter.domain';
import { assertClinicParticipatesInOffer } from './spay-neuter.availability.service';
import { generateSpayBookingNumber } from './spay-neuter.repository';
import { generateBookingCode } from './spay-neuter.identifiers';
import { writeAuditLog } from '../../utils/audit';
import type { AuditContext } from '../../utils/audit';

/**
 * EPS being unconfigured is an expected, everyday state in local/dev
 * environments (see createBookingFromHold's paymentGatewayUnavailable
 * fallback below) — but in production it means online advance payment is
 * completely broken for every customer, which is a deployment/configuration
 * defect, not a normal degraded mode. This never throws (the booking must
 * still be allowed to save as pending_payment — see the policy note on
 * SPAY_PENDING_PAYMENT_MINUTES), it only guarantees the failure is loud and
 * unmissable in production logs/alerting instead of silently falling back
 * to "pay at the clinic" messaging, which the client is no longer allowed
 * to show for this reason (see bpa_web's booking-confirmation.ts).
 */
function logEpsUnavailable(context: string): void {
  if (config.NODE_ENV === 'production') {
    console.error(
      `[Spay][CONFIG ERROR] EPS payment gateway is not configured in PRODUCTION (${context}). ` +
        'Online BDT 500 advance payment cannot be collected until EPS_* env vars are set. ' +
        'This is a deployment defect, not expected runtime behavior — bookings are being saved as pending_payment with no way for the customer to pay online.',
    );
  } else {
    console.warn(`[Spay] EPS payment gateway is not configured (${context}) — booking will be saved as pending_payment.`);
  }
}

// ─── Owner-facing booking creation (hold → booking + EPS advance init) ──
//
// Reuses the platform's existing EPS/Payment infrastructure exactly the way
// campaign-registrations.service.ts does — same Payment model, same
// generateMerchantTxnId/initializeEpsPayment calls, same "keep pending on
// EPS failure, don't roll back" fallback. No parallel gateway is built.

export type CreateBookingInput = {
  holdId: string;
  centralAuthUserId: string;
  authToken?: string; // raw Authorization header, forwarded to /me/pets exactly like me.controller.ts does
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  // Optional: a registered pet is not required for a Spay & Neuter
  // promotional booking. When absent, no SpayBookingPet row is created and
  // Furtail ownership is never checked (see verifyPetOwnership below).
  externalPetId?: string;
  petNameSnapshot?: string;
  speciesSnapshot?: string;
  sexSnapshot?: string;
  breedSnapshot?: string;
  weightKgSnapshot?: number;
  ageMonthsSnapshot?: number;
  wasAlreadyNeuteredSnapshot?: boolean;
  notes?: string;
  // Drives the EPS success/fail/cancel callback's redirect target (see
  // isMobilePayment() in payment-callbacks.router.ts): 'mobile' returns the
  // bpa:// deep link, anything else returns a FRONTEND_URL web redirect.
  // Every spay-neuter booking originates from the Flutter app (there is no
  // web booking flow for this feature), so the client MUST send 'mobile'
  // here or the post-payment redirect silently dumps the user into a web
  // URL instead of returning to the app.
  platform?: 'web' | 'mobile';
};

async function verifyPetOwnership(input: CreateBookingInput): Promise<void> {
  if (!input.externalPetId) return; // no pet supplied — nothing to verify, booking proceeds pet-less
  try {
    await getFurtailPet(input.authToken ?? '', input.externalPetId);
  } catch {
    // Ownership is enforced upstream by Furtail itself via the forwarded
    // bearer — any failure (404, 403, network) means we cannot confirm this
    // caller owns this pet, so the booking must not proceed. Reusing the
    // shared registry (not a local Pet/PetOwner row) is the point.
    throw AppError.badRequest('Could not verify pet ownership for this account', 'SPAY_PET_OWNERSHIP_UNVERIFIED');
  }
}

/**
 * Converts an active hold into a confirmed-pending-payment booking, atomically
 * (single transaction) and race-safely (conditional UPDATE on the hold row —
 * see the `updateMany` guard below — independent of the advisory lock, so it
 * is also correct against the background hold-expiry sweep, which does not
 * take the lock). The EPS call happens AFTER the transaction commits: a
 * booking is never rolled back just because the payment-gateway HTTP call
 * failed — it stays pending_payment for the owner to retry or for admin
 * manual confirmation, exactly mirroring the campaign-registration flow.
 */
export async function createBookingFromHold(input: CreateBookingInput, auditCtx?: AuditContext) {
  await verifyPetOwnership(input);

  const hold = await prisma.spaySlotHold.findUnique({ where: { id: input.holdId } });
  if (!hold) throw AppError.notFound('Hold');
  if (hold.centralAuthUserId !== input.centralAuthUserId) {
    throw AppError.forbidden('This hold belongs to a different account');
  }

  const [offer, clinicBranch, service] = await Promise.all([
    prisma.spayOffer.findUniqueOrThrow({ where: { id: hold.offerId } }),
    prisma.clinicBranch.findUniqueOrThrow({ where: { id: hold.clinicBranchId } }),
    prisma.spayClinicService.findUniqueOrThrow({ where: { id: hold.serviceId } }),
  ]);
  const clinicProfile = await prisma.spayClinicProfile.findUniqueOrThrow({ where: { clinicBranchId: hold.clinicBranchId } });

  // Re-validated at booking-conversion time, not just at hold creation — an
  // admin could unpublish the offer, change its dates, or unlink the clinic
  // in the minutes between the two.
  assertOfferBookable(offer, new Date(), hold.candidateStartAt);
  await assertClinicParticipatesInOffer(hold.offerId, hold.clinicBranchId);
  assertPetSexMatchesProcedure(hold.procedure, input.sexSnapshot);

  const price = computeBookingPrice(hold.procedure, {
    neuterTotalPriceBdt: Number(offer.neuterTotalPriceBdt),
    spayTotalPriceBdt: Number(offer.spayTotalPriceBdt),
    advanceBdt: Number(offer.advanceBdt),
  });
  const schedule = computeBookingSchedule(hold.candidateStartAt, service.durationMinutes, {
    slotHoldMinutes: clinicProfile.slotHoldMinutes,
    cancellationCutoffHours: clinicProfile.cancellationCutoffHours,
    arriveBeforeMinutes: clinicProfile.arriveBeforeMinutes,
    checkinEarlyMinutes: clinicProfile.checkinEarlyMinutes,
  });

  const bookingNumber = await generateSpayBookingNumber(hold.candidateStartAt);

  const booking = await prisma.$transaction(async (tx) => {
    // Race-safe, independent of the advisory lock: only a still-active,
    // non-expired hold can be converted, and it can be converted exactly
    // once. Protects against the background expiry sweep racing this call.
    const converted = await tx.spaySlotHold.updateMany({
      where: { id: hold.id, status: 'active', expiresAt: { gt: new Date() } },
      data: { status: 'converted' },
    });
    if (converted.count !== 1) {
      throw AppError.conflict('This hold has expired — please choose a time again', 'SPAY_HOLD_EXPIRED');
    }

    const created = await tx.spayBooking.create({
      data: {
        bookingNumber,
        bookingCode: generateBookingCode(),
        offerId: offer.id,
        clinicBranchId: clinicBranch.id,
        serviceId: service.id,
        holdId: hold.id,
        procedure: hold.procedure,
        centralAuthUserId: input.centralAuthUserId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        totalPriceBdt: price.totalPriceBdt,
        advanceRequiredBdt: price.advanceBdt, // frozen policy figure — known from creation, independent of payment status
        advancePaidBdt: 0, // VERIFIED amount only — set on confirmed payment, not at creation — see settleSpayBookingPayment
        // Remaining payable at the clinic AFTER the advance — fixed and
        // knowable from creation. Previously set to price.totalPriceBdt
        // ("nothing paid yet"), which produced the self-contradictory
        // pending-payment screen (see the field-level doc comment on the
        // Prisma model for the full story) — this is the actual bug fix.
        balanceDueBdt: price.balanceDueBdt,
        offerTitleSnapshot: offer.title,
        eligibilitySnapshot: offer.eligibilityText,
        medicalInstructionsSnapshot: offer.medicalInstructions,
        fastingRulesSnapshot: offer.fastingRules,
        cancellationPolicySnapshot: offer.cancellationPolicy,
        medicallyUnfitRefundableSnapshot: offer.medicallyUnfitRefundable,
        clinicNameSnapshot: clinicBranch.branchName,
        clinicAddressSnapshot: clinicBranch.address,
        durationMinutesSnapshot: service.durationMinutes,
        scheduledStartAt: schedule.scheduledStartAt,
        scheduledEndAt: schedule.scheduledEndAt,
        arriveByAt: schedule.arriveByAt,
        checkinOpensAt: schedule.checkinOpensAt,
        cancellationCutoffAt: schedule.cancellationCutoffAt,
        status: 'pending_payment',
        qrToken: '', // placeholder — replaced below once we have the real id
        consentAcceptedAt: new Date(),
        notes: input.notes,
      },
    });

    const qrToken = generateSpayQrToken(created.id, offer.id);
    const withQr = await tx.spayBooking.update({ where: { id: created.id }, data: { qrToken } });

    // A SpayBookingPet row only exists to hold a pet identity — if none was
    // supplied, a booking is simply left with zero pet rows rather than
    // writing a placeholder/empty row. Admin, verification, and receipt
    // reads already treat pets as a possibly-empty array (see
    // spay-neuter.verification.service.ts's toPublicDto and the admin
    // list/detail queries), so this requires no further schema change.
    if (input.externalPetId) {
      await tx.spayBookingPet.create({
        data: {
          bookingId: created.id,
          externalPetId: input.externalPetId,
          petNameSnapshot: input.petNameSnapshot,
          speciesSnapshot: input.speciesSnapshot,
          sexSnapshot: input.sexSnapshot,
          breedSnapshot: input.breedSnapshot,
          weightKgSnapshot: input.weightKgSnapshot,
          ageMonthsSnapshot: input.ageMonthsSnapshot,
          wasAlreadyNeuteredSnapshot: input.wasAlreadyNeuteredSnapshot,
        },
      });
    }

    await tx.spayBookingStatusHistory.create({
      data: { bookingId: created.id, fromStatus: null, toStatus: 'pending_payment', reason: 'Booking created from hold' },
    });

    return withQr;
  });

  await writeAuditLog(
    {
      action: 'create',
      resource: 'spay_bookings',
      resourceId: booking.id,
      newValues: { bookingNumber: booking.bookingNumber, status: booking.status },
    },
    auditCtx ?? {},
  );

  const paymentDueAt = computePaymentDueAt(booking.createdAt);

  if (!isEPSConfigured()) {
    logEpsUnavailable('createBookingFromHold');
    return { booking, paymentUrl: null, paymentGatewayUnavailable: true as const, paymentDueAt };
  }

  const merchantTxnId = generateMerchantTxnId();
  const payment = await prisma.payment.create({
    data: {
      gateway: 'eps',
      merchantTxnId,
      amount: price.advanceBdt,
      currency: 'BDT',
      purpose: 'spay_neuter_advance',
      entityType: 'spay_booking',
      entityId: booking.id,
      payload: { bookingId: booking.id, bookingNumber: booking.bookingNumber, platform: input.platform ?? 'web' },
    },
  });
  await prisma.spayBooking.update({ where: { id: booking.id }, data: { paymentId: payment.id } });
  await prisma.spayPaymentAttempt.create({
    data: {
      bookingId: booking.id,
      paymentId: payment.id,
      gateway: 'eps',
      merchantTxnId,
      amountBdt: price.advanceBdt,
      status: 'initiated',
    },
  });

  try {
    const customerEmail = input.contactEmail?.trim() || `${booking.bookingNumber.toLowerCase()}@bangladeshpetassociation.com`;
    const epsResult = await initializeEpsPayment({
      customerOrderId: payment.id,
      merchantTransactionId: merchantTxnId,
      totalAmount: price.advanceBdt,
      customerName: input.contactName,
      customerPhone: input.contactPhone,
      customerEmail,
      customerAddress: 'Bangladesh',
      customerCity: 'Dhaka',
      customerState: 'Dhaka Division',
      customerPostcode: '1000',
      productName: 'BPA Spay & Neuter Advance',
      valueA: booking.bookingNumber,
      valueB: payment.id,
      valueC: 'spay_booking',
      bookingRef: booking.bookingNumber,
    });

    await prisma.spayPaymentAttempt.updateMany({
      where: { paymentId: payment.id, status: 'initiated' },
      data: { status: 'pending', providerRef: epsResult.RedirectURL },
    });

    return { booking, paymentUrl: epsResult.RedirectURL, paymentGatewayUnavailable: false as const, paymentDueAt };
  } catch (epsErr) {
    console.error('[Spay] EPS initializePayment failed:', epsErr instanceof Error ? epsErr.message : epsErr);
    await prisma.spayPaymentAttempt.updateMany({
      where: { paymentId: payment.id, status: 'initiated' },
      data: { status: 'failed' },
    });
    // Do NOT roll back the booking or release the hold's conversion — the
    // booking stays pending_payment; the owner can retry (see
    // retrySpayBookingPayment below) or an admin can manually confirm,
    // exactly like the campaign-registration fallback. It must never be
    // presented to the customer as confirmed or as payable at the clinic.
    return { booking, paymentUrl: null, paymentGatewayUnavailable: true as const, paymentDueAt };
  }
}

// ─── Payment retry (owner-initiated, for a still-pending_payment booking) ──
//
// Reuses the SAME booking and, once one exists, the SAME Payment row —
// never creates a second booking and never creates a second Payment for the
// same booking. Every eligible call creates a BRAND NEW SpayPaymentAttempt
// with its own freshly generated EPS merchantTxnId and calls EPS again —
// it never hands back a previous attempt's redirect URL. EPS treats a
// merchantTransactionId as consumed the moment its checkout page is loaded,
// even if the customer never completes it, so re-serving an old attempt's
// URL (the previous behavior here) reliably produced EPS's own "Invalid
// request! Transaction ID has already been used" error on a second retry.
// A still-open prior attempt (initiated/pending) is marked 'failed' —
// superseded, not completable — before the new one is created, so its
// audit trail is accurate and it can never be confused for the live attempt.
//
// Idempotency: `idempotencyKey` is optional but SHOULD be supplied by every
// caller (see createSlotHoldSchema for the identical convention). A fresh
// key must be generated per logical "Retry Payment" tap; replaying the SAME
// key (e.g. a network-level request retry) returns the SAME attempt that
// key already produced, without a second EPS call — race-safe via the
// unique index on SpayPaymentAttempt.idempotencyKey (P2002 on a concurrent
// double-insert is caught and resolved by re-reading the winning row).
export async function retrySpayBookingPayment(bookingId: string, centralAuthUserId: string, idempotencyKey?: string, platform?: 'web' | 'mobile') {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (booking.centralAuthUserId !== centralAuthUserId) {
    throw AppError.forbidden('This booking belongs to a different account');
  }

  // Idempotent replay — checked BEFORE the eligibility gate below so a
  // network-level retry of a request that already succeeded keeps working
  // even if, by the time the retry arrives, the booking has since moved on
  // (e.g. the original attempt's own EPS callback already confirmed it).
  if (idempotencyKey) {
    const existingAttempt = await prisma.spayPaymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existingAttempt && existingAttempt.bookingId === bookingId) {
      if (existingAttempt.providerRef) {
        const paymentDueAt = computePaymentDueAt(booking.createdAt);
        return { booking, paymentUrl: existingAttempt.providerRef, paymentDueAt };
      }
      // The request this key belongs to hasn't reached EPS successfully yet
      // (still initializing, or its EPS call itself failed) — nothing valid
      // to replay. Let the caller's normal retry path handle it; a fresh
      // user-initiated tap generates a brand new key anyway.
      throw AppError.serviceUnavailable('Could not start the payment. Please try again.', 'PAYMENT_INITIATION_FAILED');
    }
  }

  // Payability AND slot-validity are the SAME check here by construction:
  // capacity occupancy is derived live from booking status
  // (OCCUPYING_BOOKING_STATUSES_EXCLUDED in spay-neuter.availability.service.ts),
  // so a booking that is not (still) pending_payment has, by definition,
  // either already been confirmed or already had its slot released
  // (expired past the payment deadline, or explicitly cancelled) — there is
  // no separate "slot" state to go stale independently of this status.
  if (booking.status !== 'pending_payment') {
    throw AppError.conflict(
      booking.status === 'confirmed'
        ? 'This booking is already confirmed — no payment is due.'
        : 'This booking is no longer available for payment — its slot has been released. Please reschedule or book a new time.',
      'SPAY_BOOKING_NOT_PAYABLE',
    );
  }

  const paymentDueAt = computePaymentDueAt(booking.createdAt);
  if (paymentDueAt.getTime() <= Date.now()) {
    throw AppError.conflict('The payment window for this booking has expired. Please book a new time.', 'SPAY_PAYMENT_WINDOW_EXPIRED');
  }

  if (!isEPSConfigured()) {
    logEpsUnavailable('retrySpayBookingPayment');
    throw AppError.serviceUnavailable(
      'Online payment is not configured in this environment. Please try again later or contact support.',
      'PAYMENT_GATEWAY_UNAVAILABLE',
    );
  }

  // Reuse the existing Payment row if booking creation (or a prior retry)
  // already made one; otherwise this is the first EPS attempt for this
  // booking (e.g. it was created while paymentGatewayUnavailable was true)
  // and one is created now, exactly the same shape createBookingFromHold
  // would have created inline — including the mobile-redirect platform
  // flag, whose earlier omission here silently sent mobile users through
  // the web return-URL branch of payment-callbacks.router.ts's
  // getRedirectUrl on first-ever retry for a booking created before EPS
  // came back up.
  let payment = booking.paymentId ? await prisma.payment.findUnique({ where: { id: booking.paymentId } }) : null;
  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        gateway: 'eps',
        amount: booking.advanceRequiredBdt, // frozen at booking creation — see computeBookingPrice
        currency: 'BDT',
        purpose: 'spay_neuter_advance',
        entityType: 'spay_booking',
        entityId: booking.id,
        payload: { bookingId: booking.id, bookingNumber: booking.bookingNumber, platform: platform ?? 'web' },
      },
    });
    await prisma.spayBooking.update({ where: { id: booking.id }, data: { paymentId: payment.id } });
  }

  // Any attempt still nominally "open" cannot be trusted as re-usable (see
  // above) — supersede it before starting the new one, purely for an
  // accurate audit trail. This never touches the booking or Payment.status;
  // cancelSpayBookingPayment/settleSpayBookingPayment own those transitions.
  await prisma.spayPaymentAttempt.updateMany({
    where: { bookingId: booking.id, status: { in: ['initiated', 'pending'] } },
    data: { status: 'failed' },
  });

  const merchantTxnId = generateMerchantTxnId();
  try {
    await prisma.spayPaymentAttempt.create({
      data: {
        bookingId: booking.id,
        paymentId: payment.id,
        gateway: 'eps',
        merchantTxnId,
        amountBdt: payment.amount,
        status: 'initiated',
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  } catch (err) {
    // A concurrent request carrying the SAME idempotencyKey won the race —
    // resolve to whatever attempt it produced instead of erroring or
    // opening a second EPS transaction for the same intent.
    if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.spayPaymentAttempt.findUnique({ where: { idempotencyKey } });
      if (winner?.bookingId === booking.id && winner.providerRef) {
        return { booking, paymentUrl: winner.providerRef, paymentDueAt };
      }
      // The concurrent request that won the create race hasn't reached EPS
      // yet (or its EPS call failed) — nothing valid to hand back. Surface
      // the same transient error as an EPS failure; the client's existing
      // retry path (a fresh tap generates a new key) recovers from this.
      throw AppError.serviceUnavailable('Could not start the payment. Please try again.', 'PAYMENT_INITIATION_FAILED');
    }
    throw err;
  }

  try {
    const customerEmail = booking.contactEmail?.trim() || `${booking.bookingNumber.toLowerCase()}@bangladeshpetassociation.com`;
    const epsResult = await initializeEpsPayment({
      customerOrderId: payment.id,
      merchantTransactionId: merchantTxnId,
      totalAmount: Number(payment.amount),
      customerName: booking.contactName,
      customerPhone: booking.contactPhone,
      customerEmail,
      customerAddress: 'Bangladesh',
      customerCity: 'Dhaka',
      customerState: 'Dhaka Division',
      customerPostcode: '1000',
      productName: 'BPA Spay & Neuter Advance',
      valueA: booking.bookingNumber,
      valueB: payment.id,
      valueC: 'spay_booking',
      bookingRef: booking.bookingNumber,
    });

    await prisma.spayPaymentAttempt.updateMany({
      where: { paymentId: payment.id, merchantTxnId, status: 'initiated' },
      data: { status: 'pending', providerRef: epsResult.RedirectURL },
    });

    return { booking, paymentUrl: epsResult.RedirectURL, paymentDueAt };
  } catch (epsErr) {
    console.error('[Spay] EPS retry initializePayment failed:', epsErr instanceof Error ? epsErr.message : epsErr);
    await prisma.spayPaymentAttempt.updateMany({
      where: { paymentId: payment.id, merchantTxnId, status: 'initiated' },
      data: { status: 'failed' },
    });
    throw AppError.serviceUnavailable('Could not start the payment. Please try again.', 'PAYMENT_INITIATION_FAILED');
  }
}

// ─── Payment-pending expiry (background job) ────────────────────────────
//
// Called by spay-payment-pending-cleanup.job.ts. A booking past its
// computePaymentDueAt() deadline with no successful payment can no longer
// be paid online (retrySpayBookingPayment also refuses once the deadline
// has passed — SPAY_PAYMENT_WINDOW_EXPIRED), so it is cancelled here,
// which removes it from OCCUPYING_BOOKING_STATUSES_EXCLUDED's complement
// (spay-neuter.availability.service.ts) and frees the slot/capacity for
// other customers — see the SPAY_PENDING_PAYMENT_MINUTES policy note in
// spay-neuter.domain.ts for why this exists at all.
export async function expireStalePendingPaymentBooking(bookingId: string): Promise<boolean> {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return false;
  if (booking.status !== 'pending_payment') return false; // already resolved — nothing to do (idempotent no-op)

  const updated = await prisma.spayBooking.updateMany({
    where: { id: booking.id, status: 'pending_payment' },
    data: {
      status: 'cancelled_by_owner',
      cancellationReasonCode: 'payment_failed', // existing enum value: "advance never captured — nothing to refund" — exactly this case
      cancelledAt: new Date(),
    },
  });
  if (updated.count !== 1) return false; // lost a race (e.g. payment settled concurrently) — leave it alone

  if (booking.paymentId) {
    await prisma.spayPaymentAttempt.updateMany({
      where: { bookingId: booking.id, status: { in: ['initiated', 'pending'] } },
      data: { status: 'failed' },
    });
  }

  await prisma.spayBookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: 'pending_payment',
      toStatus: 'cancelled_by_owner',
      reason: 'Online BDT 500 advance was not paid within the payment window — slot released automatically',
    },
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      reason: 'Automatic expiry — BDT 500 advance not paid within the payment window',
      newValues: { status: 'cancelled_by_owner', cancellationReasonCode: 'payment_failed' },
    },
    {},
  );

  return true;
}

// ─── Payment settlement dispatch (called from payments.service.ts) ──────
//
// Registered into activateLinkedEntities/deactivateLinkedEntities for
// entityType === 'spay_booking', exactly like the existing 'campaign' /
// 'donation' / 'care_partner' branches — this IS the reuse point, not a
// parallel gateway. settlePayment() already guards against re-processing a
// terminal Payment; the booking-status guard below is the second,
// independent idempotency layer, so a duplicate/replayed callback can never
// create a second booking, a second Payment, or double-apply the advance.

/**
 * Extracts the gateway-confirmed amount from the EPS verify payload that
 * settlePayment() (payments.service.ts) already persisted onto
 * Payment.payload BEFORE calling this dispatch hook — see
 * payments.repository.ts:updatePaymentStatus, which overwrites `payload`
 * with the raw VerifyPaymentResponse (including `TotalAmount`) on every
 * status transition. Returns null if the payload doesn't look like an EPS
 * response at all (e.g. a manual/test payment with no gateway payload),
 * in which case the amount-integrity check is skipped rather than
 * false-flagging a legitimate manual confirmation.
 */
function extractGatewayConfirmedAmount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as Record<string, unknown>).TotalAmount;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// merchantTxnId identifies exactly WHICH attempt settled the payment (see
// settlePayment in payments.service.ts, which always has it — it's the
// value EPS's own verify call was made with). Optional only for the small
// number of internal/legacy call sites that settle a Payment directly
// without going through a specific attempt (e.g. manualMarkPaid); in that
// case every still-open attempt for the payment is marked success, exactly
// the pre-existing blanket behavior.
export async function settleSpayBookingPayment(paymentId: string, merchantTxnId?: string): Promise<void> {
  const booking = await prisma.spayBooking.findFirst({ where: { paymentId } });
  if (!booking) return;
  if (booking.status !== 'pending_payment') return; // idempotent no-op — already confirmed (or since moved on)

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

  // Integrity check: the amount EPS confirms as actually paid must match
  // the amount WE told EPS to charge (Payment.amount, frozen at booking
  // creation from the server-computed advance — never client-supplied).
  // A mismatch means the gateway is reporting something other than what
  // was requested — never silently confirm the booking in that case; leave
  // it pending_payment for manual review rather than trusting a suspect
  // amount.
  const gatewayAmount = extractGatewayConfirmedAmount(payment.payload);
  if (gatewayAmount !== null && Math.round(gatewayAmount * 100) !== Math.round(Number(payment.amount) * 100)) {
    console.error(
      `[Spay] PAYMENT_AMOUNT_MISMATCH — booking ${booking.bookingNumber}: expected advance ${payment.amount}, gateway confirmed ${gatewayAmount}`,
    );
    await writeAuditLog(
      {
        action: 'update',
        resource: 'spay_bookings',
        resourceId: booking.id,
        reason: 'PAYMENT_AMOUNT_MISMATCH — gateway-confirmed amount does not match the requested advance; booking left pending_payment for manual review',
        newValues: { expectedAdvanceBdt: Number(payment.amount), gatewayConfirmedAmountBdt: gatewayAmount },
      },
      {},
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: booking.id, status: 'pending_payment' },
      data: {
        status: 'confirmed',
        advancePaidBdt: payment.amount,
        balanceDueBdt: booking.totalPriceBdt.sub(payment.amount),
      },
    });
    if (updated.count !== 1) return; // lost the race to a concurrent callback replay — already handled

    if (merchantTxnId) {
      // Precisely the attempt that settled — never blanket-overwrite a
      // sibling attempt that genuinely failed/was cancelled/is still open
      // with a 'success' it never earned. Any other still-open attempt is
      // moot now that the booking is confirmed; mark it superseded too.
      await tx.spayPaymentAttempt.updateMany({ where: { paymentId, merchantTxnId }, data: { status: 'success' } });
      await tx.spayPaymentAttempt.updateMany({
        where: { paymentId, merchantTxnId: { not: merchantTxnId }, status: { in: ['initiated', 'pending'] } },
        data: { status: 'failed' },
      });
    } else {
      await tx.spayPaymentAttempt.updateMany({ where: { paymentId }, data: { status: 'success' } });
    }
    await tx.spayBookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: 'pending_payment', toStatus: 'confirmed', reason: 'EPS payment confirmed' },
    });
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      newValues: { status: 'confirmed', advancePaidBdt: Number(payment.amount) },
    },
    {},
  );
}

// merchantTxnId identifies exactly which ATTEMPT failed/was cancelled (see
// settlePayment/cancelPaymentRecord — always passed once a real callback is
// involved). This function owns the Payment.status transition (previously
// the generic caller pre-set it before dispatching here) so it can withhold
// that transition on a stale signal — see below.
//
// Policy (see the module-level lifecycle doc in the PR this landed with):
// an EPS checkout Fail/Cancel terminates ONLY that payment attempt. It must
// NEVER cancel the booking or release its slot while the booking is still
// within its payment deadline — the booking stays `pending_payment`, keeps
// its id/bookingNumber, keeps occupying its slot (still outside
// OCCUPYING_BOOKING_STATUSES_EXCLUDED), and remains retryable via
// retrySpayBookingPayment. The ONLY things that ever cancel the booking
// itself / release its slot are expireStalePendingPaymentBooking (the
// payment-deadline job) and an explicit owner/admin/clinic cancellation
// (spay-neuter.cancellation.service.ts) — never a routine gateway
// fail/cancel result. This mirrors campaign-registrations.service.ts's
// "keep pending on EPS failure" fallback, just applied consistently to
// every EPS terminal result, not only the initial-checkout-call failure.
//
// A payment/attempt update is only applied here if `merchantTxnId` is the
// MOST RECENT attempt for the booking (or no merchantTxnId was given at
// all, e.g. an internal/legacy caller). A late fail/cancel callback that
// names an OLDER, already-superseded attempt (the owner already tapped
// Retry Payment again) must never touch Payment.status or the live
// attempt — it only updates that one old attempt's own record, preserving
// full attempt history for audit.
export async function cancelSpayBookingPayment(paymentId: string, merchantTxnId?: string, paymentTerminalStatus: 'failed' | 'cancelled' = 'failed'): Promise<void> {
  const booking = await prisma.spayBooking.findFirst({ where: { paymentId } });
  if (!booking) return;
  if (booking.status !== 'pending_payment') return; // idempotent no-op — already confirmed, expired, or explicitly cancelled

  if (merchantTxnId) {
    const latestAttempt = await prisma.spayPaymentAttempt.findFirst({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latestAttempt && latestAttempt.merchantTxnId !== merchantTxnId) {
      await prisma.spayPaymentAttempt.updateMany({
        where: { bookingId: booking.id, merchantTxnId, status: { in: ['initiated', 'pending'] } },
        data: { status: paymentTerminalStatus },
      });
      return; // stale attempt — booking, Payment.status, and the live attempt are all untouched
    }
  }

  // The CURRENT attempt (or no specific attempt at all) genuinely
  // failed/was cancelled. Mark the attempt(s) and the Payment row, but
  // deliberately do NOT touch SpayBooking.status — the booking stays
  // pending_payment and keeps its slot. Wrapped in a transaction with a
  // re-read of the booking's own status so a payment settling concurrently
  // (e.g. a late success on a different, still-live attempt) can never be
  // clobbered by this stale-relative-to-that-outcome fail/cancel signal.
  await prisma.$transaction(async (tx) => {
    const current = await tx.spayBooking.findUnique({ where: { id: booking.id }, select: { status: true } });
    if (!current || current.status !== 'pending_payment') return; // lost a race — already resolved, leave it alone

    await tx.payment.updateMany({
      where: { id: paymentId, status: { notIn: ['success', 'refunded'] } },
      data: { status: paymentTerminalStatus },
    });

    const openStatuses: SpayPaymentAttemptStatus[] = ['initiated', 'pending'];
    const attemptWhere = merchantTxnId
      ? { paymentId, merchantTxnId, status: { in: openStatuses } }
      : { paymentId, status: { in: openStatuses } };
    await tx.spayPaymentAttempt.updateMany({ where: attemptWhere, data: { status: paymentTerminalStatus } });
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: booking.id,
      reason: `EPS payment attempt ${paymentTerminalStatus} — booking remains pending_payment, slot preserved, Retry Payment available until the payment deadline`,
      newValues: { paymentAttemptStatus: paymentTerminalStatus },
    },
    {},
  );
}

// ─── Authoritative post-payment-return status (owner-scoped) ────────────
//
// Backs GET /me/spay-neuter/payments/:ref/status — the ONLY thing the web
// app's /spay-neuter/payment/return page is allowed to trust after EPS
// redirects the browser back. `ref` is the merchantTransactionId (the
// 17-digit value generateMerchantTxnId() produces and EPS echoes back on
// every callback/return — see spay-neuter.domain.ts and the callback
// router), never a booking UUID, never anything from the URL's own status/
// success query params. This is deliberately a SEPARATE lookup from
// getPublicBookingPaymentStatus (spay-neuter.verification.service.ts,
// keyed by the public bookingNumber, unauthenticated, used inside the
// booking wizard's own confirmation screen) — this one is authenticated
// and ownership-checked because it's reachable from a bare redirect URL
// that could be replayed/shared, and must never let one signed-in user
// learn anything about a DIFFERENT user's payment by guessing/reusing a
// merchantTxnId.
// Fields every outcome carries, so the client never has to branch on
// `outcome` just to find a booking reference or decide whether to keep
// polling — see the reconciliation-policy contract this satisfies:
// booking ID/reference, paymentDueAt, and a terminal/non-terminal flag are
// present consistently. `terminal: true` means "stop polling this attempt"
// — 'failed' is terminal for THIS attempt even though the booking often
// remains retryable (a fresh Retry Payment starts a new attempt/poll
// cycle, never a continuation of this one).
interface SpayPaymentReturnStatusCommon {
  terminal: boolean;
  bookingId: string | null;
  bookingNumber: string | null;
  paymentDueAt: string | null;
}

export type SpayPaymentReturnStatus = SpayPaymentReturnStatusCommon &
  (
    | {
        outcome: 'verified_success';
        booking: {
          bookingNumber: string;
          procedure: string;
          clinicName: string;
          scheduledStartAt: string;
          totalPriceBdt: number;
          advancePaidBdt: number;
          balanceDueBdt: number;
        };
      }
    // pending/pending_review/failed carry retryableBookingId (the caller's
    // OWN booking — ownership is already verified above) so the return page
    // can offer "Retry Payment" directly via the existing
    // retrySpayBookingPayment endpoint, without a second round trip or
    // guessing an id from the URL. 'failed' now covers BOTH an EPS "Failed"
    // verify result AND an EPS/user "Cancelled" one —
    // cancelSpayBookingPayment only ever terminates the ATTEMPT for a
    // routine gateway fail/cancel, never the booking, so in both cases the
    // booking is still pending_payment and still payable.
    | { outcome: 'pending'; retryableBookingId: string; totalPriceBdt: number; advancePaidBdt: number; balanceDueBdt: number }
    // Distinct from 'pending': EPS has explicitly flagged the last attempt
    // for manual review (Payment.status === 'pending_review') — a
    // genuinely different situation from "no signal yet" and must read
    // that way, never as an ordinary in-flight verification. Retry Payment
    // is deliberately NOT offered while a review is in progress (starting
    // a second attempt during review would only create ambiguity for
    // whoever is reviewing the first one).
    | { outcome: 'pending_review'; totalPriceBdt: number; advancePaidBdt: number; balanceDueBdt: number }
    | { outcome: 'failed'; retryableBookingId: string; totalPriceBdt: number; advancePaidBdt: number; balanceDueBdt: number }
    // 'cancelled' deliberately carries NO retryableBookingId: it is only ever
    // reached once the BOOKING itself has been cancelled/expired and its slot
    // released — either the payment-deadline job
    // (expireStalePendingPaymentBooking) or an explicit owner/admin/clinic
    // cancellation (spay-neuter.cancellation.service.ts). Neither is
    // reschedulable back onto the same reservation (OWNER_RESCHEDULABLE_STATUSES
    // excludes every terminal status), so retrySpayBookingPayment would always
    // refuse it (SPAY_BOOKING_NOT_PAYABLE) — the client must never be handed
    // an id that only leads to a guaranteed-failing retry; it should offer
    // "Book a New Time" instead.
    | { outcome: 'cancelled' }
    // Deliberately the same shape/outcome for "no such payment" AND "this
    // payment belongs to a different account" — see the module docstring
    // above and Phase 3's "unknown/not found: safe message without exposing
    // whether another user's payment exists" requirement. Never a 403/404
    // that would let a caller distinguish the two by status code alone.
    | { outcome: 'not_found' }
  );

const NOT_FOUND_STATUS: SpayPaymentReturnStatus = {
  outcome: 'not_found',
  terminal: true,
  bookingId: null,
  bookingNumber: null,
  paymentDueAt: null,
};

export async function getOwnedSpayPaymentReturnStatus(
  merchantTxnId: string,
  centralAuthUserId: string,
): Promise<SpayPaymentReturnStatus> {
  let payment = await prisma.payment.findFirst({
    where: {
      OR: [{ merchantTxnId }, { gatewayRef: merchantTxnId }, { epsTxnId: merchantTxnId }],
    },
  });
  if (!payment || payment.entityType !== 'spay_booking') return NOT_FOUND_STATUS;

  let booking = await prisma.spayBooking.findFirst({ where: { paymentId: payment.id } });
  if (!booking || booking.centralAuthUserId !== centralAuthUserId) return NOT_FOUND_STATUS;

  // If the callback/IPN hasn't landed yet (or the last attempt errored),
  // the Payment can still be sitting at 'pending' here — re-run the SAME
  // idempotent, EPS-verifying settlement path the callback/IPN routes use
  // (never trust the browser's mere presence on this page as success).
  // settlePayment lives in payments.service.ts, which itself imports this
  // module (settleSpayBookingPayment/cancelSpayBookingPayment) — a dynamic
  // import here avoids a circular static-import cycle, matching the same
  // pattern payments.service.ts already uses for its other cross-module
  // dispatches (see activateLinkedEntities).
  if (payment.status === 'pending') {
    const { settlePayment } = await import('../payments/payments.service');
    try {
      await settlePayment(payment.merchantTxnId ?? merchantTxnId);
    } catch {
      // Network/EPS error re-verifying — fall through and report whatever
      // the (unchanged) persisted status is; never invent a success.
    }
    booking = await prisma.spayBooking.findFirst({ where: { paymentId: payment.id } });
    if (!booking) return NOT_FOUND_STATUS;
    // settlePayment may just have transitioned Payment.status (e.g. pending
    // -> failed/cancelled via cancelSpayBookingPayment, or -> success) —
    // the `payment` object above is a pre-settlement snapshot and MUST be
    // re-read, or the pending_payment branch below would judge a freshly
    // failed/cancelled attempt against its own stale 'pending' value and
    // always fall through to the wrong 'pending' outcome.
    const refreshedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (refreshedPayment) payment = refreshedPayment;
  }

  // Common to every non-'not_found' outcome — computed once so bookingId/
  // bookingNumber/paymentDueAt can never drift between branches. paymentDueAt
  // is only meaningful while still actually payable ('pending_payment');
  // every other status (confirmed, cancelled) has no deadline left to show.
  const common = {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    paymentDueAt: booking.status === 'pending_payment' ? computePaymentDueAt(booking.createdAt).toISOString() : null,
  };
  const amounts = {
    totalPriceBdt: Number(booking.totalPriceBdt),
    advancePaidBdt: Number(booking.advancePaidBdt),
    balanceDueBdt: Number(booking.balanceDueBdt),
  };

  if (booking.status === 'confirmed') {
    return {
      ...common,
      terminal: true,
      outcome: 'verified_success',
      booking: {
        bookingNumber: booking.bookingNumber,
        procedure: booking.procedure,
        clinicName: booking.clinicNameSnapshot,
        scheduledStartAt: booking.scheduledStartAt.toISOString(),
        ...amounts,
      },
    };
  }

  if (booking.status === 'cancelled_by_owner' || booking.status === 'cancelled_by_clinic') {
    // Reached only via expireStalePendingPaymentBooking (payment deadline
    // elapsed) or an explicit owner/admin/clinic cancellation — never via a
    // routine EPS Fail/Cancel on a live attempt (see cancelSpayBookingPayment,
    // which no longer touches booking status for that case). The slot is
    // already released either way, so no retryableBookingId — the caller
    // must book a new time (or, for the deadline-expiry case, is offered
    // Reschedule/Book a New Time per actual API support — rescheduleBooking
    // does not accept a terminal status either).
    return { ...common, terminal: true, outcome: 'cancelled' };
  }

  if (booking.status === 'pending_payment') {
    // Booking exists, still not confirmed, still holding its slot.
    if (payment.status === 'failed' || payment.status === 'cancelled') {
      // A terminal Payment-level failure OR cancel (EPS "Failed"/
      // "Cancelled", or the user backing out at the gateway) — say so
      // plainly and offer Retry Payment.
      return { ...common, ...amounts, terminal: true, outcome: 'failed', retryableBookingId: booking.id };
    }
    if (payment.status === 'pending_review') {
      // EPS explicitly flagged the last attempt for manual review — a
      // genuinely different situation from "no signal yet" (see the type's
      // own doc comment). Not terminal (a reviewer's decision can still
      // land), but Retry Payment is deliberately not offered while under
      // review.
      return { ...common, ...amounts, terminal: false, outcome: 'pending_review' };
    }
    // Genuinely still in-flight — no terminal Payment-level signal either way.
    return { ...common, ...amounts, terminal: false, outcome: 'pending', retryableBookingId: booking.id };
  }

  return NOT_FOUND_STATUS;
}

// ─── Owner-scoped active reconciliation, keyed by bookingId ──────────────
//
// Backs GET /me/spay-neuter/bookings/:bookingId/verify-status — the mobile
// app's payment-status polling loop calls this instead of the plain
// GET /me/spay-neuter/bookings/:bookingId, specifically so a payment that
// genuinely succeeded/failed/cancelled at EPS but whose IPN/callback never
// reached this backend (unreachable BACKEND_URL from a device/emulator's
// browser, a dropped webhook, etc.) is not left showing "pending payment"
// forever. Mirrors getOwnedSpayPaymentReturnStatus's own "re-run the same
// idempotent settlePayment() path the callback uses, never trust that a
// callback already landed" policy — the only difference is the lookup key
// (bookingId, which the mobile app always has, vs merchantTxnId, which it
// doesn't) and the response shape (the same enriched booking row every
// other My Bookings endpoint returns, via withLinkedPaymentStatus in
// spay-neuter.controller.ts, so SpayBookingModel.fromJson on the Flutter
// side needs no special-casing for this endpoint).
export async function reconcileOwnedSpayBookingPayment(
  bookingId: string,
  centralAuthUserId: string,
): Promise<{ id: string; centralAuthUserId: string }> {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (booking.centralAuthUserId !== centralAuthUserId) {
    throw AppError.forbidden('This booking belongs to a different account');
  }

  if (booking.status === 'pending_payment' && booking.paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: booking.paymentId } });
    // Only a Payment still sitting at 'pending' has anything to gain from
    // re-verifying — 'failed'/'cancelled'/'pending_review'/'success' are
    // already the last word EPS gave us (whether via a prior callback or a
    // prior poll reaching this same function) and are never re-queried.
    if (payment?.status === 'pending' && payment.merchantTxnId) {
      const { settlePayment } = await import('../payments/payments.service');
      try {
        await settlePayment(payment.merchantTxnId);
      } catch {
        // Network/EPS error re-verifying — fall through and report
        // whatever the (unchanged) persisted status is; never invent a
        // result the server hasn't actually verified.
      }
    }
  }

  return booking;
}
