import { randomBytes } from 'crypto';

/**
 * Short, cryptographically random (48 bits of entropy — 2^48 space, not
 * enumerable), safe to hand to an owner as a public lookup key. Distinct
 * from `bookingNumber` (BPA-SN-YYYYMMDD-#####), which is sequential and
 * therefore guessable — bookingNumber is a support/report reference only,
 * never an authorization credential.
 */
export function generateBookingCode(): string {
  return randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars
}
