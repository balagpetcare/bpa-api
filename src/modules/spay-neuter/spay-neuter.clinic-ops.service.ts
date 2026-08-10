import type { Prisma, SpayBookingStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog, type AuditContext } from '../../utils/audit';
import { isCheckinAllowed } from './spay-neuter.domain';
import { markMedicallyUnfit } from './spay-neuter.cancellation.service';
import { rescheduleBooking } from './spay-neuter.hold.service';
import { notifySpayCheckInCompleted, notifySpayOperationCompleted, notifySpayPostOperativeCare } from './spay-neuter.notifications';

export type OperationTransitionInput = {
  bookingId: string;
  fromStatuses: SpayBookingStatus[];
  toStatus: SpayBookingStatus;
  bookingData?: Prisma.SpayBookingUpdateManyMutationInput;
  historyReason: string;
  changedById?: string;
};

// Exported so the admin-console completion path (spay-neuter.controller.ts /
// admin router) can reuse the exact same compare-and-swap + status-history
// write, instead of re-implementing it.
export async function transitionBooking(input: OperationTransitionInput) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (!input.fromStatuses.includes(booking.status)) {
    throw AppError.conflict(`Cannot move a ${booking.status} booking to ${input.toStatus}`, 'SPAY_INVALID_TRANSITION');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.spayBooking.updateMany({
      where: { id: input.bookingId, status: { in: input.fromStatuses } },
      data: { status: input.toStatus, ...(input.bookingData ?? {}) },
    });
    if (updated.count !== 1) throw AppError.conflict('Booking was modified concurrently, please retry', 'SPAY_CONCURRENT_UPDATE');

    await tx.spayBookingStatusHistory.create({
      data: {
        bookingId: input.bookingId,
        fromStatus: booking.status as never,
        toStatus: input.toStatus as never,
        reason: input.historyReason,
        changedById: input.changedById,
      },
    });

    return tx.spayBooking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: {
        pets: { include: { questionnaire: true } },
        assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
        payment: true,
      },
    });
  });
}

async function ensureDoctorIsActive(assignedDoctorId?: string) {
  if (!assignedDoctorId) return;
  const doctor = await prisma.doctor.findUnique({ where: { id: assignedDoctorId } });
  if (!doctor || !doctor.isActive) {
    throw AppError.badRequest('Assigned doctor is not active', 'SPAY_DOCTOR_INACTIVE');
  }
}

export async function checkInBooking(
  bookingId: string,
  staffUserId: string,
  actualArrivalAt?: Date,
  auditCtx: AuditContext = {},
) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (!isCheckinAllowed(booking.checkinOpensAt)) {
    throw AppError.badRequest('Check-in opens 1 hour before the operation time', 'SPAY_CHECKIN_NOT_OPEN');
  }

  const checkedInAt = new Date();
  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ['confirmed'],
    toStatus: 'checked_in',
    bookingData: { checkedInAt, actualArrivalAt: actualArrivalAt ?? checkedInAt },
    historyReason: 'Checked in at clinic',
    changedById: staffUserId,
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: { status: 'checked_in', actualArrivalAt: (actualArrivalAt ?? checkedInAt).toISOString() },
    },
    auditCtx,
  );

  await notifySpayCheckInCompleted(bookingId);

  return updated;
}

export async function startPreOpAssessment(bookingId: string, staffUserId: string, auditCtx: AuditContext = {}) {
  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ['checked_in'],
    toStatus: 'pre_op_assessment',
    historyReason: 'Pre-operative assessment started',
    changedById: staffUserId,
  });

  await writeAuditLog(
    { action: 'update', resource: 'spay_checkin', resourceId: bookingId, newValues: { status: 'pre_op_assessment' } },
    auditCtx,
  );

  await notifySpayOperationCompleted(bookingId);

  return updated;
}

type CompletePreOpAssessmentInput = {
  weightKg: number;
  temperatureC: number;
  notes?: string;
  fastingConfirmed: boolean;
  isEatingNormally?: boolean;
  isVomiting?: boolean;
  hasRecentIllness?: boolean;
  recentIllnessDetails?: string;
  currentMedications?: string;
  knownAllergies?: string;
  lastMealAt?: Date;
  fitnessDecision: 'fit' | 'unfit';
  fitnessReason?: string;
  assignedDoctorId?: string;
};

