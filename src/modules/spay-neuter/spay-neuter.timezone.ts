// ─── Asia/Dhaka display formatting ──────────────────────────────────
//
// Persisted timestamps are always UTC (Timestamptz). Asia/Dhaka wall-clock
// rendering happens ONLY here, at the API response boundary, using the
// runtime's IANA tz database via Intl — not a hardcoded +6 offset — so this
// stays correct if the historical tz database is ever corrected. Bangladesh
// has observed a fixed UTC+6 with no daylight-saving transitions since 2010
// (2009's single DST experiment was reverted), so in practice the offset
// below is constant year-round; the DST-independence tests in
// spay-neuter.scheduling.test.ts assert exactly that constancy.

export const DHAKA_TIME_ZONE = 'Asia/Dhaka';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DHAKA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** YYYY-MM-DD as it reads on a clock in Asia/Dhaka for the given UTC instant. */
export function toDhakaDateString(instant: Date): string {
  // en-CA locale formats as YYYY-MM-DD directly.
  return dateFormatter.format(instant);
}

/** "YYYY-MM-DD HH:mm" as it reads on a clock in Asia/Dhaka, plus the fixed offset. */
export function toDhakaDisplay(instant: Date): { date: string; time: string; iso: string } {
  const parts = dateTimeFormatter.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return { date, time, iso: `${date}T${time}:00+06:00` };
}

/**
 * Builds a UTC Date for a given Asia/Dhaka calendar date + "HH:mm" wall-clock
 * time. Uses the fixed +06:00 offset explicitly (rather than re-deriving it)
 * because Asia/Dhaka's offset is constant — this makes the conversion cheap
 * and exact without a full tz-database round trip.
 */
export function dhakaWallClockToUtc(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+06:00`);
}

/** The Asia/Dhaka UTC offset in minutes for a given instant (always +360 for Dhaka). */
export function dhakaOffsetMinutes(instant: Date): number {
  const utcDate = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const dhakaDate = new Date(instant.toLocaleString('en-US', { timeZone: DHAKA_TIME_ZONE }));
  return Math.round((dhakaDate.getTime() - utcDate.getTime()) / 60_000);
}
