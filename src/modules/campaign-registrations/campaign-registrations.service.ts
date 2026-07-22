import { WaitlistStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { initializeEpsPayment, isEPSConfigured, generateMerchantTxnId } from '../../services/eps.service';
import { generateQrToken } from '../../utils/qr';
import { sendCampaignSms } from '../../services/campaign-sms.service';
import { sendRegistrationConfirmationEmail } from '../../services/campaign-email.service';
import * as repo from './campaign-registrations.repository';
import type { RegisterCampaignDto, JoinWaitlistDto, RegistrationListQuery, WaitlistListQuery } from './campaign-registrations.types';

// ─── Register ───────────────────────────────────────────────────

export async function registerForCampaign(dto: RegisterCampaignDto) {
  // Validate campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: dto.campaignId },
    include: { services: { where: { isActive: true }, select: { id: true } } },
  });
  if (!campaign) throw AppError.notFound('Campaign');
  if (campaign.status !== 'registration_open') {
    throw AppError.badRequest('Campaign is not open for registration');
  }
  const now = new Date();
  if (campaign.registrationCloseAt && new Date(campaign.registrationCloseAt) <= now) {
    throw AppError.badRequest('Online registration is closed for this campaign.');
  }
  if (dto.petIds.length > campaign.maxPetsPerBooking) {
    throw AppError.badRequest(`Maximum ${campaign.maxPetsPerBooking} pets per booking`);
  }

  // Validate session belongs to this campaign
  const session = await prisma.campaignSession.findUnique({ where: { id: dto.sessionId } });
  if (!session || session.campaignId !== dto.campaignId) throw AppError.notFound('Session');
  if (!session.isActive) throw AppError.badRequest('Session is not active');

  // Validate all pets exist and belong to an owner
  const pets = await prisma.pet.findMany({
    where: { id: { in: dto.petIds }, isActive: true },
    select: { id: true, ownerId: true, petType: true },
  });
  if (pets.length !== dto.petIds.length) {
    throw AppError.badRequest('One or more pets not found or inactive');
  }

  // Enforce pet type restrictions when campaign limits which types are allowed
  if (campaign.allowedPetTypes.length > 0) {
    const disallowed = pets.filter(p => !campaign.allowedPetTypes.includes(p.petType));
    if (disallowed.length > 0) {
      const types = [...new Set(disallowed.map(p => p.petType))].join(', ');
      throw AppError.badRequest(`This campaign does not accept the following pet type(s): ${types}`);
    }
  }

  // Find or create pet owner by mobile
  let owner = await prisma.petOwner.findFirst({ where: { mobile: dto.mobile } });
  if (!owner) {
    owner = await prisma.petOwner.create({
      data: {
        ownerName: dto.ownerName,
        mobile: dto.mobile,
        email: dto.email,
        address: dto.address,
        isGuest: true,
      },
    });
  }

  // Public registrations are keyed by mobile, so every submitted pet must
  // already belong to the owner resolved for that same mobile number.
  // Without this, a guest owner record that shares a mobile could book pets
  // owned by someone else.
  if (pets.some(p => p.ownerId !== owner.id)) {
    throw AppError.badRequest('One or more selected pets do not belong to this owner');
  }

  // Atomic capacity reservation
  const reserved = await repo.reserveSlots(dto.sessionId, dto.petIds.length);
  if (!reserved) {
    throw AppError.badRequest('Session is fully booked. Please join the waitlist.');
  }

  try {
    const bookingNumber = await repo.generateBookingNumber();
    const totalAmount = Number(campaign.basePriceBdt) * dto.petIds.length;
    const isFree = totalAmount === 0;
    const serviceIds = campaign.services.map(s => s.id);

    const registration = await repo.createRegistration({
      bookingNumber,
      campaignId: dto.campaignId,
      sessionId: dto.sessionId,
      ownerId: owner.id,
      totalAmountBdt: totalAmount,
      isGuest: owner.isGuest,
      notes: dto.notes,
      petIds: dto.petIds,
      campaignServiceIds: serviceIds,
    });

    // Populate QR tokens for each pet booking
    await Promise.all(
      registration.petBookings.map(pb =>
        prisma.petBooking.update({
          where: { id: pb.id },
          data: { qrToken: generateQrToken(pb.id, dto.campaignId) },
        }),
      ),
    );

    // Free campaign: mark as paid immediately + send confirmation
    if (isFree) {
      await repo.settleRegistration(registration.id);
      // Fire-and-forget notifications
      const sessionInfo = await prisma.campaignSession.findUnique({
        where: { id: dto.sessionId },
        include: { venue: { select: { name: true } } },
      });
      sendCampaignSms({
        to: owner.mobile,
        message: `BPA: Your booking ${registration.bookingNumber} for ${campaign.title} is confirmed. Date: ${sessionInfo?.sessionDate ?? ''} at ${sessionInfo?.venue?.name ?? ''}. Thank you!`,
        campaignId: dto.campaignId,
      });
      if (owner.email) {
        sendRegistrationConfirmationEmail({
          to: owner.email,
          ownerName: owner.ownerName,
          bookingNumber: registration.bookingNumber,
          campaignTitle: campaign.title,
          sessionDate: sessionInfo?.sessionDate ? new Date(sessionInfo.sessionDate).toLocaleDateString('en-GB') : '',
          sessionTime: `${sessionInfo?.startTime ?? ''} – ${sessionInfo?.endTime ?? ''}`,
          venueName: sessionInfo?.venue?.name ?? '',
          petCount: dto.petIds.length,
          totalAmount: '0',
          isFree: true,
        });
      }
      return { registration, paymentUrl: null, isFree: true };
    }

    // Paid campaign: create payment and init EPS
    const merchantTxnId = generateMerchantTxnId();
    const payment = await prisma.payment.create({
      data: {
        gateway: 'eps',
        merchantTxnId,
        amount: totalAmount,
        currency: 'BDT',
        purpose: 'campaign_registration',
        entityType: 'campaign',
        entityId: dto.campaignId,
        payload: { platform: dto.platform },
      },
    });

    await repo.linkPayment(registration.id, payment.id);

    // If payment gateway is not configured/enabled, keep the booking as
    // pending_payment for admin manual confirmation.
    if (!isEPSConfigured()) {
      const reason = process.env.EPS_ENABLED !== 'true'
        ? 'EPS_ENABLED is not set to true'
        : process.env.PAYMENT_CHANNEL_MODE !== 'EPS'
        ? 'PAYMENT_CHANNEL_MODE is not EPS'
        : 'EPS credentials are incomplete';
      console.warn(`[BPA] Payment gateway inactive (${reason}) — booking ${registration.bookingNumber} created as pending_payment.`);
      return { registration, paymentUrl: null, isFree: false, paymentGatewayUnavailable: true, paymentMode: 'MANUAL_FALLBACK' as const };
    }

    try {
      // Use booking reference as a safe fallback email when owner didn't provide one.
      // EPS rejects an empty customerEmail — a deterministic placeholder is always valid.
      const customerEmail = owner.email?.trim() || `${registration.bookingNumber.toLowerCase()}@bangladeshpetassociation.com`;
      console.log(`[EPS] campaign booking=${registration.bookingNumber} amount=${totalAmount} BDT email_source=${owner.email?.trim() ? 'user' : 'generated'}`);
      const epsResult = await initializeEpsPayment({
        customerOrderId: payment.id,
        merchantTransactionId: merchantTxnId,
        totalAmount,
        customerName:     owner.ownerName,
        customerPhone:    owner.mobile,
        customerEmail,
        customerAddress:  'Bangladesh',
        customerCity:     'Dhaka',
        customerState:    'Dhaka Division',
        customerPostcode: '1000',
        productName:      'BPA Campaign Registration',
        // valueA = booking number: primary recovery key when txn ID is missing
        // valueB = payment UUID: fallback lookup via payment record
        // valueC = entity type: routing hint for activateLinkedEntities
        valueA: registration.bookingNumber,
        valueB: payment.id,
        valueC: 'campaign',
        // Also embed booking number in callback URLs as a query param so the
        // backend can recover the booking even if EPS omits the txn ID entirely.
        bookingRef: registration.bookingNumber,
      });

      return { registration, paymentUrl: epsResult.RedirectURL, isFree: false };
    } catch (epsErr) {
      // EPS call failed at runtime (network/API error). Keep the booking as
      // pending_payment — admin can confirm manually. Do NOT release slots.
      console.error('[BPA] EPS initializePayment failed:', epsErr instanceof Error ? epsErr.message : epsErr);
      return { registration, paymentUrl: null, isFree: false, paymentGatewayUnavailable: true, paymentMode: 'PAYMENT_INIT_FAILED' as const };
    }
  } catch (err) {
    // Rollback slot reservation on any non-EPS failure
    await repo.releaseSlots(dto.sessionId, dto.petIds.length);
    throw err;
  }
}