export async function completePreOpAssessment(
  bookingId: string,
  staffUserId: string,
  input: CompletePreOpAssessmentInput,
  auditCtx: AuditContext = {},
) {
  await ensureDoctorIsActive(input.assignedDoctorId);

  const booking = await prisma.spayBooking.findUnique({
    where: { id: bookingId },
    include: { pets: { select: { id: true }, take: 1 } },
  });
  if (!booking) throw AppError.notFound('Booking');
  if (!['checked_in', 'pre_op_assessment'].includes(booking.status)) {
    throw AppError.conflict(`Cannot assess a ${booking.status} booking`, 'SPAY_INVALID_TRANSITION');
  }
  const bookingPetId = booking.pets[0]?.id;
  if (!bookingPetId) throw AppError.conflict('Booking has no pet record to assess', 'SPAY_BOOKING_PET_MISSING');

  await prisma.$transaction(async (tx) => {
    if (booking.status === 'checked_in') {
      const moved = await tx.spayBooking.updateMany({
        where: { id: bookingId, status: 'checked_in' },
        data: { status: 'pre_op_assessment' },
      });
      if (moved.count !== 1) throw AppError.conflict('Booking was modified concurrently, please retry', 'SPAY_CONCURRENT_UPDATE');

      await tx.spayBookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: 'checked_in',
          toStatus: 'pre_op_assessment',
          reason: 'Pre-operative assessment started',
          changedById: staffUserId,
        },
      });
    }

    await tx.spayMedicalQuestionnaire.upsert({
      where: { bookingPetId },
      update: {
        vetWeightKg: input.weightKg,
        vetTemperatureC: input.temperatureC,
        vetAssessmentNotes: input.notes,
        fastingConfirmed: input.fastingConfirmed,
        isEatingNormally: input.isEatingNormally,
        isVomiting: input.isVomiting,
        hasRecentIllness: input.hasRecentIllness,
        recentIllnessDetails: input.recentIllnessDetails,
        currentMedications: input.currentMedications,
        knownAllergies: input.knownAllergies,
        lastMealAt: input.lastMealAt,
        isEligibleForSurgery: input.fitnessDecision === 'fit',
        ineligibilityReason: input.fitnessDecision === 'unfit' ? input.fitnessReason : null,
        assessedById: staffUserId,
        assessedAt: new Date(),
      },
      create: {
        bookingPetId,
        vetWeightKg: input.weightKg,
        vetTemperatureC: input.temperatureC,
        vetAssessmentNotes: input.notes,
        fastingConfirmed: input.fastingConfirmed,
        isEatingNormally: input.isEatingNormally,
        isVomiting: input.isVomiting,
        hasRecentIllness: input.hasRecentIllness,
        recentIllnessDetails: input.recentIllnessDetails,
        currentMedications: input.currentMedications,
        knownAllergies: input.knownAllergies,
        lastMealAt: input.lastMealAt,
        isEligibleForSurgery: input.fitnessDecision === 'fit',
        ineligibilityReason: input.fitnessDecision === 'unfit' ? input.fitnessReason : null,
        assessedById: staffUserId,
        assessedAt: new Date(),
      },
    });

    if (input.assignedDoctorId) {
      await tx.spayBooking.update({
        where: { id: bookingId },
        data: { assignedDoctorId: input.assignedDoctorId },
      });
    }
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: {
        status: 'pre_op_assessment',
        fitnessDecision: input.fitnessDecision,
        weightKg: input.weightKg,
        temperatureC: input.temperatureC,
        assignedDoctorId: input.assignedDoctorId ?? null,
      },
    },
    auditCtx,
  );

  if (input.fitnessDecision === 'unfit') {
    await markMedicallyUnfit(
      { bookingId, staffUserId, reason: input.fitnessReason?.trim() || 'Pre-operative assessment marked the pet medically unfit' },
      auditCtx,
    );

    return prisma.spayBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        pets: { include: { questionnaire: true } },
        assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
        payment: true,
      },
    });
  }

  return prisma.spayBooking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      pets: { include: { questionnaire: true } },
      assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
      payment: true,
    },
  });
}

type ReadyForOperationInput = {
  assignedDoctorId?: string;
  operationLane?: string;
};

