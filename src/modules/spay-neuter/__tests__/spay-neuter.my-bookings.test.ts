import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../database/prisma';
import { createHold } from '../spay-neuter.hold.service';
import { createBookingFromHold } from '../spay-neuter.booking.service';
import { listMyBookings, getMyBooking } from '../spay-neuter.controller';
import { computePaymentDueAt } from '../spay-neuter.domain';

// Regression coverage for the My Bookings web pages' data source:
// GET /me/spay-neuter/bookings (listMyBookings) and GET /me/spay-neuter/
// bookings/:bookingId (getMyBooking) — proving, against the real DB, that
// (a) the list is always scoped to the authenticated caller's own
// centralAuthUserId and never another owner's bookings, and (b) the detail
// endpoint 403s (never 200s) when the booking belongs to someone else.
// These two controller functions were reused as-is (no API changes were
// needed to build /profile/bookings) — this file exists because that
// reuse still deserves ownership-enforcement coverage of its own.

jest.mock('../../me/furtail-pets.client', () => ({
  getFurtailPet: jest.fn().mockResolvedValue({ id: 'external-pet-1', name: 'Tommy' }),
}));

function makeRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn().mockImplementation((code: number) => { res.statusCode = code; return res as Response; });
  res.json = jest.fn().mockImplementation((body: unknown) => { res.body = body; return res as Response; });
  return res as Response & { statusCode?: number; body?: unknown };
}

function makeReq(centralAuthUserId: string, params: Record<string, string> = {}): Request {
  return { user: { sub: centralAuthUserId, roles: [] }, params } as unknown as Request;
}

