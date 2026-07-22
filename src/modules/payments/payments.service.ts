import { RegistrationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { getEPS, isEPSConfigured } from '../../services/eps.service';
import * as repo from './payments.repository';
import { settleCampaignPayment, cancelCampaignPayment } from '../campaign-registrations/campaign-registrations.service';
import { settleDonationPayment, cancelDonationPayment } from '../donations/donations.service';
import { issueCarePartnerCardOnPayment } from '../care-partner-cards/care-partner-cards.service';
import { config } from '../../config';

export type SettleResult = 'success' | 'failed' | 'cancelled' | 'pending_review' | 'pending';

// ─── Verify & settle payment ──────────────────────────────────────

export async function settlePayment(merchantTxnId: string): Promise<SettleResult> {
  const payment = await repo.findPaymentByMerchantTxnId(merchantTxnId);
  if (!payment) throw AppError.notFound('Payment');

  // Already settled — don't re-verify
  const settled: string[] = ['success', 'failed', 'cancelled', 'refunded'];
  if (settled.includes(payment.status)) return payment.status as SettleResult;
  if (payment.status === 'pending_review') return 'pending_review';

  if (!isEPSConfigured()) {
    throw AppError.badRequest('EPS gateway not configured');
  }

  const eps = getEPS();
  let epsStatus: string;
  let epsPayload: Record<string, unknown> = {};

  try {
    const result = await eps.verifyPayment({ merchantTransactionId: merchantTxnId });
    const resultRecord = result as unknown as Record<string, unknown>;
    epsStatus = result.Status;
    epsPayload = resultRecord;
    const epsTxnId =
      typeof resultRecord.EPSTransactionId === 'string'
        ? String(resultRecord.EPSTransactionId).trim()
        : typeof resultRecord.EpsTransactionId === 'string'
          ? String(resultRecord.EpsTransactionId).trim()
          : '';
    if (epsTxnId) {
      await repo.updatePaymentEpsTxnId(payment.id, epsTxnId);
    }
  } catch {
    // Network or EPS error — mark as pending_review for manual follow-up
    return 'pending';
  }

  if (epsStatus === 'Success') {
    await repo.updatePaymentStatus(payment.id, 'success', epsPayload);
    await activateLinkedEntities(payment);
    return 'success';
  }

  if (epsStatus === 'Cancelled') {
    await repo.updatePaymentStatus(payment.id, 'cancelled', epsPayload);
    await deactivateLinkedEntities(payment);
    return 'cancelled';
  }

  if (epsStatus === 'Failed') {
    await repo.updatePaymentStatus(payment.id, 'failed', epsPayload);
    await deactivateLinkedEntities(payment);
    return 'failed';
  }

  // Unknown EPS status — flag for manual review but do not lock the booking
  await repo.updatePaymentStatus(payment.id, 'pending_review', epsPayload);
  return 'pending_review';
}

// ─── Cancel payment without EPS re-verify ────────────────────────
// Used when the user explicitly cancels at the gateway (cancel URL).
// We trust the intent and mark directly — no need to call EPS.

export async function cancelPaymentRecord(merchantTxnId: string): Promise<void> {
  const payment = await repo.findPaymentByMerchantTxnId(merchantTxnId);
  if (!payment) return;

  const alreadyTerminal: string[] = ['success', 'failed', 'cancelled', 'refunded'];
  if (alreadyTerminal.includes(payment.status)) return;

  await repo.updatePaymentStatus(payment.id, 'cancelled', { cancelledVia: 'user_cancel_callback' });
  await deactivateLinkedEntities(payment);
}

// ─── Public: get payment status by bookingRef or paymentRef ──────

export async function getPublicPaymentStatus(params: {
  bookingRef?: string;
  paymentRef?: string;
}): Promise<{
  bookingRef: string;
  paymentRef: string | null;
  paymentStatus: string;
  bookingStatus: string;
  amount: number;
  currency: string;
  ownerPhoneMasked: string | null;
  campaignTitle: string | null;
  petCount: number;
  downloadSlipUrl: string;
  verifyUrl: string;
  createdAt: string;
} | null> {
  let reg: Awaited<ReturnType<typeof repo.findRegistrationByBookingRef>> = null;

  if (params.bookingRef) {
    reg = await repo.findRegistrationByBookingRef(params.bookingRef);
  } else if (params.paymentRef) {
    reg = await repo.findRegistrationByPaymentRef(params.paymentRef);
  }

  if (!reg) return null;

  const amount = Number(String(reg.totalAmountBdt ?? 0));
  const phone = reg.owner?.mobile ?? null;
  const phoneMasked = phone ? maskPhone(phone) : null;
  const slipBase = config.API_BASE_URL?.replace(/\/$/, '') ?? '';

  return {
    bookingRef: reg.bookingNumber,
    paymentRef: reg.payment?.merchantTxnId ?? null,
    paymentStatus: reg.payment?.status ?? (amount === 0 ? 'success' : 'pending'),
    bookingStatus: reg.status,
    amount,
    currency: 'BDT',
    ownerPhoneMasked: phoneMasked,
    campaignTitle: reg.campaign?.title ?? null,
    petCount: reg.petBookings.length,
    downloadSlipUrl: `${slipBase}/api/v1/public/campaign-registrations/booking/${encodeURIComponent(reg.bookingNumber)}/slip.pdf`,
    verifyUrl: `${config.FRONTEND_URL}/payment/status?bookingRef=${encodeURIComponent(reg.bookingNumber)}`,
    createdAt: reg.createdAt.toISOString(),
  };
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

// ─── Admin: manual mark-paid after offline verification ──────────

export async function manualMarkPaid(paymentId: string, adminNote?: string): Promise<{ id: string; status: string }> {
  const payment = await repo.findPaymentById(paymentId);
  if (!payment) throw AppError.notFound('Payment');

  if (payment.status === 'success') {
    throw AppError.badRequest('Payment is already marked as paid');
  }
  if (payment.status === 'refunded') {
    throw AppError.badRequest('Refunded payments cannot be manually marked paid');
  }

  await repo.updatePaymentStatus(payment.id, 'success', {
    manuallyMarkedPaid: true,
    adminNote: adminNote ?? null,
    markedAt: new Date().toISOString(),
  });
  await activateLinkedEntities(payment);
  return { id: payment.id, status: 'success' };
}

// ─── Activate linked entities on payment success ──────────────────

async function activateLinkedEntities(payment: { id: string; entityType: string | null; purpose?: string; payload?: unknown }): Promise<void> {
  if (payment.entityType === 'campaign') {
    await settleCampaignPayment(payment.id);
    return;
  }
  if (payment.entityType === 'donation') {
    await settleDonationPayment(payment.id);
    return;
  }
  if (payment.entityType === 'care_partner') {
    await issueCarePartnerCardOnPayment(payment.id);
    return;
  }
  if (payment.purpose === 'community_membership') {
    const { handlePaymentSuccess } = await import('../community-membership/community-membership.service');
    await handlePaymentSuccess(payment.id);
    return;
  }
  if (payment.purpose === 'community_membership_upgrade') {
    const { handlePaymentSuccess } = await import('../community-membership/community-membership.service');
    await handlePaymentSuccess(payment.id);
    return;
  }
  if (payment.purpose === 'membership_campaign_application') {
    const { handleMembershipApplicationPaymentSuccess } = await import('../membership-campaign/membership-campaign.service');
    await handleMembershipApplicationPaymentSuccess(payment.id);
    return;
  }
  if (payment.purpose === 'membership_campaign_upgrade') {
    const { handleMembershipUpgradePaymentSuccess } = await import('../membership-campaign/membership-campaign.service');
    await handleMembershipUpgradePaymentSuccess(payment.id);
    return;
  }
  await prisma.eventRegistration.updateMany({
    where: { paymentId: payment.id, status: 'pending' },
    data: { status: RegistrationStatus.confirmed },
  });
}

async function deactivateLinkedEntities(payment: { id: string; entityType: string | null; purpose?: string }): Promise<void> {
  if (payment.entityType === 'campaign') {
    await cancelCampaignPayment(payment.id);
    return;
  }
  if (payment.entityType === 'donation') {
    await cancelDonationPayment(payment.id);
    return;
  }
  if (payment.entityType === 'care_partner') {
    await cancelCarePartnerContribution(payment.id);
    return;
  }
  if (payment.purpose === 'membership_campaign_upgrade') {
    const { handleMembershipUpgradePaymentFailure } = await import('../membership-campaign/membership-campaign.service');
    await handleMembershipUpgradePaymentFailure(payment.id, 'failed');
    return;
  }
  if (payment.purpose === 'membership_campaign_application') {
    return;
  }
}

async function cancelCarePartnerContribution(paymentId: string): Promise<void> {
  await prisma.careContribution.updateMany({
    where: { paymentId, status: 'pending_payment' },
    data: { status: 'cancelled' },
  });
}

// ─── Admin: force sync ────────────────────────────────────────────

export async function syncPayment(id: string) {
  const payment = await repo.findPaymentById(id);
  if (!payment) throw AppError.notFound('Payment');
  if (!payment.merchantTxnId) throw AppError.badRequest('Payment has no merchantTxnId to verify');

  const status = await settlePayment(payment.merchantTxnId);
  return { id: payment.id, status };
}

// ─── Admin: list payments ─────────────────────────────────────────

export async function listPayments(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  return repo.listPayments({
    page: params.page,
    limit: params.limit,
    status: params.status as never,
    search: params.search,
  });
}

export async function getPayment(id: string) {
  const p = await repo.findPaymentById(id);
  if (!p) throw AppError.notFound('Payment');
  return p;
}

// ─── Admin: search by bookingRef / phone / txnId ─────────────────

export async function searchPayments(q: string) {
  return repo.searchPayments(q);
}
