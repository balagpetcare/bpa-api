import { randomUUID } from 'crypto';
import { prisma } from '../../../database/prisma';
import { processOutboxEvent } from '../../../queue/workers/outbox.worker';
import { rescheduleBooking } from '../spay-neuter.hold.service';
import {
  notifySpayBookingConfirmed,
  notifySpayPaymentSuccessful,
  notifySpaySlipReady,
  runSpayReminderScan,
} from '../spay-neuter.notifications';

jest.mock('../../../queue/queues', () => ({
  OUTBOX_QUEUE_NAME: 'notification-outbox',
  DELIVERY_QUEUE_NAME: 'notification-delivery',
  enqueueOutboxEvent: jest.fn().mockResolvedValue(undefined),
  enqueueDelivery: jest.fn().mockResolvedValue(undefined),
}));

describe('spay-neuter notifications', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let serviceId: string;
  let offerId: string;
  let userId: string;
  const centralAuthUserId = `spay-notify-owner-${suffix}`;
  const userEmail = `spay-notify-${suffix}@example.com`;

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({
      data: { name: `Notify Org ${suffix}`, slug: `notify-org-${suffix}` },
    });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({
      data: { organizationId: clinicOrgId, branchName: 'Notify Branch' },
    });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({
      data: { clinicBranchId, concurrentOperationCapacity: 2 },
    });
    clinicProfileId = profile.id;
    const service = await prisma.spayClinicService.create({
      data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 },
    });
    serviceId = service.id;
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'Notification Offer',
        slug: `notification-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 2000,
        spayTotalPriceBdt: 3500,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;

    for (const dateStr of ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
      await prisma.spaySlot.create({
        data: {
          clinicProfileId,
          slotDate: new Date(dateStr),
          startTime: '09:00',
          endTime: '17:00',
          capacity: 2,
        },
      });
    }

    const user = await prisma.user.create({
      data: {
        name: 'Notify Owner',
        email: userEmail,
        centralAuthUserId,
        role: 'USER',
      },
    });
    userId = user.id;

    await prisma.notificationPreference.create({ data: { userId } });
    await prisma.deviceInstallation.create({
      data: {
        userId,
        installationId: `spay-notify-install-${suffix}`,
        platform: 'android',
        fcmToken: `spay-notify-fcm-${suffix}`,
        locale: 'en',
        timezone: 'Asia/Dhaka',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { to: userEmail } });
    await prisma.notificationDelivery.deleteMany({ where: { userId } });
    await prisma.userNotification.deleteMany({ where: { userId } });
    await prisma.notificationOutboxEvent.deleteMany({
      where: {
        OR: [
          { dedupeKey: { startsWith: 'spay_' } },
          { dedupeKey: { startsWith: `notification-test-${suffix}` } },
        ],
      },
    });
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBookingRescheduleEvent.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    await prisma.spaySlot.deleteMany({ where: { clinicProfileId } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.deviceInstallation.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function makeBooking(params: {
    scheduledStartAt: Date;
    status?: 'confirmed' | 'completed';
    followUpDate?: Date;
  }) {
    return prisma.spayBooking.create({
      data: {
        bookingNumber: `BPA-SN-N${randomUUID().slice(0, 8)}`,
        bookingCode: randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
        offerId,
        clinicBranchId,
        serviceId,
        procedure: 'neuter',
        centralAuthUserId,
        contactName: 'Notify Owner',
        contactPhone: '01700000000',
        contactEmail: userEmail,
        totalPriceBdt: 2000,
        advancePaidBdt: 500,
        balanceDueBdt: 1500,
        offerTitleSnapshot: 'Notification Offer',
        clinicNameSnapshot: 'Notify Branch',
        clinicAddressSnapshot: 'Dhaka',
        durationMinutesSnapshot: 20,
        medicallyUnfitRefundableSnapshot: true,
        scheduledStartAt: params.scheduledStartAt,
        scheduledEndAt: new Date(params.scheduledStartAt.getTime() + 20 * 60_000),
        arriveByAt: new Date(params.scheduledStartAt.getTime() - 20 * 60_000),
        checkinOpensAt: new Date(params.scheduledStartAt.getTime() - 60 * 60_000),
        cancellationCutoffAt: new Date(params.scheduledStartAt.getTime() - 24 * 60 * 60_000),
        followUpDate: params.followUpDate,
        status: (params.status ?? 'confirmed') as never,
        qrToken: randomUUID(),
      },
    });
  }

  it('emits the payment, confirmation, and slip-ready notification events with booking deep links', async () => {
    const booking = await makeBooking({
      scheduledStartAt: new Date('2026-08-12T03:30:00.000Z'),
    });

    await notifySpayPaymentSuccessful(booking.id);
    await notifySpayBookingConfirmed(booking.id);
    await notifySpaySlipReady(booking.id);

    const events = await prisma.notificationOutboxEvent.findMany({
      where: { entityType: 'spay_booking', entityId: booking.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(events.map((event) => event.eventType)).toEqual([
      'SPAY_PAYMENT_SUCCESS',
      'SPAY_BOOKING_CONFIRMED',
      'SPAY_BOOKING_SLIP_READY',
    ]);
    for (const event of events) {
      expect((event.payload as any).deepLink).toBe(`bpa://spay-neuter/bookings/${booking.id}`);
    }
  });

  it('scans reminder milestones idempotently for 24h, 6h, 1h, and follow-up events', async () => {
    const booking24h = await makeBooking({ scheduledStartAt: new Date('2026-08-12T03:30:00.000Z') });
    const booking6h = await makeBooking({ scheduledStartAt: new Date('2026-08-12T09:30:00.000Z') });
    const booking1h = await makeBooking({ scheduledStartAt: new Date('2026-08-12T04:30:00.000Z') });
    await makeBooking({
      scheduledStartAt: new Date('2026-08-10T03:30:00.000Z'),
      status: 'completed',
      followUpDate: new Date('2026-08-12T00:00:00.000Z'),
    });

    await runSpayReminderScan(new Date('2026-08-11T03:30:00.000Z'));
    await runSpayReminderScan(new Date('2026-08-12T03:30:00.000Z'));
    await runSpayReminderScan(new Date('2026-08-12T03:30:00.000Z'));
    await runSpayReminderScan(new Date('2026-08-12T03:00:00.000Z'));

    await runSpayReminderScan(new Date('2026-08-11T03:30:00.000Z'));
    await runSpayReminderScan(new Date('2026-08-12T03:30:00.000Z'));
    await runSpayReminderScan(new Date('2026-08-12T03:00:00.000Z'));

    const events = await prisma.notificationOutboxEvent.findMany({
      where: {
        entityType: 'spay_booking',
        eventType: {
          in: [
            'SPAY_BOOKING_REMINDER_24H',
            'SPAY_FASTING_REMINDER_6H',
            'SPAY_ARRIVAL_REMINDER_1H',
            'SPAY_FOLLOW_UP_REMINDER',
          ],
        },
        entityId: { in: [booking24h.id, booking6h.id, booking1h.id] },
      },
    });
    const followUpEvents = await prisma.notificationOutboxEvent.count({
      where: { eventType: 'SPAY_FOLLOW_UP_REMINDER', entityType: 'spay_booking' },
    });

    expect(events.length).toBe(3);
    expect(followUpEvents).toBe(1);
  });

  it('archives stale reminder inbox items on reschedule and emits a rescheduled event', async () => {
    const booking = await makeBooking({
      scheduledStartAt: new Date('2026-08-13T03:30:00.000Z'),
    });

    await runSpayReminderScan(new Date('2026-08-12T03:30:00.000Z'));
    const reminderEvent = await prisma.notificationOutboxEvent.findFirstOrThrow({
      where: {
        entityType: 'spay_booking',
        entityId: booking.id,
        eventType: 'SPAY_BOOKING_REMINDER_24H',
      },
      orderBy: { createdAt: 'desc' },
    });

    await processOutboxEvent({ data: { outboxEventId: reminderEvent.id } } as any);

    const beforeNotifications = await prisma.userNotification.findMany({
      where: { entityType: 'spay_booking', entityId: booking.id, eventType: 'SPAY_BOOKING_REMINDER_24H' },
    });
    const beforeDeliveries = await prisma.notificationDelivery.findMany({
      where: { userNotificationId: { in: beforeNotifications.map((notification) => notification.id) } },
    });

    expect(beforeNotifications).toHaveLength(1);
    expect(beforeDeliveries).toHaveLength(2);

    await rescheduleBooking(
      booking.id,
      new Date('2026-08-13T04:30:00.000Z'),
      'owner requested a later time',
      userId,
    );

    const archivedNotification = await prisma.userNotification.findUniqueOrThrow({
      where: { id: beforeNotifications[0].id },
    });
    const failedDeliveries = await prisma.notificationDelivery.findMany({
      where: { id: { in: beforeDeliveries.map((delivery) => delivery.id) } },
    });
    const rescheduledEvent = await prisma.notificationOutboxEvent.findFirst({
      where: { entityType: 'spay_booking', entityId: booking.id, eventType: 'SPAY_BOOKING_RESCHEDULED' },
      orderBy: { createdAt: 'desc' },
    });

    expect(archivedNotification.status).toBe('archived');
    expect(failedDeliveries.every((delivery) => delivery.status === 'failed')).toBe(true);
    expect(rescheduledEvent).not.toBeNull();
  });
});
