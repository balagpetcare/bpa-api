export interface OpeningHoursRow {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  opensAt: string | null; // "HH:MM"
  closesAt: string | null; // "HH:MM"
  isClosed: boolean;
}

export type OpenNowStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface OpenNowResult {
  status: OpenNowStatus;
  timezone: string;
  todayHours: { opensAt: string | null; closesAt: string | null; isClosed: boolean } | null;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Reads the current day-of-week and minutes-since-midnight in `timezone`
 * using Node's built-in Intl (no timezone library dependency needed). */
export function getZonedNow(timezone: string, referenceDate: Date = new Date()): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(referenceDate);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (hour === 24) hour = 0; // some ICU implementations render midnight as "24"

  return { dayOfWeek: WEEKDAY_INDEX[weekday] ?? 0, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Computes whether a branch is open right now, from its weekly hours and
 * IANA timezone. Never guesses: a day with no configured hours row (not
 * even a "closed" row) is reported as UNKNOWN, distinct from CLOSED.
 */
export function computeOpenNowStatus(
  openingHours: OpeningHoursRow[],
  timezone: string,
  referenceDate: Date = new Date(),
): OpenNowResult {
  const { dayOfWeek, minutes } = getZonedNow(timezone, referenceDate);
  const today = openingHours.find((h) => h.dayOfWeek === dayOfWeek) ?? null;

  if (!today) {
    return { status: 'UNKNOWN', timezone, todayHours: null };
  }

  const todayHours = { opensAt: today.opensAt, closesAt: today.closesAt, isClosed: today.isClosed };

  if (today.isClosed) {
    return { status: 'CLOSED', timezone, todayHours };
  }
  if (!today.opensAt || !today.closesAt) {
    return { status: 'UNKNOWN', timezone, todayHours };
  }

  const opens = toMinutes(today.opensAt);
  const closes = toMinutes(today.closesAt);

  // Overnight range (e.g. 20:00–02:00): open if now is after opening OR
  // before closing (the close time belongs to the next calendar day).
  const isOpen = closes <= opens ? minutes >= opens || minutes < closes : minutes >= opens && minutes < closes;

  return { status: isOpen ? 'OPEN' : 'CLOSED', timezone, todayHours };
}

/** Haversine great-circle distance in kilometers — no PostGIS/extension
 * required, just standard trigonometric functions. */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
