import { isCategoryAllowed, isWithinQuietHours, getMinutesOfDayInTimezone } from '../preferences';
import type { NotificationPreference } from '@prisma/client';

function basePreference(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    id: 'pref-1',
    userId: 'user-1',
    petHealthEnabled: true,
    campaignEnabled: true,
    videoEnabled: true,
    membershipEnabled: true,
    bookingEnabled: true,
    promotionalEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    language: 'en',
    timezone: 'Asia/Dhaka',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('isCategoryAllowed', () => {
  it('allows a category with no preference row (default-on)', () => {
    expect(isCategoryAllowed('campaign', null, false)).toBe(true);
  });

  it('respects an explicit opt-out for a mapped category', () => {
    const pref = basePreference({ campaignEnabled: false });
    expect(isCategoryAllowed('campaign', pref, false)).toBe(false);
  });

  it('never blocks emergency category, even with everything disabled', () => {
    const pref = basePreference({
      campaignEnabled: false,
      petHealthEnabled: false,
      pushEnabled: false,
      inAppEnabled: false,
    });
    expect(isCategoryAllowed('emergency', pref, false)).toBe(true);
  });

  it('bypassPreferences=true overrides any opt-out for non-emergency categories too', () => {
    const pref = basePreference({ promotionalEnabled: false });
    expect(isCategoryAllowed('promotional', pref, true)).toBe(true);
    expect(isCategoryAllowed('promotional', pref, false)).toBe(false);
  });

  it('maps post/video to the same videoEnabled flag', () => {
    const pref = basePreference({ videoEnabled: false });
    expect(isCategoryAllowed('video', pref, false)).toBe(false);
    expect(isCategoryAllowed('post', pref, false)).toBe(false);
  });

  it('maps payment/certificate/account through booking/membership flags', () => {
    const pref = basePreference({ bookingEnabled: false, membershipEnabled: false });
    expect(isCategoryAllowed('payment', pref, false)).toBe(false);
    expect(isCategoryAllowed('certificate', pref, false)).toBe(false);
    expect(isCategoryAllowed('account', pref, false)).toBe(false);
  });
});

describe('isWithinQuietHours', () => {
  it('is false when quiet hours are disabled', () => {
    const pref = basePreference({ quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00' });
    expect(isWithinQuietHours(pref)).toBe(false);
  });

  it('detects a same-day window (e.g. 13:00-15:00)', () => {
    const pref = basePreference({
      quietHoursEnabled: true,
      quietHoursStart: '13:00',
      quietHoursEnd: '15:00',
      timezone: 'UTC',
    });
    const inside = new Date('2026-01-01T14:00:00Z');
    const outside = new Date('2026-01-01T16:00:00Z');
    expect(isWithinQuietHours(pref, inside)).toBe(true);
    expect(isWithinQuietHours(pref, outside)).toBe(false);
  });

  it('detects a midnight-wrapping window (22:00-07:00)', () => {
    const pref = basePreference({
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      timezone: 'UTC',
    });
    const lateNight = new Date('2026-01-01T23:00:00Z');
    const earlyMorning = new Date('2026-01-02T05:00:00Z');
    const midday = new Date('2026-01-01T12:00:00Z');
    expect(isWithinQuietHours(pref, lateNight)).toBe(true);
    expect(isWithinQuietHours(pref, earlyMorning)).toBe(true);
    expect(isWithinQuietHours(pref, midday)).toBe(false);
  });

  it('returns false (never blocks) when start equals end (misconfigured window)', () => {
    const pref = basePreference({ quietHoursEnabled: true, quietHoursStart: '09:00', quietHoursEnd: '09:00' });
    expect(isWithinQuietHours(pref)).toBe(false);
  });
});

describe('getMinutesOfDayInTimezone', () => {
  it('converts a known UTC instant to the correct minute-of-day in Asia/Dhaka (UTC+6)', () => {
    const at = new Date('2026-01-01T00:30:00Z'); // 00:30 UTC -> 06:30 Dhaka
    expect(getMinutesOfDayInTimezone('Asia/Dhaka', at)).toBe(6 * 60 + 30);
  });
});
