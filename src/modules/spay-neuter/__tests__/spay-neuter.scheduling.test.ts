import {
  generateCandidateStarts,
  hasCapacity,
  overlapsHalfOpen,
  resolveDayWindows,
  subtractInterval,
  subtractIntervals,
  sweepMaxConcurrency,
  type Interval,
} from '../spay-neuter.scheduling';
import { dhakaOffsetMinutes, dhakaWallClockToUtc, toDhakaDateString } from '../spay-neuter.timezone';

const iv = (startIso: string, endIso: string): Interval => ({ start: new Date(startIso), end: new Date(endIso) });

describe('overlapsHalfOpen', () => {
  it('two intervals that genuinely overlap are detected', () => {
    expect(overlapsHalfOpen(iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T09:10Z', '2026-09-01T09:30Z'))).toBe(true);
  });

  it('an interval ending exactly when another starts does NOT overlap it (half-open, not start-matching)', () => {
    expect(overlapsHalfOpen(iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T09:20Z', '2026-09-01T09:40Z'))).toBe(false);
  });

  it('identical intervals overlap', () => {
    expect(overlapsHalfOpen(iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'))).toBe(true);
  });

  it('completely disjoint intervals do not overlap', () => {
    expect(overlapsHalfOpen(iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T10:00Z', '2026-09-01T10:20Z'))).toBe(false);
  });
});

describe('subtractInterval', () => {
  const window = iv('2026-09-01T09:00Z', '2026-09-01T12:00Z');

  it('cut entirely inside the window splits it into two', () => {
    const result = subtractInterval(window, iv('2026-09-01T10:00Z', '2026-09-01T10:30Z'));
    expect(result).toEqual([iv('2026-09-01T09:00Z', '2026-09-01T10:00Z'), iv('2026-09-01T10:30Z', '2026-09-01T12:00Z')]);
  });

  it('cut overlapping the start trims the front', () => {
    const result = subtractInterval(window, iv('2026-09-01T08:00Z', '2026-09-01T10:00Z'));
    expect(result).toEqual([iv('2026-09-01T10:00Z', '2026-09-01T12:00Z')]);
  });

  it('cut overlapping the end trims the back', () => {
    const result = subtractInterval(window, iv('2026-09-01T11:00Z', '2026-09-01T13:00Z'));
    expect(result).toEqual([iv('2026-09-01T09:00Z', '2026-09-01T11:00Z')]);
  });

  it('cut engulfing the whole window removes it entirely', () => {
    const result = subtractInterval(window, iv('2026-09-01T08:00Z', '2026-09-01T13:00Z'));
    expect(result).toEqual([]);
  });

  it('a non-overlapping cut leaves the window untouched', () => {
    const result = subtractInterval(window, iv('2026-09-01T13:00Z', '2026-09-01T14:00Z'));
    expect(result).toEqual([window]);
  });

  it('a cut touching exactly at the boundary (half-open) leaves the window untouched', () => {
    const result = subtractInterval(window, iv('2026-09-01T12:00Z', '2026-09-01T13:00Z'));
    expect(result).toEqual([window]);
  });
});

describe('subtractIntervals (breaks + blackout collisions)', () => {
  it('a lunch break carves a hole out of the morning window', () => {
    const windows = [iv('2026-09-01T03:00Z', '2026-09-01T09:00Z')]; // 09:00-15:00 Dhaka
    const lunchBreak = [iv('2026-09-01T06:00Z', '2026-09-01T06:30Z')]; // 12:00-12:30 Dhaka
    const result = subtractIntervals(windows, lunchBreak);
    expect(result).toEqual([iv('2026-09-01T03:00Z', '2026-09-01T06:00Z'), iv('2026-09-01T06:30Z', '2026-09-01T09:00Z')]);
  });

  it('a blackout period spanning the whole window removes it entirely', () => {
    const windows = [iv('2026-09-01T03:00Z', '2026-09-01T09:00Z')];
    const blackout = [iv('2026-09-01T00:00Z', '2026-09-01T12:00Z')];
    expect(subtractIntervals(windows, blackout)).toEqual([]);
  });

  it('multiple blocked periods each remove their own piece', () => {
    const windows = [iv('2026-09-01T03:00Z', '2026-09-01T09:00Z')];
    const blocks = [iv('2026-09-01T03:00Z', '2026-09-01T04:00Z'), iv('2026-09-01T08:00Z', '2026-09-01T09:00Z')];
    expect(subtractIntervals(windows, blocks)).toEqual([iv('2026-09-01T04:00Z', '2026-09-01T08:00Z')]);
  });
});

describe('sweepMaxConcurrency / hasCapacity — capacity 1', () => {
  const capacity = 1;

  it('a single booking with no overlap has capacity', () => {
    expect(hasCapacity(iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), [], capacity)).toBe(true);
  });

  it('an overlapping candidate against an existing booking is rejected', () => {
    const existing = [iv('2026-09-01T09:00Z', '2026-09-01T09:20Z')];
    expect(hasCapacity(iv('2026-09-01T09:10Z', '2026-09-01T09:30Z'), existing, capacity)).toBe(false);
  });

  it('a candidate starting exactly when the existing booking ends IS allowed (half-open reuse)', () => {
    const existing = [iv('2026-09-01T09:00Z', '2026-09-01T09:20Z')];
    expect(hasCapacity(iv('2026-09-01T09:20Z', '2026-09-01T09:40Z'), existing, capacity)).toBe(true);
  });
});

describe('sweepMaxConcurrency / hasCapacity — capacity 2', () => {
  const capacity = 2;

  it('two simultaneous bookings exactly fill capacity 2; a third overlapping one is rejected', () => {
    const existing = [iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T09:05Z', '2026-09-01T09:15Z')];
    expect(hasCapacity(iv('2026-09-01T09:08Z', '2026-09-01T09:12Z'), existing, capacity)).toBe(false);
  });

  it('a third booking that only touches one of the two existing ones is allowed', () => {
    const existing = [iv('2026-09-01T09:00Z', '2026-09-01T09:20Z'), iv('2026-09-01T09:05Z', '2026-09-01T09:10Z')];
    // Second existing ends at 09:10, so at 09:12 only the first is still active (1 < 2).
    expect(hasCapacity(iv('2026-09-01T09:12Z', '2026-09-01T09:18Z'), existing, capacity)).toBe(true);
  });
});

describe('Spay/Neuter mixed overlap (the core acceptance scenario)', () => {
  const capacity = 2;
  // Spay: 09:00–09:40 (40 min). Neuter: 09:00–09:20 (20 min). Both start
  // together, filling capacity 2 for the first 20 minutes.
  const spay = iv('2026-09-01T09:00Z', '2026-09-01T09:40Z');
  const neuter = iv('2026-09-01T09:00Z', '2026-09-01T09:20Z');

  it('a 40-min Spay and a 20-min Neuter run together when capacity permits', () => {
    expect(hasCapacity(neuter, [spay], capacity)).toBe(true);
    expect(sweepMaxConcurrency(spay, [neuter])).toBe(2);
  });

  it('while both are running, a third candidate overlapping that window is rejected', () => {
    const thirdNeuter = iv('2026-09-01T09:05Z', '2026-09-01T09:15Z');
    expect(hasCapacity(thirdNeuter, [spay, neuter], capacity)).toBe(false);
  });

  it('when the Neuter ends (09:20), its capacity is reused while the Spay continues', () => {
    // A new 20-min Neuter starting exactly at 09:20 must be accepted: only
    // the Spay (still running until 09:40) overlaps it, so concurrency = 2.
    const nextNeuter = iv('2026-09-01T09:20Z', '2026-09-01T09:40Z');
    expect(hasCapacity(nextNeuter, [spay, neuter], capacity)).toBe(true);
    expect(sweepMaxConcurrency(nextNeuter, [spay, neuter])).toBe(2);
  });

  it('but a candidate starting even 1 minute before the Neuter ends is rejected (all three would overlap)', () => {
    const tooEarly = iv('2026-09-01T09:19Z', '2026-09-01T09:39Z');
    expect(hasCapacity(tooEarly, [spay, neuter], capacity)).toBe(false);
  });

  it('two intervals that overlap the candidate window but never overlap each other are correctly NOT double-counted', () => {
    // D and E each touch the candidate window but D ends before E starts —
    // peak concurrency within the candidate's own span is only 1 (+1 for
    // the candidate = 2), not 3. This is the case naive "count of intervals
    // touching the window" over-approximates.
    const d = iv('2026-09-01T08:50Z', '2026-09-01T09:05Z');
    const e = iv('2026-09-01T09:15Z', '2026-09-01T09:35Z');
    const candidate = iv('2026-09-01T09:00Z', '2026-09-01T09:20Z');
    expect(sweepMaxConcurrency(candidate, [d, e])).toBe(2);
    expect(hasCapacity(candidate, [d, e], 2)).toBe(true);
  });
});

describe('generateCandidateStarts', () => {
  it('generates neuter starts every 20 minutes within a 1-hour window', () => {
    const window = iv('2026-09-01T03:00Z', '2026-09-01T04:00Z'); // 09:00–10:00 Dhaka
    const starts = generateCandidateStarts(window, 20);
    expect(starts.map((d) => d.toISOString())).toEqual([
      '2026-09-01T03:00:00.000Z',
      '2026-09-01T03:20:00.000Z',
      '2026-09-01T03:40:00.000Z',
    ]);
  });

  it('generates spay starts every 40 minutes within the same window (its own grid)', () => {
    const window = iv('2026-09-01T03:00Z', '2026-09-01T04:00Z');
    const starts = generateCandidateStarts(window, 40);
    expect(starts.map((d) => d.toISOString())).toEqual(['2026-09-01T03:00:00.000Z']); // second start (03:40) would end at 04:20, past the window
  });

  it('does not produce a start whose operation would run past the window end', () => {
    const window = iv('2026-09-01T03:00Z', '2026-09-01T03:30Z'); // 30-min window
    expect(generateCandidateStarts(window, 20)).toHaveLength(1); // only one 20-min slot fits
  });
});

describe('resolveDayWindows', () => {
  const date = '2026-09-01'; // a Tuesday

  it('uses the weekly schedule when there is no service-specific override', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      manualSlots: [],
      breaks: [],
      blockedPeriods: [],
    });
    expect(windows).toEqual([iv('2026-09-01T03:00Z', '2026-09-01T11:00Z')]);
  });

  it('service-specific schedule REPLACES the weekly schedule for that service, not adds to it', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [{ startTime: '09:00', endTime: '12:00' }], // Spay only offered mornings
      manualSlots: [],
      breaks: [],
      blockedPeriods: [],
    });
    expect(windows).toEqual([iv('2026-09-01T03:00Z', '2026-09-01T06:00Z')]);
  });

  it('a break collides with and carves a hole in the schedule window', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      manualSlots: [],
      breaks: [{ startTime: '13:00', endTime: '14:00' }],
      blockedPeriods: [],
    });
    expect(windows).toEqual([
      iv('2026-09-01T03:00Z', '2026-09-01T07:00Z'), // 09:00-13:00
      iv('2026-09-01T08:00Z', '2026-09-01T11:00Z'), // 14:00-17:00
    ]);
  });

  it('a blackout (blocked period) collides with and carves a hole in the schedule window', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      manualSlots: [],
      breaks: [],
      blockedPeriods: [iv('2026-09-01T09:00Z', '2026-09-01T10:00Z')], // 15:00-16:00 Dhaka blocked
    });
    expect(windows).toEqual([
      iv('2026-09-01T03:00Z', '2026-09-01T09:00Z'),
      iv('2026-09-01T10:00Z', '2026-09-01T11:00Z'),
    ]);
  });

  it('a closed date override removes all scheduled windows', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      dateOverride: { isClosed: true },
      manualSlots: [],
      breaks: [],
      blockedPeriods: [],
    });
    expect(windows).toEqual([]);
  });

  it('a date override with explicit hours replaces the weekly schedule for that date only', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      dateOverride: { isClosed: false, overrideStartTime: '10:00', overrideEndTime: '13:00' },
      manualSlots: [],
      breaks: [],
      blockedPeriods: [],
    });
    expect(windows).toEqual([iv('2026-09-01T04:00Z', '2026-09-01T07:00Z')]);
  });

  it('a manual slot is bookable even on an otherwise closed date', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [{ startTime: '09:00', endTime: '17:00' }],
      serviceWindows: [],
      dateOverride: { isClosed: true },
      manualSlots: [{ startTime: '10:00', endTime: '11:00' }],
      breaks: [],
      blockedPeriods: [],
    });
    expect(windows).toEqual([iv('2026-09-01T04:00Z', '2026-09-01T05:00Z')]);
  });

  it('a manual slot is still subject to breaks and blackout periods', () => {
    const windows = resolveDayWindows({
      date,
      weeklyWindows: [],
      serviceWindows: [],
      manualSlots: [{ startTime: '10:00', endTime: '12:00' }],
      breaks: [{ startTime: '10:30', endTime: '11:00' }],
      blockedPeriods: [],
    });
    expect(windows).toEqual([
      iv('2026-09-01T04:00Z', '2026-09-01T04:30Z'),
      iv('2026-09-01T05:00Z', '2026-09-01T06:00Z'),
    ]);
  });
});

