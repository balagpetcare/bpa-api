import { dhakaWallClockToUtc } from './spay-neuter.timezone';

// ─── Pure scheduling / concurrency engine ───────────────────────────
//
// Everything in this file is side-effect-free and DB-free by design, per
// the same rationale as spay-neuter.domain.ts: these are the hardest-to-get-
// right invariants in the whole feature, so they are unit tested in
// isolation from Prisma and the network. DB-aware callers (spay-neuter.
// availability.service.ts, spay-neuter.hold.service.ts) fetch rows and hand
// them to these functions as plain objects.

export type Interval = { start: Date; end: Date };

export type WeeklyWindow = { dayOfWeek: number; startTime: string; endTime: string };
export type DateOverride = {
  isClosed: boolean;
  overrideStartTime?: string | null;
  overrideEndTime?: string | null;
};
export type NamedInterval = { startTime: string; endTime: string };

// ─── Half-open interval overlap ──────────────────────────────────────
//
// [start, end) semantics throughout this module: two intervals overlap iff
// a.start < b.end AND b.start < a.end. An interval that ends exactly when
// another starts does NOT overlap it — this is what lets a 20-minute Neuter
// ending at 09:20 free its capacity for an operation starting at 09:20.

export function overlapsHalfOpen(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

// ─── Interval subtraction ────────────────────────────────────────────

/** Removes `cut` from `window`, returning 0, 1, or 2 resulting sub-intervals. */
export function subtractInterval(window: Interval, cut: Interval): Interval[] {
  if (!overlapsHalfOpen(window, cut)) return [window];

  const results: Interval[] = [];
  if (cut.start.getTime() > window.start.getTime()) {
    results.push({ start: window.start, end: minDate(cut.start, window.end) });
  }
  if (cut.end.getTime() < window.end.getTime()) {
    results.push({ start: maxDate(cut.end, window.start), end: window.end });
  }
  return results.filter((iv) => iv.start.getTime() < iv.end.getTime());
}

/** Applies subtractInterval for every cut, against every window, accumulating results. */
export function subtractIntervals(windows: Interval[], cuts: Interval[]): Interval[] {
  let remaining = windows;
  for (const cut of cuts) {
    remaining = remaining.flatMap((w) => subtractInterval(w, cut));
  }
  return remaining;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

// ─── Concurrency sweep ────────────────────────────────────────────────

/**
 * Maximum number of intervals simultaneously active at any instant within
 * [candidate.start, candidate.end), INCLUDING the candidate itself.
 *
 * Correctness note: `existing` need not be pre-filtered to only intervals
 * overlapping the candidate — non-overlapping ones contribute nothing to
 * the max by construction — but callers should filter for query efficiency.
 * The max of a family of intervals that each individually overlap a window
 * is always attained at a point within that window (provable by induction:
 * any two window-overlapping intervals' mutual overlap itself overlaps the
 * window, since both endpoints are bounded by the window's own bounds) — so
 * a global, unrestricted sweep over (candidate ∪ overlapping existing)
 * yields exactly the right answer without needing to clip anything to the
 * window boundaries.
 */
export function sweepMaxConcurrency(candidate: Interval, existing: Interval[]): number {
  type Event = { t: number; isEnd: boolean };
  const events: Event[] = [
    { t: candidate.start.getTime(), isEnd: false },
    { t: candidate.end.getTime(), isEnd: true },
  ];

  for (const iv of existing) {
    if (!overlapsHalfOpen(iv, candidate)) continue;
    events.push({ t: iv.start.getTime(), isEnd: false });
    events.push({ t: iv.end.getTime(), isEnd: true });
  }

  // Half-open semantics: at a tied timestamp, process end-events before
  // start-events, so an interval ending at t and another starting at t are
  // never counted as simultaneously active.
  events.sort((a, b) => a.t - b.t || (a.isEnd === b.isEnd ? 0 : a.isEnd ? -1 : 1));

  let running = 0;
  let max = 0;
  for (const e of events) {
    running += e.isEnd ? -1 : 1;
    if (running > max) max = running;
  }
  return max;
}

export function hasCapacity(candidate: Interval, existing: Interval[], capacity: number): boolean {
  return sweepMaxConcurrency(candidate, existing) <= capacity;
}

// ─── Candidate start-time generation ─────────────────────────────────

/**
 * Start times within `window`, stepped at `stepMinutes` (defaults to the
 * service's own duration — each service gets its own start-time grid, which
 * is what lets a 20-minute Neuter grid interleave with a 40-minute Spay
 * grid rather than being forced onto a shared coarser grid).
 */
export function generateCandidateStarts(
  window: Interval,
  durationMinutes: number,
  stepMinutes: number = durationMinutes,
): Date[] {
  const starts: Date[] = [];
  let cursor = window.start.getTime();
  const windowEnd = window.end.getTime();
  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;

  while (cursor + durationMs <= windowEnd) {
    starts.push(new Date(cursor));
    cursor += stepMs;
  }
  return starts;
}

// ─── Day-window resolution ────────────────────────────────────────────

export type ResolveDayWindowsInput = {
  /** Asia/Dhaka calendar date, "YYYY-MM-DD". */
  date: string;
  /** General clinic weekly schedule rows already filtered to this date's day-of-week. */
  weeklyWindows: NamedInterval[];
  /** Service-specific weekly override rows already filtered to this date's day-of-week. When non-empty, these REPLACE weeklyWindows for this service. */
  serviceWindows: NamedInterval[];
  /** Date-specific override/closure for this exact date, if any. */
  dateOverride?: DateOverride;
  /** Explicit ad-hoc "manual slot" windows for this exact date (always added, even on a closed date). */
  manualSlots: NamedInterval[];
  /** Recurring intra-day breaks for this date's day-of-week. */
  breaks: NamedInterval[];
  /** Ad-hoc blocked instants (already absolute UTC), e.g. from SpayClinicBlockedPeriod or doctor-unavailability-as-closure. */
  blockedPeriods: Interval[];
};

/**
 * Computes the free bookable windows (UTC instants) for one Asia/Dhaka
 * calendar date, from every configured schedule input. Order of operations:
 * 1. Pick the base schedule (service-specific overrides the weekly default).
 * 2. Apply the date override (closed date ⇒ no scheduled windows; explicit
 *    override hours ⇒ replace the base schedule for this date only).
 * 3. Union in manual slots unconditionally — an admin-added manual slot is
 *    bookable even on an otherwise closed date, by design.
 * 4. Subtract breaks and blocked periods from everything.
 */
export function resolveDayWindows(input: ResolveDayWindowsInput): Interval[] {
  const base = input.serviceWindows.length > 0 ? input.serviceWindows : input.weeklyWindows;

  let scheduledWindows: NamedInterval[];
  if (input.dateOverride?.isClosed) {
    scheduledWindows = [];
  } else if (input.dateOverride?.overrideStartTime && input.dateOverride?.overrideEndTime) {
    scheduledWindows = [
      { startTime: input.dateOverride.overrideStartTime, endTime: input.dateOverride.overrideEndTime },
    ];
  } else {
    scheduledWindows = base;
  }

  const toUtcInterval = (w: NamedInterval): Interval => ({
    start: dhakaWallClockToUtc(input.date, w.startTime),
    end: dhakaWallClockToUtc(input.date, w.endTime),
  });

  const windows = [...scheduledWindows, ...input.manualSlots].map(toUtcInterval);

  const breakIntervals = input.breaks.map(toUtcInterval);
  const afterBreaks = subtractIntervals(windows, breakIntervals);
  const afterBlocked = subtractIntervals(afterBreaks, input.blockedPeriods);

  return mergeIntervals(afterBlocked).sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Merges overlapping/adjacent (half-open touching) intervals after unioning multiple sources. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [sorted[0]];
  for (const iv of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (iv.start.getTime() <= last.end.getTime()) {
      if (iv.end.getTime() > last.end.getTime()) last.end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}
