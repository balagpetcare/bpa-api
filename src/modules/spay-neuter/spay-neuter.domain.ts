import { AppError } from '../../utils/AppError';
import type {
  SpayBookingPriceSnapshot,
  SpayBookingScheduleSnapshot,
  SpayClinicPolicy,
  SpayOfferPricing,
  SpayProcedureKind,
} from './spay-neuter.types';

// ─── Pure domain logic ──────────────────────────────────────────────
//
// Everything here is side-effect-free and DB-free by design: these are the
// invariants from docs/plans/spay-neuter/implementation-contract.md §4.3
// ("Invariants enforced in the service layer"), factored out so they can be
// unit tested without a database and reused identically by every caller
// (booking creation, reschedule, admin preview). Never duplicate this math
// inline in a router/controller.

// ─── Canonical service type (SPAY / NEUTER) ─────────────────────────
//
// The wire-level `procedure` field (and the Prisma SpayProcedure enum,
// 'neuter' | 'spay') is the existing, deeply-embedded internal
// representation — reused as-is per the audit's "do not add a conflicting
// enum" guidance. SPAY/NEUTER are the canonical, case-insensitive
// *external* codes: normalizeServiceType() is the single choke point that
// turns arbitrary client input into that internal value (or rejects it
// with a stable, typed error), and toServiceTypeCode() is its inverse for
// responses. Never validate a service-type field with a bare zod enum
// where a caller needs SERVICE_TYPE_REQUIRED/INVALID_SERVICE_TYPE as the
// top-level error code — zod's own validation failure only ever surfaces
// as the generic VALIDATION_ERROR code.

export const SERVICE_TYPE_CODES = ['SPAY', 'NEUTER'] as const;
export type ServiceTypeCode = (typeof SERVICE_TYPE_CODES)[number];

/** Platform-default durations, seeded onto every new SpayClinicProfile and used as the offer-level display estimate before a clinic is chosen. The actual enforced duration at booking time always comes from that clinic's own SpayClinicService row. */
export const NEUTER_DEFAULT_DURATION_MINUTES = 20;
export const SPAY_DEFAULT_DURATION_MINUTES = 40;

export function toServiceTypeCode(procedure: SpayProcedureKind): ServiceTypeCode {
  return procedure === 'spay' ? 'SPAY' : 'NEUTER';
}

// ─── Payment-pending slot policy ─────────────────────────────────────
//
// A hold converts into a `pending_payment` SpayBooking the instant booking
// creation succeeds (see createBookingFromHold) — well before the BDT 500
// advance is actually verified. Unlike a hold, a booking has no `expiresAt`
// column, and `pending_payment` is deliberately NOT in
// OCCUPYING_BOOKING_STATUSES_EXCLUDED (spay-neuter.availability.service.ts),
// so an unpaid booking occupies real clinic capacity from the moment it's
// created. Without an explicit deadline, it would occupy that capacity
// forever. SPAY_PENDING_PAYMENT_MINUTES is that deadline: the payment
// cleanup job (spay-payment-pending-cleanup.job.ts) cancels any booking
// still `pending_payment` past this many minutes since creation, which
// removes it from OCCUPYING_BOOKING_STATUSES_EXCLUDED's complement and
// frees the slot for other customers. The same value is what
// computePaymentDueAt() below hands to the client so the countdown shown
// on the "Payment Pending" screen matches exactly what the server will
// actually enforce — never a client-guessed duration.
export const SPAY_PENDING_PAYMENT_MINUTES = Number(process.env.SPAY_PENDING_PAYMENT_MINUTES ?? '30');

export function computePaymentDueAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SPAY_PENDING_PAYMENT_MINUTES * 60_000);
}

/**
 * Normalizes arbitrary, untrusted client input (missing, empty, wrong type,
 * array, unknown string) into the internal SpayProcedureKind — or throws a
 * stable, typed AppError the UI can key off of. Never accepts an array or a
 * combined value ("both", "SPAY,NEUTER") — exactly one of SPAY/NEUTER,
 * case-insensitively.
 */
export function normalizeServiceType(input: unknown): SpayProcedureKind {
  if (input === undefined || input === null || input === '') {
    throw AppError.badRequest('serviceType is required — expected SPAY or NEUTER', 'SERVICE_TYPE_REQUIRED');
  }
  if (typeof input !== 'string') {
    throw AppError.badRequest('serviceType must be a single string value, not a list or object', 'INVALID_SERVICE_TYPE');
  }
  const normalized = input.trim().toUpperCase();
  if (normalized === 'SPAY') return 'spay';
  if (normalized === 'NEUTER') return 'neuter';
  throw AppError.badRequest(`Unknown serviceType "${input}" — expected SPAY or NEUTER`, 'INVALID_SERVICE_TYPE');
}

export type SpayServiceChoice = {
  code: ServiceTypeCode;
  displayName: string;
  displayNameBn: string;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  durationMinutes: number;
  enabled: boolean;
};