describe('Timezone and daylight-independent calculations', () => {
  it('Asia/Dhaka is a fixed +06:00 offset year-round (no DST) — January and July agree', () => {
    expect(dhakaOffsetMinutes(new Date('2026-01-15T00:00:00.000Z'))).toBe(360);
    expect(dhakaOffsetMinutes(new Date('2026-07-15T00:00:00.000Z'))).toBe(360);
    expect(dhakaOffsetMinutes(new Date('2026-03-29T00:00:00.000Z'))).toBe(360); // a typical US/EU DST-start date
    expect(dhakaOffsetMinutes(new Date('2026-10-25T00:00:00.000Z'))).toBe(360); // a typical EU DST-end date
  });

  it('dhakaWallClockToUtc(09:00) is always 03:00 UTC, in every season', () => {
    expect(dhakaWallClockToUtc('2026-01-15', '09:00').toISOString()).toBe('2026-01-15T03:00:00.000Z');
    expect(dhakaWallClockToUtc('2026-07-15', '09:00').toISOString()).toBe('2026-07-15T03:00:00.000Z');
  });

  it('toDhakaDateString correctly rolls the calendar date forward near UTC midnight', () => {
    // 18:30 UTC = 00:30 the next day in Dhaka (+6h).
    expect(toDhakaDateString(new Date('2026-09-01T18:30:00.000Z'))).toBe('2026-09-02');
    // 17:59 UTC = 23:59 the same day in Dhaka.
    expect(toDhakaDateString(new Date('2026-09-01T17:59:00.000Z'))).toBe('2026-09-01');
  });
});
