import {
  assertPetSexMatchesProcedure,
  buildServiceChoices,
  computeBookingPrice,
  computeBookingSchedule,
  formatBookingNumber,
  isCancellationAllowed,
  isCheckinAllowed,
  isHoldUsable,
  normalizePetSex,
  normalizeServiceType,
  toServiceTypeCode,
} from '../spay-neuter.domain';

describe('normalizeServiceType', () => {
  it('accepts SPAY/NEUTER case-insensitively, with surrounding whitespace trimmed', () => {
    expect(normalizeServiceType('SPAY')).toBe('spay');
    expect(normalizeServiceType('spay')).toBe('spay');
    expect(normalizeServiceType(' Spay ')).toBe('spay');
    expect(normalizeServiceType('NEUTER')).toBe('neuter');
    expect(normalizeServiceType('neuter')).toBe('neuter');
  });

  it('rejects a missing/empty value with SERVICE_TYPE_REQUIRED', () => {
    expect(() => normalizeServiceType(undefined)).toThrow(expect.objectContaining({ code: 'SERVICE_TYPE_REQUIRED' }));
    expect(() => normalizeServiceType(null)).toThrow(expect.objectContaining({ code: 'SERVICE_TYPE_REQUIRED' }));
    expect(() => normalizeServiceType('')).toThrow(expect.objectContaining({ code: 'SERVICE_TYPE_REQUIRED' }));
  });

  it('rejects an array (never accepts both services at once)', () => {
    expect(() => normalizeServiceType(['spay', 'neuter'])).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
  });

  it('rejects a combined/unknown value', () => {
    expect(() => normalizeServiceType('both')).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
    expect(() => normalizeServiceType('SPAY,NEUTER')).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
    expect(() => normalizeServiceType('unknown')).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
  });

  it('rejects a non-string type (e.g. a number or object)', () => {
    expect(() => normalizeServiceType(42)).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
    expect(() => normalizeServiceType({ code: 'SPAY' })).toThrow(expect.objectContaining({ code: 'INVALID_SERVICE_TYPE' }));
  });
});

describe('toServiceTypeCode', () => {
  it('is the exact inverse of normalizeServiceType', () => {
    expect(toServiceTypeCode('spay')).toBe('SPAY');
    expect(toServiceTypeCode('neuter')).toBe('NEUTER');
  });
});

describe('buildServiceChoices', () => {
  it('returns both services with server-computed remaining amounts, matching the canonical BDT prices', () => {
    const choices = buildServiceChoices({ neuterTotalPriceBdt: 1500, spayTotalPriceBdt: 2200, advanceBdt: 500 });
    const neuter = choices.find((c) => c.code === 'NEUTER')!;
    const spay = choices.find((c) => c.code === 'SPAY')!;

    expect(neuter).toMatchObject({ totalAmount: 1500, advanceAmount: 500, remainingAmount: 1000, durationMinutes: 20, enabled: true });
    expect(spay).toMatchObject({ totalAmount: 2200, advanceAmount: 500, remainingAmount: 1700, durationMinutes: 40, enabled: true });
  });

  it('never trusts a client-supplied amount — remainingAmount is always total minus advance, computed server-side', () => {
    const choices = buildServiceChoices({ neuterTotalPriceBdt: 999.99, spayTotalPriceBdt: 1234.56, advanceBdt: 500 });
    const neuter = choices.find((c) => c.code === 'NEUTER')!;
    expect(neuter.remainingAmount).toBeCloseTo(499.99, 2);
  });
});

describe('normalizePetSex / assertPetSexMatchesProcedure', () => {
  it('normalizes common sex/gender representations, and treats anything else as unknown', () => {
    expect(normalizePetSex('Male')).toBe('male');
    expect(normalizePetSex('M')).toBe('male');
    expect(normalizePetSex('female')).toBe('female');
    expect(normalizePetSex('f')).toBe('female');
    expect(normalizePetSex('unknown')).toBe('unknown');
    expect(normalizePetSex(null)).toBe('unknown');
    expect(normalizePetSex(undefined)).toBe('unknown');
    expect(normalizePetSex('')).toBe('unknown');
  });

  it('never blocks an unknown/unspecified sex', () => {
    expect(() => assertPetSexMatchesProcedure('spay', 'unknown')).not.toThrow();
    expect(() => assertPetSexMatchesProcedure('neuter', null)).not.toThrow();
    expect(() => assertPetSexMatchesProcedure('spay', undefined)).not.toThrow();
  });

  it('allows the expected sex for each procedure', () => {
    expect(() => assertPetSexMatchesProcedure('spay', 'female')).not.toThrow();
    expect(() => assertPetSexMatchesProcedure('neuter', 'male')).not.toThrow();
  });

  it('rejects a clear opposite-sex mismatch with a typed error', () => {
    expect(() => assertPetSexMatchesProcedure('spay', 'male')).toThrow(expect.objectContaining({ code: 'PET_SEX_SERVICE_MISMATCH' }));
    expect(() => assertPetSexMatchesProcedure('neuter', 'female')).toThrow(expect.objectContaining({ code: 'PET_SEX_SERVICE_MISMATCH' }));
  });
});