/**
 * Builds the normalized public serviceChoices array from an offer's own
 * price fields — server-authoritative, never trusts a client-supplied
 * price/duration. durationMinutes here is the platform-default display
 * estimate (see NEUTER_DEFAULT_DURATION_MINUTES/SPAY_DEFAULT_DURATION_MINUTES);
 * the actually-enforced duration is resolved per clinic at hold-creation time.
 * `enabled` is always true at the offer level today — SpayOffer always
 * carries both procedures' pricing — clinic-level availability is what
 * genuinely gates bookability and is checked separately per clinic.
 */
export function buildServiceChoices(offer: SpayOfferPricing): SpayServiceChoice[] {
  return [
    {
      code: 'NEUTER',
      displayName: 'Neuter',
      displayNameBn: 'নিউটার',
      totalAmount: offer.neuterTotalPriceBdt,
      advanceAmount: offer.advanceBdt,
      remainingAmount: fromCents(toCents(offer.neuterTotalPriceBdt) - toCents(offer.advanceBdt)),
      durationMinutes: NEUTER_DEFAULT_DURATION_MINUTES,
      enabled: true,
    },
    {
      code: 'SPAY',
      displayName: 'Spay',
      displayNameBn: 'স্পে',
      totalAmount: offer.spayTotalPriceBdt,
      advanceAmount: offer.advanceBdt,
      remainingAmount: fromCents(toCents(offer.spayTotalPriceBdt) - toCents(offer.advanceBdt)),
      durationMinutes: SPAY_DEFAULT_DURATION_MINUTES,
      enabled: true,
    },
  ];
}

// ─── Pet sex vs. procedure ───────────────────────────────────────────
//
// "Normally" per the product rule, not absolute — so an UNKNOWN/blank/
// unrecognized sex value is never blocked (no existing policy confirms
// that should be a hard stop), only a CLEAR opposite-sex mismatch is
// rejected. Never inferred from the pet's name — only ever from the
// canonical sex/gender field itself.
export type NormalizedPetSex = 'male' | 'female' | 'unknown';

export function normalizePetSex(input: string | null | undefined): NormalizedPetSex {
  if (!input) return 'unknown';
  const v = input.trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'unknown';
}

/** Throws PET_SEX_SERVICE_MISMATCH only on a clear, known opposite-sex mismatch. Unknown/unspecified sex is never blocked. */
export function assertPetSexMatchesProcedure(procedure: SpayProcedureKind, sexSnapshot: string | null | undefined): void {
  const sex = normalizePetSex(sexSnapshot);
  if (sex === 'unknown') return;
  if (procedure === 'spay' && sex !== 'female') {
    throw AppError.badRequest('Spay is normally for a female pet — the selected pet is recorded as male', 'PET_SEX_SERVICE_MISMATCH');
  }
  if (procedure === 'neuter' && sex !== 'male') {
    throw AppError.badRequest('Neuter is normally for a male pet — the selected pet is recorded as female', 'PET_SEX_SERVICE_MISMATCH');
  }
}

// ─── Offer bookability window ────────────────────────────────────────

export type OfferBookabilityInput = {
  status: string;
  deletedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  bookingOpensAt: Date | null;
  bookingClosesAt: Date | null;
};

/**
 * Consolidates every offer-window check (published, not deleted, inside the
 * booking window, inside the service period) into one stable OFFER_NOT_BOOKABLE
 * error with a `details.reason` distinguishing why — reused identically by
 * hold creation and booking creation so the two can never drift. Assumes the
 * caller has already handled the "offer does not exist at all" 404 case
 * separately (that is a different failure mode from "exists but not
 * bookable right now"). `candidateStartAt` is optional: pass it to also
 * confirm a specific requested time falls inside the offer's service period.
 */
export function assertOfferBookable(offer: OfferBookabilityInput, now: Date, candidateStartAt?: Date): void {
  if (offer.deletedAt || offer.status !== 'published') {
    throw AppError.badRequest('This offer is not open for booking', 'OFFER_NOT_BOOKABLE', { reason: 'not_published' });
  }
  const bookingOpensAt = offer.bookingOpensAt ?? offer.startsAt;
  const bookingClosesAt = offer.bookingClosesAt ?? offer.endsAt;
  if (bookingOpensAt && now.getTime() < bookingOpensAt.getTime()) {
    throw AppError.badRequest('Booking for this offer has not opened yet', 'OFFER_NOT_BOOKABLE', { reason: 'booking_not_open' });
  }
  if (bookingClosesAt && now.getTime() > bookingClosesAt.getTime()) {
    throw AppError.badRequest('Booking for this offer has closed', 'OFFER_NOT_BOOKABLE', { reason: 'booking_closed' });
  }
  if (candidateStartAt) {
    if (offer.endsAt && candidateStartAt.getTime() > offer.endsAt.getTime()) {
      throw AppError.badRequest("This time is outside the offer's service period", 'OFFER_NOT_BOOKABLE', { reason: 'outside_service_period' });
    }
    if (offer.startsAt && candidateStartAt.getTime() < offer.startsAt.getTime()) {
      throw AppError.badRequest("This time is outside the offer's service period", 'OFFER_NOT_BOOKABLE', { reason: 'outside_service_period' });
    }
  }
}

