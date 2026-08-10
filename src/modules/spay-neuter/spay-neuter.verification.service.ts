import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog, type AuditContext } from '../../utils/audit';

// ─── QR verification & booking lookup ────────────────────────────────
//
// The QR token itself (generateSpayQrToken, src/utils/qr.ts) is an opaque
// HMAC over (bookingId, offerId) — it encodes no medical data by
// construction. This module additionally makes sure the VERIFICATION
// RESPONSE never surfaces medical fields either (pet weight, neuter
// history, medical questionnaire, vet outcome notes) — a clinic scanning
// this at the door needs identity + schedule, not clinical detail.

export type PublicVerificationDto = {
  bookingNumber: string;
  bookingCode: string;
  procedure: string;
  status: string;
  clinicName: string;
  scheduledStartAt: string;
  arriveByAt: string;
  checkinOpensAt: string;
  contactName: string;
  petNameSnapshot: string | null;
  speciesSnapshot: string | null;
  expired?: boolean;
};

// ─── Expiry policy ───────────────────────────────────────────────────
//
// The QR token itself never rotates (it's tied 1:1 to an immutable booking
// and is a display/check-in lookup key, not a bearer credential for money
// movement — see spay-neuter.hold/booking services for the actual
// state-mutating clinic actions, which additionally require clinic-role
// auth + spayClinicAccess). But a printed/photographed QR code from a
// finished visit is a durable artifact; without a cutoff, scanning an old
// one forever discloses schedule + contact-name to anyone holding the
// image. Once a booking has been in a terminal state past this window, the
// public (unauthenticated) verify/lookup responses collapse to a minimal
// "no longer active" shape instead of full detail. Authenticated clinic
// staff lookups (spay-neuter.clinic-dashboard.service.ts) are unaffected —
// they're already gated by RBAC + branch access, not by this policy.
const QR_VERIFICATION_STALE_AFTER_DAYS = 14;
const TERMINAL_STATUSES = new Set([
  'completed',
  'medically_unfit',
  'no_show',
  'cancelled_by_owner',
  'cancelled_by_clinic',
  'refunded',
]);

function isStale(booking: { status: string; scheduledStartAt: Date }, now: Date = new Date()): boolean {
  if (!TERMINAL_STATUSES.has(booking.status)) return false;
  const staleAfter = booking.scheduledStartAt.getTime() + QR_VERIFICATION_STALE_AFTER_DAYS * 86_400_000;
  return now.getTime() > staleAfter;
}

function toExpiredDto(booking: { bookingNumber: string; bookingCode: string; procedure: string; clinicNameSnapshot: string }): PublicVerificationDto {
  return {
    bookingNumber: booking.bookingNumber,
    bookingCode: booking.bookingCode,
    procedure: booking.procedure,
    status: 'expired',
    clinicName: booking.clinicNameSnapshot,
    scheduledStartAt: '',
    arriveByAt: '',
    checkinOpensAt: '',
    contactName: '',
    petNameSnapshot: null,
    speciesSnapshot: null,
    expired: true,
  };
}

function toPublicDto(booking: {
  bookingNumber: string;
  bookingCode: string;
  procedure: string;
  status: string;
  clinicNameSnapshot: string;
  scheduledStartAt: Date;
  arriveByAt: Date;
  checkinOpensAt: Date;
  contactName: string;
  pets: { petNameSnapshot: string | null; speciesSnapshot: string | null }[];
}): PublicVerificationDto {
  return {
    bookingNumber: booking.bookingNumber,
    bookingCode: booking.bookingCode,
    procedure: booking.procedure,
    status: booking.status,
    clinicName: booking.clinicNameSnapshot,
    scheduledStartAt: booking.scheduledStartAt.toISOString(),
    arriveByAt: booking.arriveByAt.toISOString(),
    checkinOpensAt: booking.checkinOpensAt.toISOString(),
    contactName: booking.contactName,
    petNameSnapshot: booking.pets[0]?.petNameSnapshot ?? null,
    speciesSnapshot: booking.pets[0]?.speciesSnapshot ?? null,
    // Deliberately excluded: weightKgSnapshot, ageMonthsSnapshot,
    // wasAlreadyNeuteredSnapshot, breedSnapshot, notes, clinicNotes, and the
    // entire SpayMedicalQuestionnaire — none of that is "identity +
    // schedule" and none of it belongs on a QR-scan response.
  };
}

export async function verifyByQrToken(qrToken: string, auditCtx: AuditContext = {}): Promise<PublicVerificationDto> {
  const booking = await prisma.spayBooking.findUnique({
    where: { qrToken },
    include: { pets: { select: { petNameSnapshot: true, speciesSnapshot: true } } },
  });
  if (!booking) throw AppError.notFound('Booking');

  await writeAuditLog(
    { action: 'update', resource: 'spay_checkin', resourceId: booking.id, reason: 'QR scan verification' },
    auditCtx,
  );

  if (isStale(booking)) return toExpiredDto(booking);
  return toPublicDto(booking);
}