describe('computeBookingPrice', () => {
  const offer = { neuterTotalPriceBdt: 2000, spayTotalPriceBdt: 3500, advanceBdt: 500 };

  it('BDT 500 advance is part of the total, never additive', () => {
    const price = computeBookingPrice('neuter', offer);
    expect(price.advanceBdt).toBe(500);
    expect(price.advanceBdt + price.balanceDueBdt).toBe(price.totalPriceBdt);
    expect(price.totalPriceBdt).toBe(2000);
  });

  it('uses the spay total for the spay procedure, independently of neuter price', () => {
    const price = computeBookingPrice('spay', offer);
    expect(price.totalPriceBdt).toBe(3500);
    expect(price.balanceDueBdt).toBe(3000);
  });

  // Regression pin for the canonical BPA Spay & Neuter offer pricing
  // (confirmed against the live SpayOffer row: neuterTotalPriceBdt=1500,
  // spayTotalPriceBdt=2200, advanceBdt=500) — a Neuter booking must never
  // receive the Spay total or vice versa.
  it('canonical BPA offer: Neuter = 1500 total / 500 advance / 1000 remaining', () => {
    const canonicalOffer = { neuterTotalPriceBdt: 1500, spayTotalPriceBdt: 2200, advanceBdt: 500 };
    const price = computeBookingPrice('neuter', canonicalOffer);
    expect(price.totalPriceBdt).toBe(1500);
    expect(price.advanceBdt).toBe(500);
    expect(price.balanceDueBdt).toBe(1000);
  });

  it('canonical BPA offer: Spay = 2200 total / 500 advance / 1700 remaining', () => {
    const canonicalOffer = { neuterTotalPriceBdt: 1500, spayTotalPriceBdt: 2200, advanceBdt: 500 };
    const price = computeBookingPrice('spay', canonicalOffer);
    expect(price.totalPriceBdt).toBe(2200);
    expect(price.advanceBdt).toBe(500);
    expect(price.balanceDueBdt).toBe(1700);
  });

  it('rejects an offer whose advance exceeds its total price', () => {
    expect(() =>
      computeBookingPrice('neuter', { neuterTotalPriceBdt: 400, spayTotalPriceBdt: 3500, advanceBdt: 500 }),
    ).toThrow('Advance amount cannot exceed the total price');
  });

  it('rejects a non-positive total price', () => {
    expect(() =>
      computeBookingPrice('neuter', { neuterTotalPriceBdt: 0, spayTotalPriceBdt: 3500, advanceBdt: 500 }),
    ).toThrow('Offer total price must be positive');
  });

  it('computes in integer cents so the three amounts always reconcile exactly, even with sub-paisa inputs', () => {
    const price = computeBookingPrice('neuter', {
      neuterTotalPriceBdt: 1000.005,
      spayTotalPriceBdt: 2000,
      advanceBdt: 333.333,
    });
    expect(price.totalPriceBdt).toBe(1000.01);
    expect(price.advanceBdt).toBe(333.33);
    expect(price.balanceDueBdt).toBe(666.68);
    expect(price.advanceBdt + price.balanceDueBdt).toBe(price.totalPriceBdt);
  });
});

