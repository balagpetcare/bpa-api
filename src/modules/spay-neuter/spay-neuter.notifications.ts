import { NotificationCategory } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { enqueueIfNew, publishOutboxEvent, type DomainEventType } from '../push-notifications/outbox';
import { DHAKA_TIME_ZONE, dhakaWallClockToUtc, toDhakaDateString, toDhakaDisplay } from './spay-neuter.timezone';

const REMINDER_EVENT_TYPES = [
  'SPAY_BOOKING_REMINDER_24H',
  'SPAY_FASTING_REMINDER_6H',
  'SPAY_ARRIVAL_REMINDER_1H',
  'SPAY_FOLLOW_UP_REMINDER',
] as const;

const ACTIVE_REMINDER_STATUSES = ['confirmed'] as const;

type SpayNotificationBooking = {
  id: string;
  bookingNumber: string;
  bookingCode: string;
  centralAuthUserId: string;
  contactName: string;
  contactEmail: string | null;
  clinicNameSnapshot: string;
  clinicAddressSnapshot: string | null;
  scheduledStartAt: Date;
  arriveByAt: Date;
  checkinOpensAt: Date;
  followUpDate: Date | null;
};

type PublishSpayNotificationInput = {
  booking: SpayNotificationBooking;
  eventType: DomainEventType;
  dedupeKey: string;
  category: NotificationCategory;
  priority?: 'normal' | 'high' | 'critical';
  title: string;
  titleBn?: string;
  body: string;
  bodyBn?: string;
  emailSubject?: string;
  emailSubjectBn?: string;
};

function spayBookingDeepLink(bookingId: string): string {
  return `bpa://spay-neuter/bookings/${bookingId}`;
}

function formatScheduleLine(booking: SpayNotificationBooking): string {
  const operation = toDhakaDisplay(booking.scheduledStartAt);
  const arrival = toDhakaDisplay(booking.arriveByAt);
  return `${operation.date} at ${operation.time} (arrive by ${arrival.time})`;
}

function formatFollowUpLine(booking: SpayNotificationBooking): string | null {
  if (!booking.followUpDate) return null;
  const followUp = toDhakaDisplay(booking.followUpDate);
  return `${followUp.date} at ${followUp.time}`;
}

async function ensureNotificationRecipient(booking: SpayNotificationBooking): Promise<string | null> {
  const existing = await prisma.user.findFirst({
    where: { centralAuthUserId: booking.centralAuthUserId, deletedAt: null },
    select: { id: true, email: true },
  });
  if (existing) {
    if (!existing.email && booking.contactEmail) {
      try {
        await prisma.user.update({
          where: { id: existing.id },
          data: { email: booking.contactEmail },
        });
      } catch {
        // Keep the local mapping even if the contact email collides with
        // another account; inbox/push can still flow via the local user id.
      }
    }
    return existing.id;
  }

  try {
    const created = await prisma.user.create({
      data: {
        centralAuthUserId: booking.centralAuthUserId,
        name: booking.contactName || 'BPA App User',
        email: booking.contactEmail || undefined,
        role: 'USER',
      },
      select: { id: true },
    });
    return created.id;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const winner = await prisma.user.findFirst({
        where: { centralAuthUserId: booking.centralAuthUserId, deletedAt: null },
        select: { id: true },
      });
      return winner?.id ?? null;
    }
    throw err;
  }
}

async function loadBookingForNotifications(bookingId: string): Promise<SpayNotificationBooking | null> {
  return prisma.spayBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNumber: true,
      bookingCode: true,
      centralAuthUserId: true,
      contactName: true,
      contactEmail: true,
      clinicNameSnapshot: true,
      clinicAddressSnapshot: true,
      scheduledStartAt: true,
      arriveByAt: true,
      checkinOpensAt: true,
      followUpDate: true,
    },
  });
}

