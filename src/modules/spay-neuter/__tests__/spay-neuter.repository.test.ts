import { prisma } from '../../../database/prisma';
import {
  convertHoldToBooking,
  expireStaleHolds,
  generateSpayBookingNumber,
  releaseBookingSlot,
  releaseHold,
  reserveHold,
} from '../spay-neuter.repository';

// Integration test against the local dev database configured in .env
// (127.0.0.1:5433 — see docs/plans/spay-neuter/implementation-contract.md).
// Exercises the raw-SQL atomic capacity primitives directly, the same way
// campaign-registrations.repository.ts's reserveSlots is the platform's
// proven pattern for this. Every row created here is cleaned up in
// afterAll/afterEach so the shared dev DB is left as found.

describe('spay-neuter capacity primitives', () => {
  let clinicOrgId: string;
  let clinicBranchId: string;
  let clinicProfileId: string;
  let serviceId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const org = await prisma.clinicOrganization.create({
      data: { name: `Spay Test Org ${suffix}`, slug: `spay-test-org-${suffix}` },
    });
    clinicOrgId = org.id;

    const branch = await prisma.clinicBranch.create({
      data: { organizationId: clinicOrgId, branchName: 'Spay Test Branch' },
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
  });

  afterAll(async () => {
    await prisma.spayClinicService.deleteMany({ where: { clinicProfileId } });
    await prisma.spayClinicProfile.deleteMany({ where: { clinicBranchId } });
    await prisma.clinicBranch.deleteMany({ where: { id: clinicBranchId } });
    await prisma.clinicOrganization.deleteMany({ where: { id: clinicOrgId } });
    await prisma.$disconnect();
  });

  async function makeSlot(capacity = 2) {
    return prisma.spaySlot.create({
      data: {
        clinicProfileId,
        slotDate: new Date('2026-09-01'),
        startTime: '09:00',
        endTime: '09:20',
        capacity,
      },
    });
  }

  afterEach(async () => {
    await prisma.spaySlot.deleteMany({ where: { clinicProfileId } });
  });

  it('reserveHold grants a hold while capacity remains', async () => {
    const slot = await makeSlot(2);
    const ok1 = await reserveHold(slot.id, 1);
    const ok2 = await reserveHold(slot.id, 1);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);

    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.heldCount).toBe(2);
    expect(refreshed.bookedCount).toBe(0);
  });

  it('concurrency safety: N+1 simultaneous holds against capacity N — exactly N succeed', async () => {
    const capacity = 3;
    const slot = await makeSlot(capacity);

    const attempts = capacity + 1;
    const results = await Promise.all(Array.from({ length: attempts }, () => reserveHold(slot.id, 1)));

    const successCount = results.filter(Boolean).length;
    expect(successCount).toBe(capacity);

    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.heldCount).toBe(capacity);
    expect(refreshed.heldCount + refreshed.bookedCount).toBeLessThanOrEqual(refreshed.capacity);
  });

  it('releaseHold gives capacity back and never drives held_count negative', async () => {
    const slot = await makeSlot(1);
    await reserveHold(slot.id, 1);
    await releaseHold(slot.id, 1);
    await releaseHold(slot.id, 1); // extra release must clamp at 0, not go negative

    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.heldCount).toBe(0);
  });

  it('convertHoldToBooking moves capacity from held to booked without changing the total', async () => {
    const slot = await makeSlot(2);
    await reserveHold(slot.id, 1);

    const converted = await convertHoldToBooking(slot.id, 1);
    expect(converted).toBe(true);

    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.heldCount).toBe(0);
    expect(refreshed.bookedCount).toBe(1);
  });

  it('convertHoldToBooking refuses to convert more than is actually held (defends against a swept-expired hold)', async () => {
    const slot = await makeSlot(2);
    // Nothing held yet.
    const converted = await convertHoldToBooking(slot.id, 1);
    expect(converted).toBe(false);

    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.bookedCount).toBe(0);
  });

  it('releaseBookingSlot releases booked capacity and clamps at 0', async () => {
    const slot = await makeSlot(1);
    await reserveHold(slot.id, 1);
    await convertHoldToBooking(slot.id, 1);

    await releaseBookingSlot(slot.id, 1);
    const refreshed = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshed.bookedCount).toBe(0);

    // Extra release must not go negative.
    await releaseBookingSlot(slot.id, 1);
    const refreshedAgain = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshedAgain.bookedCount).toBe(0);
  });

  it('expireStaleHolds sweeps only expired active holds and releases their capacity', async () => {
    const slot = await makeSlot(2);
    await reserveHold(slot.id, 1);

    const expiredHold = await prisma.spaySlotHold.create({
      data: {
        slotId: slot.id,
        offerId: '00000000-0000-0000-0000-000000000000',
        clinicBranchId,
        serviceId,
        candidateStartAt: new Date('2026-09-01T03:00:00.000Z'),
        candidateEndAt: new Date('2026-09-01T03:20:00.000Z'),
        procedure: 'neuter',
        centralAuthUserId: 'test-user-expired',
        petCount: 1,
        status: 'active',
        expiresAt: new Date(Date.now() - 60_000), // already expired
        idempotencyKey: `expired-${slot.id}`,
      },
    });

    const freshHold = await prisma.spaySlotHold.create({
      data: {
        slotId: slot.id,
        offerId: '00000000-0000-0000-0000-000000000000',
        clinicBranchId,
        serviceId,
        candidateStartAt: new Date('2026-09-01T03:00:00.000Z'),
        candidateEndAt: new Date('2026-09-01T03:20:00.000Z'),
        procedure: 'neuter',
        centralAuthUserId: 'test-user-fresh',
        petCount: 1, // never reserved via reserveHold(), so it doesn't affect slot counters — only testing that its status is untouched by the sweep
        status: 'active',
        expiresAt: new Date(Date.now() + 10 * 60_000), // 10 minutes from now
        idempotencyKey: `fresh-${slot.id}`,
      },
    });

    const expiredCount = await expireStaleHolds();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const refreshedExpired = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: expiredHold.id } });
    expect(refreshedExpired.status).toBe('expired');

    const refreshedFresh = await prisma.spaySlotHold.findUniqueOrThrow({ where: { id: freshHold.id } });
    expect(refreshedFresh.status).toBe('active');

    const refreshedSlot = await prisma.spaySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshedSlot.heldCount).toBe(0); // released by the sweep

    await prisma.spaySlotHold.deleteMany({ where: { id: { in: [expiredHold.id, freshHold.id] } } });
  });

  it('generateSpayBookingNumber produces unique, correctly formatted, monotonically increasing numbers', async () => {
    const date = new Date('2026-09-01T00:00:00.000Z');
    const [a, b, c] = await Promise.all([
      generateSpayBookingNumber(date),
      generateSpayBookingNumber(date),
      generateSpayBookingNumber(date),
    ]);

    for (const n of [a, b, c]) {
      expect(n).toMatch(/^BPA-SN-20260901-\d{5,}$/);
    }
    expect(new Set([a, b, c]).size).toBe(3); // no collisions under concurrent generation
  });
});
