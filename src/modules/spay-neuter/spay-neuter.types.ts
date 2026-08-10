import { z } from 'zod';
import { SpayBookingStatus, PaymentStatus, SpayCancellationReasonCode } from '@prisma/client';

// ─── Domain-only pure types (no I/O) ───────────────────────────────
//
// These are the inputs/outputs of the pure scheduling/pricing helpers in
// spay-neuter.domain.ts. Kept separate from the zod request schemas below
// because they describe internal computation, not wire payloads.

export type SpayOfferPricing = {
  neuterTotalPriceBdt: number;
  spayTotalPriceBdt: number;
  advanceBdt: number;
};

export type SpayProcedureKind = 'neuter' | 'spay';

// Pure price-policy figures, computed BEFORE any payment happens — nothing
// here has been paid yet. `advanceBdt` is deliberately not named
// `advancePaidBdt`; that name belongs only to SpayBooking.advancePaidBdt,
// which stays 0 until settleSpayBookingPayment verifies the gateway
// payment. Reusing "paid" for a pre-payment policy figure was the root of
// the ambiguous-field bug this snapshot exists to prevent.
export type SpayBookingPriceSnapshot = {
  totalPriceBdt: number;
  advanceBdt: number;
  balanceDueBdt: number;
};

export type SpayClinicPolicy = {
  slotHoldMinutes: number;
  cancellationCutoffHours: number;
  arriveBeforeMinutes: number;
  checkinEarlyMinutes: number;
};

export type SpayBookingScheduleSnapshot = {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  arriveByAt: Date;
  checkinOpensAt: Date;
  cancellationCutoffAt: Date;
};

// ─── Request schemas ────────────────────────────────────────────────

export const createSpayOfferSchema = z.object({
  title: z.string().min(1).max(160),
  slug: z.string().min(1).max(180),
  summary: z.string().max(500).optional(),
  description: z.string().optional(),
  neuterTotalPriceBdt: z.number().positive(),
  spayTotalPriceBdt: z.number().positive(),
  advanceBdt: z.number().positive().default(500),
  eligibilityText: z.string().optional(),
  medicalInstructions: z.string().optional(),
  fastingRules: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().max(255).optional(),
  mobileImageId: z.string().uuid().optional(),
  webImageId: z.string().uuid().optional(),
  homepageThumbnailMediaId: z.string().uuid().optional(),
});

// procedure is intentionally NOT validated as a zod enum here — a missing
// or malformed value must produce the stable SERVICE_TYPE_REQUIRED /
// INVALID_SERVICE_TYPE error codes (normalizeServiceType in
// spay-neuter.domain.ts), not zod's generic VALIDATION_ERROR. The
// controller calls normalizeServiceType() on this raw value before use.
export const createSlotHoldSchema = z.object({
  offerId: z.string().uuid(),
  clinicBranchId: z.string().uuid(),
  procedure: z.unknown(),
  startAt: z.coerce.date(),
  petCount: z.number().int().min(1).max(1).default(1),
  idempotencyKey: z.string().min(1).max(255),
});

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const availableStartsQuerySchema = z.object({
  procedure: z.unknown(),
  date: dateStringSchema,
});

export const availableDatesQuerySchema = z.object({
  procedure: z.unknown(),
  from: dateStringSchema,
  to: dateStringSchema,
});

export const rescheduleBookingSchema = z.object({
  newStartAt: z.coerce.date(),
  reason: z.string().max(500).optional(),
});

