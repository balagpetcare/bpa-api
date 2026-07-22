import { sendEmail } from './email.service';

/**
 * Fire-and-forget campaign email notifications.
 * Never throws — email failure must not affect the main flow.
 */

export function sendRegistrationConfirmationEmail(opts: {
  to: string;
  ownerName: string;
  bookingNumber: string;
  campaignTitle: string;
  sessionDate: string;
  sessionTime: string;
  venueName: string;
  petCount: number;
  totalAmount: string;
  isFree: boolean;
}): void {
  sendEmail({
    to: opts.to,
    template: 'BOOKING_CONFIRMATION',
    data: {
      ownerName: opts.ownerName,
      bookingNumber: opts.bookingNumber,
      campaignTitle: opts.campaignTitle,
      sessionDate: opts.sessionDate,
      sessionTime: opts.sessionTime,
      venueName: opts.venueName,
      petCount: opts.petCount,
      totalAmount: opts.totalAmount,
      isFree: opts.isFree,
    }
  }).catch(() => {});
}

export function sendPaymentConfirmationEmail(opts: {
  to: string;
  ownerName: string;
  bookingNumber: string;
  campaignTitle: string;
  amount: string;
}): void {
  sendEmail({
    to: opts.to,
    template: 'PAYMENT_SUCCESS',
    data: {
      name: opts.ownerName,
      amount: `৳${opts.amount}`,
      txId: 'N/A',
      bookingNumber: opts.bookingNumber,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    }
  }).catch(() => {});
}

