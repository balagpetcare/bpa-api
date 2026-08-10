import { CampaignStatus } from '@prisma/client';
import { toDhakaDateString } from '../spay-neuter/spay-neuter.timezone';

// Single source of truth for public-facing session availability, shared by
// the coverage summary, the paginated sessions list, and (mirrored 1:1) the
// frontend badge rendering — replaces the three independent computations
// that used to live in SessionCard/CampaignStickyBar/hero-stats.
export type SessionAvailability = 'available' | 'few_left' | 'full' | 'registration_closed' | 'completed';

export interface SessionStatusInput {
  sessionDate: Date;
  capacity: number;
  bookedCount: number;
  isActive: boolean;
}

export interface CampaignStatusInput {
  status: CampaignStatus;
}

// A session is "few_left" once remaining capacity drops to the greater of
// 5 seats or 10% of total capacity — matches the threshold the old
// SessionCard used, kept identical so existing behaviour doesn't shift.
export function fewLeftThreshold(capacity: number): number {
  return Math.max(5, Math.round(capacity * 0.1));
}

// "Today" for a Bangladesh campaign must be Asia/Dhaka's calendar day, not
// the server process's local timezone (frequently UTC in containers/cloud
// hosts) — a session must not flip to Past just because the server clock
// hasn't crossed midnight in whatever zone it happens to run in.
// `sessionDate` is a Postgres DATE column; Prisma represents it as a Date
// at UTC midnight of the intended calendar day, so "today" must be built
// the same way for a same-representation comparison.
export function todayInDhaka(now: Date = new Date()): Date {
  return new Date(`${toDhakaDateString(now)}T00:00:00.000Z`);
}

export function computeSessionStatus(
  session: SessionStatusInput,
  campaign: CampaignStatusInput,
  now: Date = new Date(),
): SessionAvailability {
  const today = todayInDhaka(now);
  if (session.sessionDate < today) return 'completed';

  if (!session.isActive || campaign.status !== CampaignStatus.registration_open) {
    return 'registration_closed';
  }

  const available = session.capacity - session.bookedCount;
  if (available <= 0) return 'full';
  if (available <= fewLeftThreshold(session.capacity)) return 'few_left';
  return 'available';
}