export const createBookingSchema = z.object({
  holdId: z.string().uuid(),
  contactName: z.string().min(1).max(120),
  contactPhone: z.string().min(7).max(20),
  contactEmail: z.string().email().max(255).optional(),
  // A registered Furtail pet is optional for Spay & Neuter promotional
  // bookings — a booking may be created with no pet identity at all. When
  // omitted, no SpayBookingPet row is created and pet ownership is never
  // checked (see createBookingFromHold in spay-neuter.booking.service.ts).
  externalPetId: z.string().min(1).max(255).optional(),
  petNameSnapshot: z.string().max(120).optional(),
  speciesSnapshot: z.string().max(40).optional(),
  sexSnapshot: z.string().max(20).optional(),
  breedSnapshot: z.string().max(120).optional(),
  weightKgSnapshot: z.number().positive().optional(),
  ageMonthsSnapshot: z.number().int().positive().optional(),
  wasAlreadyNeuteredSnapshot: z.boolean().optional(),
  consentAccepted: z.literal(true),
  notes: z.string().max(1000).optional(),
  // See CreateBookingInput.platform in spay-neuter.booking.service.ts —
  // controls the EPS post-payment redirect target. Flutter must send 'mobile'.
  platform: z.enum(['web', 'mobile']).optional().default('web'),
});