describe('computeBookingSchedule', () => {
  const policy = {
    slotHoldMinutes: 10,
    cancellationCutoffHours: 24,
    arriveBeforeMinutes: 20,
    checkinEarlyMinutes: 60,
  };
  const start = new Date('2026-08-10T09:00:00.000Z');

  it('neuter default 20 minutes produces the expected end time', () => {
    const schedule = computeBookingSchedule(start, 20, policy);
    expect(schedule.scheduledEndAt.toISOString()).toBe('2026-08-10T09:20:00.000Z');
  });

  it('spay default 40 minutes produces the expected end time', () => {
    const schedule = computeBookingSchedule(start, 40, policy);
    expect(schedule.scheduledEndAt.toISOString()).toBe('2026-08-10T09:40:00.000Z');
  });

  it('arriveByAt is exactly 20 minutes before scheduledStartAt', () => {
    const schedule = computeBookingSchedule(start, 20, policy);
    expect(schedule.arriveByAt.toISOString()).toBe('2026-08-10T08:40:00.000Z');
  });

  it('checkinOpensAt is exactly 1 hour before scheduledStartAt', () => {
    const schedule = computeBookingSchedule(start, 20, policy);
    expect(schedule.checkinOpensAt.toISOString()).toBe('2026-08-10T08:00:00.000Z');
  });

  it('cancellationCutoffAt is exactly 24 hours before scheduledStartAt', () => {
    const schedule = computeBookingSchedule(start, 20, policy);
    expect(schedule.cancellationCutoffAt.toISOString()).toBe('2026-08-09T09:00:00.000Z');
  });

  it('rejects a non-positive duration', () => {
    expect(() => computeBookingSchedule(start, 0, policy)).toThrow('Service duration must be positive');
  });
});

describe('isCancellationAllowed', () => {
  const cutoff = new Date('2026-08-09T09:00:00.000Z');

  it('allows cancellation strictly before the cutoff', () => {
    expect(isCancellationAllowed(cutoff, new Date('2026-08-09T08:59:00.000Z'))).toBe(true);
  });

  it('rejects cancellation at or after the cutoff', () => {
    expect(isCancellationAllowed(cutoff, new Date('2026-08-09T09:00:00.000Z'))).toBe(false);
    expect(isCancellationAllowed(cutoff, new Date('2026-08-09T09:01:00.000Z'))).toBe(false);
  });
});

describe('isCheckinAllowed', () => {
  const opensAt = new Date('2026-08-10T08:00:00.000Z');

  it('rejects check-in before the window opens', () => {
    expect(isCheckinAllowed(opensAt, new Date('2026-08-10T07:59:59.000Z'))).toBe(false);
  });

  it('allows check-in exactly at, and after, the opening instant (up to 1h early)', () => {
    expect(isCheckinAllowed(opensAt, new Date('2026-08-10T08:00:00.000Z'))).toBe(true);
    expect(isCheckinAllowed(opensAt, new Date('2026-08-10T08:30:00.000Z'))).toBe(true);
  });
});

describe('isHoldUsable', () => {
  const now = new Date('2026-08-10T08:00:00.000Z');

  it('a fresh active hold within its 10-minute TTL is usable', () => {
    expect(isHoldUsable({ status: 'active', expiresAt: new Date('2026-08-10T08:09:00.000Z') }, now)).toBe(true);
  });

  it('an active hold past its TTL is not usable (lazy expiry)', () => {
    expect(isHoldUsable({ status: 'active', expiresAt: new Date('2026-08-10T07:59:00.000Z') }, now)).toBe(false);
  });

  it('a non-active hold is never usable regardless of expiresAt', () => {
    expect(isHoldUsable({ status: 'converted', expiresAt: new Date('2026-08-10T09:00:00.000Z') }, now)).toBe(false);
    expect(isHoldUsable({ status: 'released', expiresAt: new Date('2026-08-10T09:00:00.000Z') }, now)).toBe(false);
  });
});

describe('formatBookingNumber', () => {
  it('formats as BPA-SN-YYYYMMDD-##### with zero-padded sequence', () => {
    expect(formatBookingNumber(new Date('2026-08-10T00:00:00.000Z'), 7)).toBe('BPA-SN-20260810-00007');
  });

  it('does not truncate a sequence value wider than 5 digits', () => {
    expect(formatBookingNumber(new Date('2026-08-10T00:00:00.000Z'), 123456)).toBe('BPA-SN-20260810-123456');
  });

  it('accepts a bigint sequence value (as returned by nextval)', () => {
    expect(formatBookingNumber(new Date('2026-08-10T00:00:00.000Z'), 42n)).toBe('BPA-SN-20260810-00042');
  });
});
