import { NotificationCategory, NotificationPreference } from '@prisma/client';

type PreferenceCategoryField = keyof Pick<
  NotificationPreference,
  | 'petHealthEnabled'
  | 'campaignEnabled'
  | 'videoEnabled'
  | 'membershipEnabled'
  | 'bookingEnabled'
  | 'promotionalEnabled'
>;

const CATEGORY_FIELD_MAP: Record<NotificationCategory, PreferenceCategoryField | null> = {
  pet_health: 'petHealthEnabled',
  campaign: 'campaignEnabled',
  video: 'videoEnabled',
  post: 'videoEnabled',
  membership: 'membershipEnabled',
  booking: 'bookingEnabled',
  payment: 'bookingEnabled',
  certificate: 'membershipEnabled',
  account: 'membershipEnabled',
  promotional: 'promotionalEnabled',
  // Emergency has no opt-out field — it is gated by bypassPreferences instead.
  emergency: null,
};

export function isCategoryAllowed(
  category: NotificationCategory,
  preference: NotificationPreference | null,
  bypassPreferences: boolean,
): boolean {
  if (bypassPreferences || category === 'emergency') return true;
  if (!preference) return true; // default-on until the user sets explicit preferences
  const field = CATEGORY_FIELD_MAP[category];
  if (!field) return true;
  return preference[field];
}

/** Minutes since midnight in the preference's own timezone-naive HH:MM fields. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function getMinutesOfDayInTimezone(timezone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

export function isWithinQuietHours(preference: NotificationPreference | null, at: Date = new Date()): boolean {
  if (!preference?.quietHoursEnabled || !preference.quietHoursStart || !preference.quietHoursEnd) {
    return false;
  }
  const start = toMinutes(preference.quietHoursStart);
  const end = toMinutes(preference.quietHoursEnd);
  const now = getMinutesOfDayInTimezone(preference.timezone, at);

  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  // Window wraps midnight, e.g. 22:00-07:00.
  return now >= start || now < end;
}
