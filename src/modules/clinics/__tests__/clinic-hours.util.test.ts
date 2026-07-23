import { computeOpenNowStatus, haversineDistanceKm, getZonedNow, type OpeningHoursRow } from '../clinic-hours.util';

function hoursRow(overrides: Partial<OpeningHoursRow> & { dayOfWeek: number }): OpeningHoursRow {
  return { opensAt: null, closesAt: null, isClosed: false, ...overrides };
}

describe('computeOpenNowStatus', () => {
  it('reports OPEN when the current time falls inside today\'s hours', () => {
    // Pick a fixed instant and derive today's actual weekday in Asia/Dhaka
    // rather than hardcoding a day index, so the test is not time-of-day-order-flaky.
    const reference = new Date('2026-07-22T10:00:00Z'); // 16:00 in Asia/Dhaka (UTC+6)
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);

    const result = computeOpenNowStatus(
      [hoursRow({ dayOfWeek, opensAt: '09:00', closesAt: '21:00' })],
      'Asia/Dhaka',
      reference,
    );

    expect(result.status).toBe('OPEN');
    expect(result.timezone).toBe('Asia/Dhaka');
  });

  it('reports CLOSED when the current time falls outside today\'s hours', () => {
    const reference = new Date('2026-07-22T10:00:00Z'); // 16:00 Asia/Dhaka
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);

    const result = computeOpenNowStatus(
      [hoursRow({ dayOfWeek, opensAt: '09:00', closesAt: '12:00' })],
      'Asia/Dhaka',
      reference,
    );

    expect(result.status).toBe('CLOSED');
  });

  it('handles an overnight range (closesAt earlier than opensAt) correctly', () => {
    const reference = new Date('2026-07-22T19:00:00Z'); // 01:00 Asia/Dhaka next day
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);

    const result = computeOpenNowStatus(
      [hoursRow({ dayOfWeek, opensAt: '20:00', closesAt: '02:00' })],
      'Asia/Dhaka',
      reference,
    );

    expect(result.status).toBe('OPEN');
  });

  it('reports CLOSED (not UNKNOWN) when today is explicitly marked closed', () => {
    const reference = new Date('2026-07-22T10:00:00Z');
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);

    const result = computeOpenNowStatus([hoursRow({ dayOfWeek, isClosed: true })], 'Asia/Dhaka', reference);

    expect(result.status).toBe('CLOSED');
  });

  it('reports UNKNOWN — never CLOSED — when there is no hours row for today at all', () => {
    const reference = new Date('2026-07-22T10:00:00Z');
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);
    const otherDay = (dayOfWeek + 1) % 7;

    const result = computeOpenNowStatus([hoursRow({ dayOfWeek: otherDay, opensAt: '09:00', closesAt: '18:00' })], 'Asia/Dhaka', reference);

    expect(result.status).toBe('UNKNOWN');
    expect(result.todayHours).toBeNull();
  });

  it('reports UNKNOWN when today has a row but opensAt/closesAt are missing', () => {
    const reference = new Date('2026-07-22T10:00:00Z');
    const { dayOfWeek } = getZonedNow('Asia/Dhaka', reference);

    const result = computeOpenNowStatus([hoursRow({ dayOfWeek })], 'Asia/Dhaka', reference);

    expect(result.status).toBe('UNKNOWN');
  });
});

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm(23.71, 90.40, 23.71, 90.40)).toBeCloseTo(0, 5);
  });

  it('returns a plausible distance for two known Dhaka points (~5-7km apart)', () => {
    // Gulshan-2 vs Old Dhaka, roughly 8-10km apart in reality.
    const km = haversineDistanceKm(23.7925, 90.4078, 23.7180, 90.3980);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(15);
  });
});