// ─── Join Waitlist ───────────────────────────────────────────────

export async function joinWaitlist(dto: JoinWaitlistDto) {
  const campaign = await prisma.campaign.findUnique({ where: { id: dto.campaignId } });
  if (!campaign) throw AppError.notFound('Campaign');
  if (!['registration_open', 'registration_closed'].includes(campaign.status)) {
    throw AppError.badRequest('Campaign waitlist is not available');
  }

  const session = await prisma.campaignSession.findUnique({ where: { id: dto.sessionId } });
  if (!session || session.campaignId !== dto.campaignId) throw AppError.notFound('Session');

  let owner = await prisma.petOwner.findFirst({ where: { mobile: dto.mobile } });
  if (!owner) {
    owner = await prisma.petOwner.create({
      data: {
        ownerName: dto.ownerName,
        mobile: dto.mobile,
        email: dto.email,
        isGuest: true,
      },
    });
  }

  // Prevent duplicate active waitlist entry
  const existing = await prisma.campaignWaitlist.findFirst({
    where: {
      campaignId: dto.campaignId,
      sessionId: dto.sessionId,
      ownerId: owner.id,
      status: WaitlistStatus.waiting,
    },
  });
  if (existing) throw AppError.badRequest('Already on the waitlist for this session');

  const position = await repo.getNextWaitlistPosition(dto.campaignId, dto.sessionId);
  const entry = await repo.createWaitlistEntry({
    campaignId: dto.campaignId,
    sessionId: dto.sessionId,
    ownerId: owner.id,
    petCount: dto.petCount,
    position,
  });

  return entry;
}