/** True iff [start, end) fits entirely inside at least one of the given free windows. */
export function isWithinAnyWindow(freeWindows: { start: Date; end: Date }[], start: Date, end: Date): boolean {
  return freeWindows.some((w) => w.start.getTime() <= start.getTime() && end.getTime() <= w.end.getTime());
}

/**
 * The BDT 500 (or admin-configured) advance is part of the total price, never
 * additive. balanceDueBdt is always server-computed — a client-supplied price
 * or balance must never be trusted (see spay-neuter.types.ts request schemas,
 * none of which accept a price field).
 */
export function computeBookingPrice(
  procedure: SpayProcedureKind,
  offer: { neuterTotalPriceBdt: number; spayTotalPriceBdt: number; advanceBdt: number },
): SpayBookingPriceSnapshot {
  const totalPriceBdt = procedure === 'neuter' ? offer.neuterTotalPriceBdt : offer.spayTotalPriceBdt;

  if (totalPriceBdt <= 0) {
    throw AppError.badRequest('Offer total price must be positive', 'SPAY_INVALID_OFFER_PRICE');
  }

  // Money arithmetic is done in integer cents, never in floating point, so
  // that advancePaidBdt + balanceDueBdt === totalPriceBdt holds EXACTLY
  // (float subtraction like 1000.005 - 333.33 does not reliably round-trip
  // through Math.round(x * 100) / 100 the same way on both sides).
  const totalCents = toCents(totalPriceBdt);
  const advanceCents = toCents(offer.advanceBdt);

  if (advanceCents > totalCents) {
    throw AppError.badRequest(
      'Advance amount cannot exceed the total price',
      'SPAY_ADVANCE_EXCEEDS_TOTAL',
    );
  }

  const balanceCents = totalCents - advanceCents;

  return {
    totalPriceBdt: fromCents(totalCents),
    advanceBdt: fromCents(advanceCents),
    balanceDueBdt: fromCents(balanceCents),
  };
}

/**
 * Derives and freezes every scheduling timestamp from a single instant
 * (scheduledStartAt, UTC) plus the clinic's policy minutes/hours — mirroring
 * the "Recommended arrival 20 min before / check-in up to 1h early /
 * cancellation cutoff 24h" spec rules. Asia/Dhaka is not referenced here
 * deliberately: Timestamptz already carries an absolute instant, and any
 * wall-clock rendering happens at the API boundary (response formatting),
 * never in stored data.
 */
export function computeBookingSchedule(
  scheduledStartAt: Date,
  durationMinutes: number,
  policy: SpayClinicPolicy,
): SpayBookingScheduleSnapshot {
  if (durationMinutes <= 0) {
    throw AppError.badRequest('Service duration must be positive', 'SPAY_INVALID_DURATION');
  }

  const scheduledEndAt = addMinutes(scheduledStartAt, durationMinutes);
  const arriveByAt = addMinutes(scheduledStartAt, -policy.arriveBeforeMinutes);
  const checkinOpensAt = addMinutes(scheduledStartAt, -policy.checkinEarlyMinutes);
  const cancellationCutoffAt = addHours(scheduledStartAt, -policy.cancellationCutoffHours);

  return { scheduledStartAt, scheduledEndAt, arriveByAt, checkinOpensAt, cancellationCutoffAt };
}

/** Cancellation is only allowed strictly before the frozen cutoff instant. */
export function isCancellationAllowed(cancellationCutoffAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < cancellationCutoffAt.getTime();
}

/** Check-in is allowed from checkinOpensAt (inclusive) onward. */
export function isCheckinAllowed(checkinOpensAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= checkinOpensAt.getTime();
}

/** A hold is usable iff it is active and its TTL has not elapsed. */
export function isHoldUsable(hold: { status: string; expiresAt: Date }, now: Date = new Date()): boolean {
  return hold.status === 'active' && hold.expiresAt.getTime() > now.getTime();
}

/**
 * BPA-SN-YYYYMMDD-##### — formatting only. The numeric sequence value must
 * come from the `spay_booking_number_seq` Postgres sequence (nextval, atomic
 * under concurrency), never from count()+1 — see
 * campaign-registrations.repository.ts:generateBookingNumber for the bug
 * this deliberately avoids.
 */
export function formatBookingNumber(date: Date, sequenceValue: number | bigint): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(sequenceValue).padStart(5, '0');
  return `BPA-SN-${yyyymmdd}-${seq}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}

function toCents(bdt: number): number {
  return Math.round(bdt * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}