export async function markReadyForOperation(
  bookingId: string,
  staffUserId: string,
  input: ReadyForOperationInput,
  auditCtx: AuditContext = {},
) {
  await ensureDoctorIsActive(input.assignedDoctorId);

  const booking = await prisma.spayBooking.findUnique({
    where: { id: bookingId },
    include: { pets: { include: { questionnaire: true }, take: 1 } },
  });
  if (!booking) throw AppError.notFound('Booking');
  const questionnaire = booking.pets[0]?.questionnaire;
  if (!questionnaire?.isEligibleForSurgery) {
    throw AppError.badRequest('Pre-operative assessment must mark the pet fit before operation can be readied', 'SPAY_PRE_OP_NOT_FIT');
  }

  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ['pre_op_assessment'],
    toStatus: 'ready_for_operation',
    bookingData: {
      ...(input.assignedDoctorId ? { assignedDoctorId: input.assignedDoctorId } : {}),
      ...(input.operationLane ? { operationLane: input.operationLane } : {}),
    },
    historyReason: 'Ready for operation',
    changedById: staffUserId,
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: { status: 'ready_for_operation', assignedDoctorId: input.assignedDoctorId ?? null, operationLane: input.operationLane ?? null },
    },
    auditCtx,
  );

  return updated;
}

type MoveEarlierInput = {
  newStartAt: Date;
  reason: string;
  assignedDoctorId?: string;
  operationLane?: string;
};

export async function moveCheckedInBookingEarlier(
  bookingId: string,
  staffUserId: string,
  input: MoveEarlierInput,
  auditCtx: AuditContext = {},
) {
  await ensureDoctorIsActive(input.assignedDoctorId);

  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (!['checked_in', 'pre_op_assessment', 'ready_for_operation'].includes(booking.status)) {
    throw AppError.badRequest('Only checked-in or pre-operative bookings can be moved earlier', 'SPAY_MOVE_EARLIER_NOT_ALLOWED');
  }
  if (input.newStartAt.getTime() >= booking.scheduledStartAt.getTime()) {
    throw AppError.badRequest('New operation time must be earlier than the booked operation time', 'SPAY_MOVE_EARLIER_ONLY');
  }

  await rescheduleBooking(
    bookingId,
    input.newStartAt,
    `Clinic override: ${input.reason}`,
    staffUserId,
    auditCtx,
    ['checked_in', 'pre_op_assessment', 'ready_for_operation'], // matches this function's own pre-check above — explicit, not inherited from the (now narrower) owner-facing default
  );

  const updated = await prisma.spayBooking.update({
    where: { id: bookingId },
    data: {
      ...(input.assignedDoctorId ? { assignedDoctorId: input.assignedDoctorId } : {}),
      ...(input.operationLane ? { operationLane: input.operationLane } : {}),
    },
    include: {
      pets: { include: { questionnaire: true } },
      assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
      payment: true,
    },
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      reason: input.reason,
      newValues: {
        override: 'move_earlier',
        previousScheduledStartAt: booking.scheduledStartAt.toISOString(),
        scheduledStartAt: input.newStartAt.toISOString(),
        assignedDoctorId: input.assignedDoctorId ?? booking.assignedDoctorId ?? null,
        operationLane: input.operationLane ?? booking.operationLane ?? null,
      },
    },
    auditCtx,
  );

  return updated;
}

type StartOperationInput = {
  assignedDoctorId?: string;
  operationLane?: string;
};

export async function startOperation(
  bookingId: string,
  staffUserId: string,
  input: StartOperationInput,
  auditCtx: AuditContext = {},
) {
  await ensureDoctorIsActive(input.assignedDoctorId);

  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ['ready_for_operation'],
    toStatus: 'in_operation',
    bookingData: {
      operationStartedAt: new Date(),
      ...(input.assignedDoctorId ? { assignedDoctorId: input.assignedDoctorId } : {}),
      ...(input.operationLane ? { operationLane: input.operationLane } : {}),
    },
    historyReason: 'Operation started',
    changedById: staffUserId,
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: { status: 'in_operation', assignedDoctorId: input.assignedDoctorId ?? null, operationLane: input.operationLane ?? null },
    },
    auditCtx,
  );

  return updated;
}

export async function completeOperation(
  bookingId: string,
  staffUserId: string,
  balanceCollectedBdt: number,
  clinicBalanceCollected: boolean,
  auditCtx: AuditContext = {},
) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (balanceCollectedBdt < 0 || balanceCollectedBdt > Number(booking.balanceDueBdt)) {
    throw AppError.badRequest('Balance collected must be between 0 and the balance due', 'SPAY_INVALID_BALANCE_COLLECTED');
  }

  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ['in_operation'],
    toStatus: 'completed',
    bookingData: {
      operationCompletedAt: new Date(),
      balanceCollectedBdt,
      clinicBalanceCollected,
    },
    historyReason: 'Operation completed',
    changedById: staffUserId,
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: { status: 'completed', balanceCollectedBdt, clinicBalanceCollected },
    },
    auditCtx,
  );

  return updated;
}

