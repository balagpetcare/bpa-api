import { CampaignStatus } from '@prisma/client';
import { computeSessionStatus, fewLeftThreshold, todayInDhaka } from '../campaign-session-status';

describe('computeSessionStatus', () => {
  const registrationOpenCampaign = { status: CampaignStatus.registration_open };
  const tomorrow = new Date(Date.now() + 86400000);
  const yesterday = new Date(Date.now() - 86400000);

  it('returns "completed" for any session dated before today, regardless of capacity', () => {
    const status = computeSessionStatus(
      { sessionDate: yesterday, capacity: 50, bookedCount: 0, isActive: true },
      registrationOpenCampaign,
    );
    expect(status).toBe('completed');
  });

  it('returns "registration_closed" when the session is inactive even if capacity remains', () => {
    const status = computeSessionStatus(
      { sessionDate: tomorrow, capacity: 50, bookedCount: 0, isActive: false },
      registrationOpenCampaign,
    );
    expect(status).toBe('registration_closed');
  });

  it('returns "registration_closed" when the parent campaign is not registration_open', () => {
    const status = computeSessionStatus(
      { sessionDate: tomorrow, capacity: 50, bookedCount: 0, isActive: true },
      { status: CampaignStatus.registration_closed },
    );
    expect(status).toBe('registration_closed');
  });

  it('returns "full" once bookedCount reaches capacity', () => {
    const status = computeSessionStatus(
      { sessionDate: tomorrow, capacity: 50, bookedCount: 50, isActive: true },
      registrationOpenCampaign,
    );
    expect(status).toBe('full');
  });

  it('returns "few_left" exactly at the threshold boundary (max(5, 10%))', () => {
    const capacity = 50;
    const threshold = fewLeftThreshold(capacity); // max(5, 5) = 5
    const status = computeSessionStatus(
      { sessionDate: tomorrow, capacity, bookedCount: capacity - threshold, isActive: true },
      registrationOpenCampaign,
    );
    expect(status).toBe('few_left');
  });

  it('returns "available" just above the few_left threshold', () => {
    const capacity = 50;
    const threshold = fewLeftThreshold(capacity);
    const status = computeSessionStatus(
      { sessionDate: tomorrow, capacity, bookedCount: capacity - threshold - 1, isActive: true },
      registrationOpenCampaign,
    );
    expect(status).toBe('available');
  });

  it('uses a minimum threshold of 5 seats even for small-capacity sessions', () => {
    expect(fewLeftThreshold(10)).toBe(5);
    expect(fewLeftThreshold(200)).toBe(20);
  });

  // ── Asia/Dhaka boundary correctness ─────────────────────────────────
  // Bangladesh is UTC+6. In the window between Dhaka midnight and 06:00,
  // the UTC calendar date is still the PREVIOUS day. If "today" were
  // computed from the server process's local/UTC getters instead of an
  // explicit Asia/Dhaka conversion, a session dated "today" in Dhaka could
  // still read as tomorrow (or a session dated yesterday could wrongly
  // still look current) depending on the server's runtime timezone. These
  // assertions are independent of the machine's TZ env var because
  // `todayInDhaka`/`computeSessionStatus` always resolve via Asia/Dhaka.
  describe('Asia/Dhaka boundary correctness (not server-local-time-dependent)', () => {
    // 2026-06-16T00:30 in Dhaka == 2026-06-15T18:30 UTC — already "June 16"
    // on a Dhaka clock, but still "June 15" on a UTC clock.
    const earlyDhakaMorning = new Date('2026-06-15T18:30:00.000Z');

    it('todayInDhaka resolves to the Dhaka calendar day, not the UTC one', () => {
      const today = todayInDhaka(earlyDhakaMorning);
      expect(today.toISOString()).toBe('2026-06-16T00:00:00.000Z');
    });

    it('a session dated the Dhaka "today" is NOT completed, even though UTC still reads the previous day', () => {
      const status = computeSessionStatus(
        { sessionDate: new Date('2026-06-16T00:00:00.000Z'), capacity: 50, bookedCount: 0, isActive: true },
        { status: CampaignStatus.registration_open },
        earlyDhakaMorning,
      );
      expect(status).not.toBe('completed');
    });

    it('a session dated the Dhaka "yesterday" IS completed at this same instant', () => {
      const status = computeSessionStatus(
        { sessionDate: new Date('2026-06-15T00:00:00.000Z'), capacity: 50, bookedCount: 0, isActive: true },
        { status: CampaignStatus.registration_open },
        earlyDhakaMorning,
      );
      expect(status).toBe('completed');
    });
  });
});