describe('My Bookings (listMyBookings / getMyBooking) — ownership enforcement', () => {
  const suffix = Date.now();
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let offerId: string;

  const testDate = new Date(Date.now() + 6 * 86_400_000);
  const dateStr = testDate.toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await prisma.clinicOrganization.create({ data: { name: `MyBookings Test Org ${suffix}`, slug: `mybookings-test-org-${suffix}` } });
    clinicOrgId = org.id;
    const branch = await prisma.clinicBranch.create({ data: { organizationId: clinicOrgId, branchName: 'MyBookings Test Branch' } });
    clinicBranchId = branch.id;
    const profile = await prisma.spayClinicProfile.create({ data: { clinicBranchId, concurrentOperationCapacity: 3 } });
    clinicProfileId = profile.id;
    await prisma.spayClinicService.create({ data: { clinicProfileId, procedure: 'neuter', durationMinutes: 20 } });
    const offer = await prisma.spayOffer.create({
      data: {
        title: 'MyBookings Test Offer',
        slug: `mybookings-test-offer-${suffix}`,
        status: 'published',
        neuterTotalPriceBdt: 1500,
        spayTotalPriceBdt: 2200,
        advanceBdt: 500,
      },
    });
    offerId = offer.id;
    await prisma.spaySlot.create({
      data: { clinicProfileId, slotDate: new Date(dateStr), startTime: '09:00', endTime: '17:00', capacity: 3 },
    });
    await prisma.spayOfferClinic.create({ data: { offerId, clinicBranchId, isActive: true } });
  });

  afterAll(async () => {
    await prisma.spayBookingStatusHistory.deleteMany({ where: { booking: { clinicBranchId } } });
    await prisma.spayOfferClinic.deleteMany({ where: { clinicBranchId } });
    await prisma.spayPaymentAttempt.deleteMany({ where: { booking: { clinicBranchId } } });
    const bookings = await prisma.spayBooking.findMany({ where: { clinicBranchId }, select: { id: true, paymentId: true } });
    await prisma.spayBookingPet.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await prisma.spayBooking.deleteMany({ where: { clinicBranchId } });
    const paymentIds = bookings.map((b) => b.paymentId).filter((id): id is string => !!id);
    if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.spaySlotHold.deleteMany({ where: { clinicBranchId } });
    await prisma.spaySlot.deleteMany({ where: { clinicProfileId } });
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId } });
    await prisma.spayOffer.deleteMany({ where: { id: offerId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  async function makeBooking(hour: string, centralAuthUserId: string) {
    const hold = await createHold({
      offerId,
      clinicBranchId,
      procedure: 'neuter',
      startAt: new Date(`${dateStr}T${hour}:00.000Z`),
      centralAuthUserId,
      idempotencyKey: `mybookings-test-${randomUUID()}`,
    });
    const result = await createBookingFromHold({
      holdId: hold.id,
      centralAuthUserId,
      authToken: 'Bearer test-token',
      contactName: 'MyBookings Owner',
      contactPhone: '01788888888',
      externalPetId: 'external-pet-1',
    });
    return result.booking;
  }

  it('3. a signed-in user sees only their own bookings in the list, never another owner\'s', async () => {
    const ownerA = `mybookings-owner-a-${suffix}`;
    const ownerB = `mybookings-owner-b-${suffix}`;
    const bookingA = await makeBooking('04:00', ownerA);
    await makeBooking('05:00', ownerB);

    const req = makeReq(ownerA);
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    await listMyBookings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = res.body as { success: boolean; data: Array<{ id: string; centralAuthUserId: string }> };
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((b) => b.centralAuthUserId === ownerA)).toBe(true);
    expect(body.data.some((b) => b.id === bookingA.id)).toBe(true);
  });

  it('6. booking detail ownership is enforced — a different signed-in user is forbidden, never shown the booking', async () => {
    const owner = `mybookings-owner-c-${suffix}`;
    const stranger = `mybookings-owner-d-${suffix}`;
    const booking = await makeBooking('06:00', owner);

    const ownerReq = makeReq(owner, { bookingId: booking.id });
    const ownerRes = makeRes();
    const ownerNext = jest.fn() as unknown as NextFunction;
    await getMyBooking(ownerReq, ownerRes, ownerNext);
    expect(ownerNext).not.toHaveBeenCalled();
    expect((ownerRes.body as { data: { id: string } }).data.id).toBe(booking.id);

    const strangerReq = makeReq(stranger, { bookingId: booking.id });
    const strangerRes = makeRes();
    const strangerNext = jest.fn() as unknown as NextFunction;
    await getMyBooking(strangerReq, strangerRes, strangerNext);
    // getMyBooking throws AppError.forbidden() and passes it to next(err) —
    // it never calls res.json with the other owner's booking data.
    expect(strangerNext).toHaveBeenCalledTimes(1);
    expect(strangerRes.json).not.toHaveBeenCalled();
    const err = (strangerNext as jest.Mock).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('unknown bookingId is a 404, not a crash or a leak', async () => {
    const req = makeReq(`mybookings-owner-e-${suffix}`, { bookingId: randomUUID() });
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;
    await getMyBooking(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('list and detail responses expose the server-computed paymentDueAt while a booking is still pending_payment', async () => {
    const owner = `mybookings-owner-deadline-${suffix}`;
    const booking = await makeBooking('07:00', owner);
    expect(booking.status).toBe('pending_payment');

    const listReq = makeReq(owner);
    const listRes = makeRes();
    await listMyBookings(listReq, listRes, jest.fn() as unknown as NextFunction);
    const listBody = listRes.body as { data: Array<{ id: string; paymentDueAt: string | null }> };
    const listed = listBody.data.find((b) => b.id === booking.id);
    expect(listed?.paymentDueAt).toBe(computePaymentDueAt(booking.createdAt).toISOString());

    const detailReq = makeReq(owner, { bookingId: booking.id });
    const detailRes = makeRes();
    await getMyBooking(detailReq, detailRes, jest.fn() as unknown as NextFunction);
    const detailBody = detailRes.body as { data: { paymentDueAt: string | null } };
    expect(detailBody.data.paymentDueAt).toBe(computePaymentDueAt(booking.createdAt).toISOString());
  });

  it('a confirmed (no-longer-payable) booking has no paymentDueAt', async () => {
    const owner = `mybookings-owner-confirmed-${suffix}`;
    const booking = await makeBooking('08:00', owner);
    await prisma.spayBooking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });

    const req = makeReq(owner, { bookingId: booking.id });
    const res = makeRes();
    await getMyBooking(req, res, jest.fn() as unknown as NextFunction);
    const body = res.body as { data: { paymentDueAt: string | null; status: string } };
    expect(body.data.status).toBe('confirmed');
    expect(body.data.paymentDueAt).toBeNull();
  });

  it('7. empty state: a user with no bookings gets an empty array, not an error', async () => {
    const req = makeReq(`mybookings-owner-nobody-${suffix}`);
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;
    await listMyBookings(req, res, next);
    expect(next).not.toHaveBeenCalled();
    const body = res.body as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