// ─── Admin-console completion ───────────────────────────────────────
// Deliberately more lenient than completeOperation() above: an admin
// verifying a procedure that was actually performed at the clinic but
// wasn't tracked step-by-step through the digital pipeline (check-in ->
// pre-op -> ready -> in_operation) can still record it as completed from
// any of those intermediate statuses — but never from a terminal state
// (completed/cancelled/no_show/refund_*), which transitionBooking's
// allowlist check already rejects with SPAY_INVALID_TRANSITION.
const ADMIN_COMPLETABLE_FROM_STATUSES: SpayBookingStatus[] = [
  'confirmed', 'checked_in', 'pre_op_assessment', 'ready_for_operation', 'in_operation',
];

export type AdminMarkCompletedInput = {
  balanceCollectedBdt?: number;
  clinicBalanceCollected?: boolean;
  note?: string;
};

export async function adminMarkCompleted(
  bookingId: string,
  adminUserId: string,
  input: AdminMarkCompletedInput,
  auditCtx: AuditContext = {},
) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');

  const balanceCollectedBdt = input.balanceCollectedBdt ?? 0;
  if (balanceCollectedBdt < 0 || balanceCollectedBdt > Number(booking.balanceDueBdt)) {
    throw AppError.badRequest('Balance collected must be between 0 and the balance due', 'SPAY_INVALID_BALANCE_COLLECTED');
  }

  // Clinic-collected cash/card is informational only — BPA's accounting
  // model has no structured "payment method" field, so it's recorded in
  // the history reason text rather than implied as a processed payment.
  const historyReason = [
    'Marked completed by admin',
    input.clinicBalanceCollected ? `— balance collected at clinic (৳${balanceCollectedBdt}, informational only)` : null,
    input.note ? `— note: ${input.note}` : null,
  ].filter(Boolean).join(' ');

  const updated = await transitionBooking({
    bookingId,
    fromStatuses: ADMIN_COMPLETABLE_FROM_STATUSES,
    toStatus: 'completed',
    bookingData: {
      operationCompletedAt: new Date(),
      balanceCollectedBdt,
      clinicBalanceCollected: input.clinicBalanceCollected ?? false,
    },
    historyReason,
    changedById: adminUserId,
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_bookings',
      resourceId: bookingId,
      newValues: { status: 'completed', balanceCollectedBdt, clinicBalanceCollected: input.clinicBalanceCollected ?? false, note: input.note ?? null },
      reason: 'Admin console: mark completed',
    },
    auditCtx,
  );

  return updated;
}

type PostOperativeUpdateInput = {
  sendInstructions: boolean;
  followUpDate?: Date;
  notes?: string;
};

export async function sendPostOperativeUpdate(
  bookingId: string,
  staffUserId: string,
  input: PostOperativeUpdateInput,
  auditCtx: AuditContext = {},
) {
  const booking = await prisma.spayBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw AppError.notFound('Booking');
  if (booking.status !== 'completed') {
    throw AppError.badRequest('Post-operative updates are only allowed after completion', 'SPAY_POST_OP_NOT_ALLOWED');
  }

  const updated = await prisma.spayBooking.update({
    where: { id: bookingId },
    data: {
      postOpInstructionsSentAt: input.sendInstructions ? new Date() : booking.postOpInstructionsSentAt,
      followUpDate: input.followUpDate,
      followUpNotes: input.notes,
    },
    include: {
      pets: { include: { questionnaire: true } },
      assignedDoctor: { select: { id: true, name: true, licenseNumber: true } },
      payment: true,
    },
  });

  await writeAuditLog(
    {
      action: 'update',
      resource: 'spay_checkin',
      resourceId: bookingId,
      newValues: {
        postOpInstructionsSentAt: updated.postOpInstructionsSentAt?.toISOString() ?? null,
        followUpDate: updated.followUpDate?.toISOString() ?? null,
      },
    },
    auditCtx,
  );

  await prisma.spayBookingStatusHistory.create({
    data: {
      bookingId,
      fromStatus: booking.status as never,
      toStatus: booking.status as never,
      reason: `Post-operative instructions ${input.sendInstructions ? 'sent' : 'updated'}${input.followUpDate ? ' and follow-up scheduled' : ''}`,
      changedById: staffUserId,
    },
  });

  if (input.sendInstructions || input.followUpDate) {
    await notifySpayPostOperativeCare(bookingId);
  }

  return updated;
}