// ─── Lookup ──────────────────────────────────────────────────────

export async function getRegistrationByBookingNumber(bookingNumber: string) {
  const reg = await repo.getRegistrationByBookingNumber(bookingNumber);
  if (!reg) throw AppError.notFound('Registration');
  return reg;
}

export async function getRegistrationById(id: string) {
  const reg = await repo.getRegistrationById(id);
  if (!reg) throw AppError.notFound('Registration');
  return reg;
}

export async function listRegistrations(query: RegistrationListQuery) {
  return repo.listRegistrations(query);
}

export async function listWaitlist(query: WaitlistListQuery) {
  return repo.listWaitlist(query);
}

export async function removeFromWaitlist(id: string) {
  const entry = await prisma.campaignWaitlist.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound('Waitlist entry');
  if (entry.status !== WaitlistStatus.waiting) {
    throw AppError.badRequest('Waitlist entry is not in waiting status');
  }
  return repo.updateWaitlistStatus(id, WaitlistStatus.cancelled);
}

// ─── Settlement (called from payments.service.ts) ────────────────

export async function settleCampaignPayment(paymentId: string) {
  const reg = await repo.getRegistrationByPaymentId(paymentId);
  if (!reg) return;
  const settled = await repo.settleRegistration(reg.id);
  // Fire-and-forget SMS confirmation on payment
  const owner = (settled as { owner?: { mobile: string; ownerName: string; email?: string | null } })?.owner;
  const campaign = (settled as { campaign?: { title: string; id: string } })?.campaign;
  if (owner && campaign) {
    sendCampaignSms({
      to: owner.mobile,
      message: `BPA: Payment confirmed for ${campaign.title}. Booking: ${(settled as { bookingNumber: string }).bookingNumber}. See you at the campaign!`,
      campaignId: campaign.id,
    });
  }
}

export async function cancelCampaignPayment(paymentId: string) {
  const reg = await repo.getRegistrationByPaymentId(paymentId);
  if (!reg) return;
  const cancelled = await repo.cancelRegistration(reg.id);
  // Try to promote next waitlist entry
  await repo.promoteNextWaitlistEntry(reg.sessionId, cancelled.petBookings.length);
}

export async function confirmManualPayment(registrationId: string) {
  const reg = await repo.getRegistrationById(registrationId);
  if (!reg) throw AppError.notFound('Registration');
  if (reg.status !== 'pending_payment') {
    throw AppError.badRequest(`Cannot confirm payment: registration is ${reg.status}`);
  }
  return repo.settleRegistration(registrationId);
}

export async function cancelRegistration(registrationId: string) {
  const reg = await repo.getRegistrationById(registrationId);
  if (!reg) throw AppError.notFound('Registration');
  if (['cancelled', 'completed', 'certificate_issued'].includes(reg.status)) {
    throw AppError.badRequest(`Cannot cancel: registration is ${reg.status}`);
  }
  const cancelled = await repo.cancelRegistration(registrationId);
  await repo.promoteNextWaitlistEntry(reg.sessionId, cancelled.petBookings.length);
  return cancelled;
}