async function publishSpayNotification(input: PublishSpayNotificationInput): Promise<void> {
  const userId = await ensureNotificationRecipient(input.booking);
  if (!userId) return;

  const result = await publishOutboxEvent({
    eventType: input.eventType,
    entityType: 'spay_booking',
    entityId: input.booking.id,
    dedupeKey: input.dedupeKey,
    payload: {
      category: input.category,
      priority: input.priority ?? 'normal',
      title: input.title,
      titleBn: input.titleBn,
      body: input.body,
      bodyBn: input.bodyBn,
      deepLink: spayBookingDeepLink(input.booking.id),
      targetUserIds: [userId],
      alwaysCreateInbox: true,
      email: {
        subject: input.emailSubject ?? input.title,
        subjectBn: input.emailSubjectBn ?? input.titleBn,
        text: input.body,
        textBn: input.bodyBn,
        html: `<p>${input.body}</p><p><strong>Booking code:</strong> ${input.booking.bookingCode}</p>`,
        htmlBn: input.bodyBn
          ? `<p>${input.bodyBn}</p><p><strong>Booking code:</strong> ${input.booking.bookingCode}</p>`
          : undefined,
      },
    },
  });
  await enqueueIfNew(result);
}

export async function archiveSpayReminderNotifications(bookingId: string, reason: string): Promise<void> {
  const notifications = await prisma.userNotification.findMany({
    where: {
      entityType: 'spay_booking',
      entityId: bookingId,
      eventType: { in: [...REMINDER_EVENT_TYPES] },
      status: { in: ['unread', 'read'] },
    },
    select: { id: true },
  });
  const notificationIds = notifications.map((notification) => notification.id);

  if (notificationIds.length > 0) {
    await prisma.userNotification.updateMany({
      where: { id: { in: notificationIds } },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await prisma.notificationDelivery.updateMany({
      where: {
        userNotificationId: { in: notificationIds },
        status: 'pending',
      },
      data: { status: 'failed', lastError: reason, failedAt: new Date() },
    });
  }
}

function withinWindow(target: Date, now: Date, lookbackMinutes: number): boolean {
  const lowerBound = now.getTime() - lookbackMinutes * 60_000;
  const upperBound = now.getTime() + lookbackMinutes * 60_000;
  return target.getTime() >= lowerBound && target.getTime() <= upperBound;
}

function resolveFollowUpReminderAt(followUpDate: Date): Date {
  const dateStr = toDhakaDateString(followUpDate);
  return dhakaWallClockToUtc(dateStr, '09:00');
}

export async function runSpayReminderScan(now: Date = new Date(), lookbackMinutes = 10) {
  const summary = {
    bookingReminder24h: 0,
    fastingReminder6h: 0,
    arrivalReminder1h: 0,
    followUpReminder: 0,
  };

  const activeBookings = await prisma.spayBooking.findMany({
    where: {
      status: { in: [...ACTIVE_REMINDER_STATUSES] },
      scheduledStartAt: {
        gte: new Date(now.getTime() - 24 * 60 * 60_000),
        lte: new Date(now.getTime() + 25 * 60 * 60_000),
      },
    },
    select: {
      id: true,
      bookingNumber: true,
      bookingCode: true,
      centralAuthUserId: true,
      contactName: true,
      contactEmail: true,
      clinicNameSnapshot: true,
      clinicAddressSnapshot: true,
      scheduledStartAt: true,
      arriveByAt: true,
      checkinOpensAt: true,
      followUpDate: true,
    },
  });

  for (const booking of activeBookings) {
    const reminder24hAt = new Date(booking.scheduledStartAt.getTime() - 24 * 60 * 60_000);
    if (withinWindow(reminder24hAt, now, lookbackMinutes)) {
      await publishSpayNotification({
        booking,
        eventType: 'SPAY_BOOKING_REMINDER_24H',
        dedupeKey: `spay_booking_reminder_24h:${booking.id}:${booking.scheduledStartAt.toISOString()}`,
        category: 'booking',
        title: 'Spay & Neuter booking reminder',
        titleBn: 'স্পে/নিউটার বুকিং রিমাইন্ডার',
        body: `Your booking ${booking.bookingNumber} is scheduled for ${formatScheduleLine(booking)} at ${booking.clinicNameSnapshot}.`,
        bodyBn: `আপনার বুকিং ${booking.bookingNumber} ${toDhakaDisplay(booking.scheduledStartAt).date} তারিখ ${toDhakaDisplay(booking.scheduledStartAt).time} এ ${booking.clinicNameSnapshot}-এ নির্ধারিত আছে।`,
        emailSubject: `Booking reminder: ${booking.bookingNumber}`,
      });
      summary.bookingReminder24h += 1;
    }

    const fastingReminderAt = new Date(booking.scheduledStartAt.getTime() - 6 * 60 * 60_000);
    if (withinWindow(fastingReminderAt, now, lookbackMinutes)) {
      await publishSpayNotification({
        booking,
        eventType: 'SPAY_FASTING_REMINDER_6H',
        dedupeKey: `spay_fasting_reminder_6h:${booking.id}:${booking.scheduledStartAt.toISOString()}`,
        category: 'booking',
        priority: 'high',
        title: 'Fasting reminder',
        titleBn: 'ফাস্টিং রিমাইন্ডার',
        body: `Please follow the fasting instructions for booking ${booking.bookingNumber}. Operation time: ${formatScheduleLine(booking)}.`,
        bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য ফাস্টিং নির্দেশনা অনুসরণ করুন। অপারেশনের সময় ${toDhakaDisplay(booking.scheduledStartAt).date} ${toDhakaDisplay(booking.scheduledStartAt).time}।`,
        emailSubject: `Fasting reminder: ${booking.bookingNumber}`,
      });
      summary.fastingReminder6h += 1;
    }

    const arrivalReminderAt = new Date(booking.scheduledStartAt.getTime() - 60 * 60_000);
    if (withinWindow(arrivalReminderAt, now, lookbackMinutes)) {
      await publishSpayNotification({
        booking,
        eventType: 'SPAY_ARRIVAL_REMINDER_1H',
        dedupeKey: `spay_arrival_reminder_1h:${booking.id}:${booking.scheduledStartAt.toISOString()}`,
        category: 'booking',
        priority: 'high',
        title: 'Arrival reminder',
        titleBn: 'আগমনের রিমাইন্ডার',
        body: `Check-in is now open for booking ${booking.bookingNumber}. Recommended arrival: ${toDhakaDisplay(booking.arriveByAt).time}; operation time: ${toDhakaDisplay(booking.scheduledStartAt).time}.`,
        bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য এখন চেক-ইন খোলা আছে। প্রস্তাবিত আগমনের সময় ${toDhakaDisplay(booking.arriveByAt).time}; অপারেশনের সময় ${toDhakaDisplay(booking.scheduledStartAt).time}।`,
        emailSubject: `Arrival reminder: ${booking.bookingNumber}`,
      });
      summary.arrivalReminder1h += 1;
    }
  }

  const followUpBookings = await prisma.spayBooking.findMany({
    where: {
      status: 'completed',
      followUpDate: {
        gte: new Date(now.getTime() - 24 * 60 * 60_000),
        lte: new Date(now.getTime() + 24 * 60 * 60_000),
      },
    },
    select: {
      id: true,
      bookingNumber: true,
      bookingCode: true,
      centralAuthUserId: true,
      contactName: true,
      contactEmail: true,
      clinicNameSnapshot: true,
      clinicAddressSnapshot: true,
      scheduledStartAt: true,
      arriveByAt: true,
      checkinOpensAt: true,
      followUpDate: true,
    },
  });

  for (const booking of followUpBookings) {
    if (!booking.followUpDate) continue;
    const followUpReminderAt = resolveFollowUpReminderAt(booking.followUpDate);
    if (!withinWindow(followUpReminderAt, now, lookbackMinutes)) continue;

    await publishSpayNotification({
      booking,
      eventType: 'SPAY_FOLLOW_UP_REMINDER',
      dedupeKey: `spay_follow_up_reminder:${booking.id}:${booking.followUpDate.toISOString()}`,
      category: 'booking',
      title: 'Follow-up reminder',
      titleBn: 'ফলো-আপ রিমাইন্ডার',
      body: `Your follow-up for booking ${booking.bookingNumber} is due on ${formatFollowUpLine(booking)} at ${booking.clinicNameSnapshot}.`,
      bodyBn: `বুকিং ${booking.bookingNumber} এর ফলো-আপ ${formatFollowUpLine(booking)} এ ${booking.clinicNameSnapshot}-এ নির্ধারিত আছে।`,
      emailSubject: `Follow-up reminder: ${booking.bookingNumber}`,
    });
    summary.followUpReminder += 1;
  }

  return summary;
}

export function startSpayReminderScanJob(): NodeJS.Timeout {
  runSpayReminderScan()
    .then((summary) => console.log('[SpayReminderScan] initial scan:', summary))
    .catch((err) => console.error('[SpayReminderScan] initial scan failed:', err));

  return setInterval(() => {
    runSpayReminderScan()
      .then((summary) => console.log('[SpayReminderScan] scan:', summary))
      .catch((err) => console.error('[SpayReminderScan] scan failed:', err));
  }, 5 * 60 * 1000);
}

export async function notifySpayPaymentSuccessful(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_PAYMENT_SUCCESS',
    dedupeKey: `spay_payment_success:${booking.id}`,
    category: 'payment',
    title: 'Advance payment successful',
    titleBn: 'অগ্রিম পেমেন্ট সফল হয়েছে',
    body: `We received the BDT 500 advance for booking ${booking.bookingNumber}.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য BDT 500 অগ্রিম পেমেন্ট গ্রহণ করা হয়েছে।`,
    emailSubject: `Payment successful: ${booking.bookingNumber}`,
  });
}