// Optional so an older client build (or a curl/Postman call) never gets
// rejected outright — but every real client SHOULD send a fresh
// idempotencyKey per "Retry Payment" tap (same convention as
// createSlotHoldSchema above) so a network-level request retry replays the
// same server-side attempt instead of opening a second EPS transaction.
export const retryPaymentSchema = z.object({
  idempotencyKey: z.string().min(1).max(255).optional(),
  platform: z.enum(['web', 'mobile']).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const clinicStatusReasonSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const clinicCheckInSchema = z.object({
  actualArrivalAt: z.coerce.date().optional(),
});

export const manualRefundRequestSchema = z.object({
  amountBdt: z.number().positive(),
  reason: z.string().min(1).max(1000),
});

export const rejectRefundSchema = z.object({
  reviewNotes: z.string().min(1).max(1000),
});

export const approveRefundSchema = z.object({
  reviewNotes: z.string().max(1000).optional(),
});

export const processRefundSchema = z.object({
  externalRefundRef: z.string().min(1).max(255),
});

export const startOperationSchema = z.object({
  assignedDoctorId: z.string().uuid().optional(),
  operationLane: z.string().min(1).max(50).optional(),
});

export const completeOperationSchema = z.object({
  balanceCollectedBdt: z.number().min(0),
  clinicBalanceCollected: z.boolean().default(false),
});

export const clinicOperationListQuerySchema = z.object({
  search: z.string().max(120).optional(),
  status: z.string().optional(),
  procedure: z.enum(['neuter', 'spay']).optional(),
  assignedDoctorId: z.string().uuid().optional(),
  lane: z.string().max(50).optional(),
  fromDate: dateStringSchema.optional(),
  toDate: dateStringSchema.optional(),
  startTimeFrom: hhmm.optional(),
  startTimeTo: hhmm.optional(),
});

export const clinicBookingLookupQuerySchema = z
  .object({
    bookingCode: z.string().max(32).optional(),
    bookingNumber: z.string().max(64).optional(),
    qrToken: z.string().max(255).optional(),
  })
  .refine((value) => Boolean(value.bookingCode || value.bookingNumber || value.qrToken), {
    message: 'Provide bookingCode, bookingNumber, or qrToken',
  });

export const clinicMoveEarlierSchema = z.object({
  newStartAt: z.coerce.date(),
  reason: z.string().min(1).max(500),
  assignedDoctorId: z.string().uuid().optional(),
  operationLane: z.string().min(1).max(50).optional(),
});

export const startPreOpAssessmentSchema = z.object({});

export const completePreOpAssessmentSchema = z.object({
  weightKg: z.number().positive(),
  temperatureC: z.number().min(30).max(45),
  notes: z.string().max(2000).optional(),
  fastingConfirmed: z.boolean().default(false),
  isEatingNormally: z.boolean().optional(),
  isVomiting: z.boolean().optional(),
  hasRecentIllness: z.boolean().optional(),
  recentIllnessDetails: z.string().max(1000).optional(),
  currentMedications: z.string().max(1000).optional(),
  knownAllergies: z.string().max(1000).optional(),
  lastMealAt: z.coerce.date().optional(),
  fitnessDecision: z.enum(['fit', 'unfit']),
  fitnessReason: z.string().max(1000).optional(),
  assignedDoctorId: z.string().uuid().optional(),
})
  .refine((value) => value.fitnessDecision !== 'unfit' || Boolean(value.fitnessReason?.trim()), {
    message: 'fitnessReason is required when the pet is medically unfit',
    path: ['fitnessReason'],
  });

export const readyForOperationSchema = z.object({
  assignedDoctorId: z.string().uuid().optional(),
  operationLane: z.string().min(1).max(50).optional(),
});

export const postOperativeUpdateSchema = z.object({
  sendInstructions: z.boolean().default(true),
  followUpDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});

export const createSpayBookingSchema = z.object({
  holdId: z.string().uuid(),
  contactName: z.string().min(1).max(120),
  contactPhone: z.string().min(7).max(20),
  contactEmail: z.string().email().max(255).optional(),
  externalPetId: z.string().min(1).max(255).optional(),
  consentAccepted: z.literal(true),
  notes: z.string().max(1000).optional(),
});

export type CreateSpayOfferDto = z.infer<typeof createSpayOfferSchema>;
export type CreateSlotHoldDto = z.infer<typeof createSlotHoldSchema>;
export type CreateSpayBookingDto = z.infer<typeof createSpayBookingSchema>;
export type AvailableStartsQuery = z.infer<typeof availableStartsQuerySchema>;
export type AvailableDatesQuery = z.infer<typeof availableDatesQuerySchema>;
export type RescheduleBookingDto = z.infer<typeof rescheduleBookingSchema>;
export type CreateBookingDto = z.infer<typeof createBookingSchema>;
export type RetryPaymentDto = z.infer<typeof retryPaymentSchema>;
export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;
export type ClinicStatusReasonDto = z.infer<typeof clinicStatusReasonSchema>;
export type ClinicCheckInDto = z.infer<typeof clinicCheckInSchema>;
export type ManualRefundRequestDto = z.infer<typeof manualRefundRequestSchema>;
export type RejectRefundDto = z.infer<typeof rejectRefundSchema>;
export type ApproveRefundDto = z.infer<typeof approveRefundSchema>;
export type ProcessRefundDto = z.infer<typeof processRefundSchema>;
export type StartOperationDto = z.infer<typeof startOperationSchema>;
export type CompleteOperationDto = z.infer<typeof completeOperationSchema>;
export type ClinicOperationListQuery = z.infer<typeof clinicOperationListQuerySchema>;
export type ClinicBookingLookupQuery = z.infer<typeof clinicBookingLookupQuerySchema>;
export type ClinicMoveEarlierDto = z.infer<typeof clinicMoveEarlierSchema>;
export type StartPreOpAssessmentDto = z.infer<typeof startPreOpAssessmentSchema>;
export type CompletePreOpAssessmentDto = z.infer<typeof completePreOpAssessmentSchema>;
export type ReadyForOperationDto = z.infer<typeof readyForOperationSchema>;
export type PostOperativeUpdateDto = z.infer<typeof postOperativeUpdateSchema>;

// ─── Admin: offers, clinic profiles, schedule config ────────────────

// startsAt/endsAt are the campaign's service/operating period (Asia/Dhaka
// wall-clock, submitted with an explicit offset so the server never guesses
// the caller's timezone). bookingOpensAt/bookingClosesAt are the narrower
// booking/visibility window and may be null (open immediately / open until
// endsAt respectively). These are independent of clinic-level
// SpayClinicSchedule/SpaySlot, which stay clinic-scoped.
const offerDateFields = {
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  bookingOpensAt: z.string().datetime({ offset: true }).nullable().optional(),
  bookingClosesAt: z.string().datetime({ offset: true }).nullable().optional(),
};

function validateOfferDateOrdering(
  data: { startsAt?: string; endsAt?: string; bookingOpensAt?: string | null; bookingClosesAt?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.startsAt && data.endsAt && new Date(data.startsAt).getTime() >= new Date(data.endsAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Service end must be after service start' });
  }
  if (data.endsAt && data.bookingClosesAt && new Date(data.bookingClosesAt).getTime() > new Date(data.endsAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bookingClosesAt'], message: 'Booking close must be at or before the service end date' });
  }
  if (data.bookingOpensAt && data.bookingClosesAt && new Date(data.bookingOpensAt).getTime() >= new Date(data.bookingClosesAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bookingOpensAt'], message: 'Booking open must be before booking close' });
  }
  if (data.startsAt && data.bookingOpensAt && new Date(data.bookingOpensAt).getTime() < new Date(data.startsAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bookingOpensAt'], message: 'Booking cannot open before the service start date' });
  }
}

const offerBaseSchema = z.object({
  title: z.string().min(1).max(160),
  slug: z.string().min(1).max(180),
  summary: z.string().max(500).optional(),
  description: z.string().optional(),
  neuterTotalPriceBdt: z.number().positive(),
  spayTotalPriceBdt: z.number().positive(),
  advanceBdt: z.number().positive(),
  eligibilityText: z.string().optional(),
  medicalInstructions: z.string().optional(),
  fastingRules: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  medicallyUnfitRefundable: z.boolean().default(true),
  // Admin-curated homepage highlight — mirrors Campaign.isFeatured. Purely
  // presentational; price/dates/status remain sourced live from this same
  // row, never duplicated elsewhere.
  featuredOnHomepage: z.boolean().default(false),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().max(255).optional(),
  mobileImageId: z.string().uuid().nullable().optional(),
  webImageId: z.string().uuid().nullable().optional(),
  homepageThumbnailMediaId: z.string().uuid().nullable().optional(),
  ...offerDateFields,
});
export const upsertOfferSchema = offerBaseSchema.superRefine(validateOfferDateOrdering);
export const patchOfferSchema = offerBaseSchema.partial().superRefine(validateOfferDateOrdering);

export const linkOfferClinicSchema = z.object({ clinicBranchId: z.string().uuid() });

export const addOfferMediaSchema = z.object({
  mediaFileId: z.string().uuid(),
  altText: z.string().max(255).optional(),
  caption: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateOfferMediaSchema = z.object({
  altText: z.string().max(255).optional(),
  caption: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const createOfferVideoSchema = z.object({
  urlOrId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().max(512).optional().nullable(),
  customThumbnailMediaId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const updateOfferVideoSchema = z.object({
  urlOrId: z.string().optional(),
  title: z.string().max(255).optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().max(512).optional().nullable(),
  customThumbnailMediaId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

const clinicProfileFieldsSchema = z.object({
  clinicBranchId: z.string().uuid(),
  concurrentOperationCapacity: z.number().int().min(1),
  isAcceptingBookings: z.boolean().default(true),
  slotHoldMinutes: z.number().int().min(1).default(10),
  cancellationCutoffHours: z.number().int().min(0).default(24),
  arriveBeforeMinutes: z.number().int().min(0).default(20),
  checkinEarlyMinutes: z.number().int().min(0).default(60),
  bookingHorizonDays: z.number().int().min(1).default(30),
  timezone: z.string().default('Asia/Dhaka'),
});
// A booking-time earlier than the recommended-arrival window would let an
// owner following the "arrive 20 min early" guidance show up before
// check-in even opens — checked on create, where both fields are always
// present (defaulted); .superRefine() returns a ZodEffects, which has no
// .partial()/.omit(), so patchClinicProfileSchema derives from the plain
// object below instead, unaffected by this rule.
export const upsertClinicProfileSchema = clinicProfileFieldsSchema.superRefine((data, ctx) => {
  if (data.checkinEarlyMinutes < data.arriveBeforeMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkinEarlyMinutes'],
      message: 'Earliest check-in cannot be earlier than the recommended arrival time',
    });
  }
});
export const patchClinicProfileSchema = clinicProfileFieldsSchema.partial().omit({ clinicBranchId: true });

export const upsertClinicServiceSchema = z.object({
  procedure: z.enum(['neuter', 'spay']),
  durationMinutes: z.number().int().positive(),
  isActive: z.boolean().default(true),
});

export const addScheduleSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm });
export const addBreakSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm, label: z.string().max(120).optional() });
export const addBlockedPeriodSchema = z.object({ startAt: z.coerce.date(), endAt: z.coerce.date(), reason: z.string().max(255).optional() });
export const upsertDateExceptionSchema = z.object({
  exceptionDate: z.coerce.date(),
  isClosed: z.boolean(),
  overrideStartTime: hhmm.optional(),
  overrideEndTime: hhmm.optional(),
  reason: z.string().max(255).optional(),
});
// procedure is optional — omitted/null keeps the slot open to either
// service (matches every pre-existing manual slot); set it to scope this
// slot to one procedure only (see fetchDayWindowInputs).
export const createManualSlotSchema = z.object({
  slotDate: z.coerce.date(),
  startTime: hhmm,
  endTime: hhmm,
  capacity: z.number().int().min(1),
  procedure: z.enum(['neuter', 'spay']).nullable().optional(),
});

export const adminBookingListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(SpayBookingStatus).optional(),
  clinicBranchId: z.string().uuid().optional(),
  procedure: z.enum(['neuter', 'spay']).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  timeFrom: hhmm.optional(),
  timeTo: hhmm.optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  // "none" = no refund request exists at all for the booking
  refundStatus: z.enum(['none', 'pending', 'approved', 'rejected', 'processed']).optional(),
});

export const adminCompleteBookingSchema = z.object({
  balanceCollectedBdt: z.number().int().min(0).optional(),
  clinicBalanceCollected: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

export const adminCancelBookingSchema = z.object({
  reasonCode: z.nativeEnum(SpayCancellationReasonCode),
  note: z.string().max(1000).optional(),
}).refine((d) => d.reasonCode !== 'other' || Boolean(d.note?.trim()), {
  message: 'A note is required when reasonCode is "other"',
  path: ['note'],
});

export const reportQuerySchema = z.object({ fromDate: z.string().optional(), toDate: z.string().optional() });

export const reportFilterQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  clinicBranchId: z.string().uuid().optional(),
});

export const upcomingOperationsQuerySchema = reportFilterQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const bookingsExportQuerySchema = z.object({
  status: z.string().optional(),
  clinicBranchId: z.string().uuid().optional(),
  procedure: z.enum(['neuter', 'spay']).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type UpsertOfferBodyDto = z.infer<typeof upsertOfferSchema>;
export type PatchOfferBodyDto = z.infer<typeof patchOfferSchema>;
export type LinkOfferClinicDto = z.infer<typeof linkOfferClinicSchema>;
export type AddOfferMediaDto = z.infer<typeof addOfferMediaSchema>;
export type UpdateOfferMediaDto = z.infer<typeof updateOfferMediaSchema>;
export type CreateOfferVideoDto = z.infer<typeof createOfferVideoSchema>;
export type UpdateOfferVideoDto = z.infer<typeof updateOfferVideoSchema>;
export type ReorderDto = z.infer<typeof reorderSchema>;
export type UpsertClinicProfileBodyDto = z.infer<typeof upsertClinicProfileSchema>;
export type PatchClinicProfileBodyDto = z.infer<typeof patchClinicProfileSchema>;
export type UpsertClinicServiceDto = z.infer<typeof upsertClinicServiceSchema>;
export type AddScheduleDto = z.infer<typeof addScheduleSchema>;
export type AddBreakDto = z.infer<typeof addBreakSchema>;
export type AddBlockedPeriodDto = z.infer<typeof addBlockedPeriodSchema>;
export type UpsertDateExceptionDto = z.infer<typeof upsertDateExceptionSchema>;
export type CreateManualSlotDto = z.infer<typeof createManualSlotSchema>;
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;
export type AdminCompleteBookingDto = z.infer<typeof adminCompleteBookingSchema>;
export type AdminCancelBookingDto = z.infer<typeof adminCancelBookingSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportFilterQuery = z.infer<typeof reportFilterQuerySchema>;
export type UpcomingOperationsQuery = z.infer<typeof upcomingOperationsQuerySchema>;
export type BookingsExportQuery = z.infer<typeof bookingsExportQuerySchema>;