// ─── Post-payment-return status (bookingNumber, not bookingCode) ────────
//
// The EPS success/fail/cancel callback (payment-callbacks.router.ts) and
// initializeEpsPayment (eps.service.ts) both key the return redirect's
// `bookingRef` query param off SpayBooking.bookingNumber (the sequential,
// support-desk-friendly identifier — see the `bookingRef: booking.
// bookingNumber` passed into initializeEpsPayment in
// spay-neuter.booking.service.ts), NOT bookingCode (the QR/lookup key used
// by lookupByBookingCode above). The web return page therefore cannot use
// lookupByBookingCode to confirm what actually happened — this is the
// dedicated, safe-fields-only endpoint for that one purpose: letting the
// browser ask "is this booking now actually confirmed?" after being
// bounced back from the payment gateway, so it can decide whether to show
// "Booking Confirmed" or the still-pending screen. It is the ONLY source of
// truth for that decision — the client's own belief about how the EPS
// redirect went is never trusted on its own (see the approved online-advance
// policy: confirmed means the backend verified the BDT 500 advance, nothing
// else).
export type PublicBookingPaymentStatusDto = {
  bookingNumber: string;
  status: string;
  procedure: string;
  clinicName: string;
  scheduledStartAt: string;
  totalPriceBdt: number;
  // The online advance THIS booking requires — frozen at creation, present
  // and correct regardless of whether it has been paid yet. Distinct from
  // advancePaidBdt (below), which is the VERIFIED amount actually captured.
  advanceRequiredBdt: number;
  advancePaidBdt: number;
  balanceDueBdt: number;
};

export async function getPublicBookingPaymentStatus(bookingNumber: string): Promise<PublicBookingPaymentStatusDto> {
  const booking = await prisma.spayBooking.findUnique({ where: { bookingNumber } });
  if (!booking) throw AppError.notFound('Booking');
  return {
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    procedure: booking.procedure,
    clinicName: booking.clinicNameSnapshot,
    scheduledStartAt: booking.scheduledStartAt.toISOString(),
    totalPriceBdt: Number(booking.totalPriceBdt),
    advanceRequiredBdt: Number(booking.advanceRequiredBdt),
    advancePaidBdt: Number(booking.advancePaidBdt),
    balanceDueBdt: Number(booking.balanceDueBdt),
  };
}

export async function lookupByBookingCode(bookingCode: string): Promise<PublicVerificationDto> {
  const booking = await prisma.spayBooking.findUnique({
    where: { bookingCode: bookingCode.toUpperCase() },
    include: { pets: { select: { petNameSnapshot: true, speciesSnapshot: true } } },
  });
  if (!booking) throw AppError.notFound('Booking');
  if (isStale(booking)) return toExpiredDto(booking);
  return toPublicDto(booking);
}

// ─── Receipt (idempotent — generated fresh from current booking state, nothing stored) ──

export type ReceiptDto = {
  bookingNumber: string;
  bookingCode: string;
  procedure: string;
  status: string;
  clinicName: string;
  clinicAddress: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  totalPriceBdt: number;
  advanceRequiredBdt: number;
  advancePaidBdt: number;
  balanceDueBdt: number;
  balanceCollectedBdt: number;
  cancellationPolicy: string | null;
  contactName: string;
  contactPhone: string;
};

export async function getBookingReceipt(bookingId: string, requesterCentralAuthUserId?: string): Promise<ReceiptDto> {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (requesterCentralAuthUserId && booking.centralAuthUserId !== requesterCentralAuthUserId) {
    throw AppError.forbidden('This booking belongs to a different account');
  }

  return {
    bookingNumber: booking.bookingNumber,
    bookingCode: booking.bookingCode,
    procedure: booking.procedure,
    status: booking.status,
    clinicName: booking.clinicNameSnapshot,
    clinicAddress: booking.clinicAddressSnapshot,
    scheduledStartAt: booking.scheduledStartAt.toISOString(),
    scheduledEndAt: booking.scheduledEndAt.toISOString(),
    totalPriceBdt: Number(booking.totalPriceBdt),
    advanceRequiredBdt: Number(booking.advanceRequiredBdt),
    advancePaidBdt: Number(booking.advancePaidBdt),
    balanceDueBdt: Number(booking.balanceDueBdt),
    balanceCollectedBdt: Number(booking.balanceCollectedBdt),
    cancellationPolicy: booking.cancellationPolicySnapshot,
    contactName: booking.contactName,
    contactPhone: booking.contactPhone,
  };
}