export async function notifySpayBookingConfirmed(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_BOOKING_CONFIRMED',
    dedupeKey: `spay_booking_confirmed:${booking.id}`,
    category: 'booking',
    title: 'Booking confirmed',
    titleBn: 'বুকিং নিশ্চিত হয়েছে',
    body: `Booking ${booking.bookingNumber} is confirmed for ${formatScheduleLine(booking)} at ${booking.clinicNameSnapshot}.`,
    bodyBn: `বুকিং ${booking.bookingNumber} ${toDhakaDisplay(booking.scheduledStartAt).date} তারিখ ${toDhakaDisplay(booking.scheduledStartAt).time} এ ${booking.clinicNameSnapshot}-এ নিশ্চিত হয়েছে।`,
    emailSubject: `Booking confirmed: ${booking.bookingNumber}`,
  });
}

export async function notifySpaySlipReady(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_BOOKING_SLIP_READY',
    dedupeKey: `spay_booking_slip_ready:${booking.id}`,
    category: 'booking',
    title: 'Booking slip and QR are ready',
    titleBn: 'বুকিং স্লিপ ও QR প্রস্তুত',
    body: `Your booking code ${booking.bookingCode} and QR slip are ready in the app inbox.`,
    bodyBn: `আপনার বুকিং কোড ${booking.bookingCode} এবং QR স্লিপ এখন অ্যাপে প্রস্তুত আছে।`,
    emailSubject: `Booking slip ready: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRescheduled(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_BOOKING_RESCHEDULED',
    dedupeKey: `spay_booking_rescheduled:${booking.id}:${booking.scheduledStartAt.toISOString()}`,
    category: 'booking',
    title: 'Booking rescheduled',
    titleBn: 'বুকিং পুনঃনির্ধারিত হয়েছে',
    body: `Booking ${booking.bookingNumber} is now scheduled for ${formatScheduleLine(booking)}.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এখন ${toDhakaDisplay(booking.scheduledStartAt).date} ${toDhakaDisplay(booking.scheduledStartAt).time} এ নির্ধারিত আছে।`,
    emailSubject: `Booking rescheduled: ${booking.bookingNumber}`,
  });
}

export async function notifySpayCancellation(
  bookingId: string,
  eventType: 'SPAY_BOOKING_CANCELLED',
  title: string,
  titleBn: string,
  body: string,
  bodyBn: string,
): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType,
    dedupeKey: `spay_booking_cancelled:${booking.id}:${title.toLowerCase().replace(/\s+/g, '_')}`,
    category: 'booking',
    priority: 'high',
    title,
    titleBn,
    body,
    bodyBn,
    emailSubject: `${title}: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRefundRequested(bookingId: string, refundRequestId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_REFUND_REQUESTED',
    dedupeKey: `spay_refund_requested:${refundRequestId}`,
    category: 'payment',
    title: 'Refund request submitted',
    titleBn: 'রিফান্ড অনুরোধ জমা হয়েছে',
    body: `A manual refund request has been recorded for booking ${booking.bookingNumber}.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য একটি ম্যানুয়াল রিফান্ড অনুরোধ নথিভুক্ত হয়েছে।`,
    emailSubject: `Refund requested: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRefundApproved(bookingId: string, refundRequestId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_REFUND_APPROVED',
    dedupeKey: `spay_refund_approved:${refundRequestId}`,
    category: 'payment',
    title: 'Refund approved',
    titleBn: 'রিফান্ড অনুমোদিত হয়েছে',
    body: `Your refund request for booking ${booking.bookingNumber} has been approved.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য আপনার রিফান্ড অনুরোধ অনুমোদিত হয়েছে।`,
    emailSubject: `Refund approved: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRefundInitiated(bookingId: string, refundRequestId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_REFUND_INITIATED',
    dedupeKey: `spay_refund_initiated:${refundRequestId}`,
    category: 'payment',
    title: 'Refund initiated',
    titleBn: 'রিফান্ড প্রক্রিয়া শুরু হয়েছে',
    body: `The approved refund for booking ${booking.bookingNumber} is now pending manual payout processing.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর অনুমোদিত রিফান্ড এখন ম্যানুয়াল পেআউট প্রক্রিয়ায় আছে।`,
    emailSubject: `Refund initiated: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRefundCompleted(bookingId: string, refundRequestId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_REFUND_COMPLETED',
    dedupeKey: `spay_refund_completed:${refundRequestId}`,
    category: 'payment',
    title: 'Refund completed',
    titleBn: 'রিফান্ড সম্পন্ন হয়েছে',
    body: `The refund for booking ${booking.bookingNumber} has been completed.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর রিফান্ড সম্পন্ন হয়েছে।`,
    emailSubject: `Refund completed: ${booking.bookingNumber}`,
  });
}

export async function notifySpayRefundRejected(bookingId: string, refundRequestId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_REFUND_REJECTED',
    dedupeKey: `spay_refund_rejected:${refundRequestId}`,
    category: 'payment',
    title: 'Refund rejected',
    titleBn: 'রিফান্ড প্রত্যাখ্যাত হয়েছে',
    body: `The refund request for booking ${booking.bookingNumber} was rejected.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর রিফান্ড অনুরোধ প্রত্যাখ্যাত হয়েছে।`,
    emailSubject: `Refund rejected: ${booking.bookingNumber}`,
  });
}

export async function notifySpayCheckInCompleted(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_CHECK_IN_COMPLETED',
    dedupeKey: `spay_check_in_completed:${booking.id}`,
    category: 'booking',
    title: 'Check-in completed',
    titleBn: 'চেক-ইন সম্পন্ন হয়েছে',
    body: `Clinic check-in is complete for booking ${booking.bookingNumber}.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য ক্লিনিক চেক-ইন সম্পন্ন হয়েছে।`,
    emailSubject: `Check-in completed: ${booking.bookingNumber}`,
  });
}

export async function notifySpayOperationCompleted(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_OPERATION_COMPLETED',
    dedupeKey: `spay_operation_completed:${booking.id}`,
    category: 'booking',
    title: 'Operation completed',
    titleBn: 'অপারেশন সম্পন্ন হয়েছে',
    body: `The operation for booking ${booking.bookingNumber} has been completed.`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর অপারেশন সম্পন্ন হয়েছে।`,
    emailSubject: `Operation completed: ${booking.bookingNumber}`,
  });
}

export async function notifySpayPostOperativeCare(bookingId: string): Promise<void> {
  const booking = await loadBookingForNotifications(bookingId);
  if (!booking) return;

  await publishSpayNotification({
    booking,
    eventType: 'SPAY_POST_OPERATIVE_CARE',
    dedupeKey: `spay_post_op_care:${booking.id}:${booking.followUpDate?.toISOString() ?? 'none'}`,
    category: 'booking',
    title: 'Post-operative care update',
    titleBn: 'পোস্ট-অপারেটিভ কেয়ার আপডেট',
    body: `Post-operative care instructions are available for booking ${booking.bookingNumber}.${formatFollowUpLine(booking) ? ` Follow-up: ${formatFollowUpLine(booking)}.` : ''}`,
    bodyBn: `বুকিং ${booking.bookingNumber} এর জন্য পোস্ট-অপারেটিভ কেয়ার নির্দেশনা পাওয়া গেছে।${formatFollowUpLine(booking) ? ` ফলো-আপ: ${formatFollowUpLine(booking)}।` : ''}`,
    emailSubject: `Post-operative care: ${booking.bookingNumber}`,
  });
}

export { DHAKA_TIME_ZONE };
