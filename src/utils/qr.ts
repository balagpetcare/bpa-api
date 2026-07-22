import { createHmac } from 'crypto';
import { config } from '../config';

export function generateQrToken(petBookingId: string, campaignId: string): string {
  return createHmac('sha256', config.QR_SECRET)
    .update(`${petBookingId}:${campaignId}`)
    .digest('hex');
}

export function buildQrUrl(qrToken: string): string {
  return `${config.FRONTEND_URL}/verify/qr/${qrToken}`;
}

export function generateCareCardQrToken(cardId: string, contributionId: string): string {
  return createHmac('sha256', config.CARE_CARD_QR_SECRET)
    .update(`${cardId}:${contributionId}`)
    .digest('hex');
}

export function buildCareCardVerifyUrl(qrToken: string): string {
  return `${config.FRONTEND_URL}/verify/care-card/${qrToken}`;
}
