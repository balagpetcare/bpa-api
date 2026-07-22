import { randomUUID, createHmac } from 'crypto';
import { prisma } from '../../database/prisma';
import { config } from '../../config';
import { notifyAdmins } from '../notifications/notifications.service';
import { AppError } from '../../utils/AppError';
import { initializeEpsPayment, generateMerchantTxnId, isEPSConfigured, getEpsGatewayBase } from '../../services/eps.service';
import { createPayment, updatePaymentEpsTxnId, updatePaymentStatus } from '../payments/payments.repository';
import * as repo from './community-membership.repository';
import { getZoneById } from '../community-zones/community-zones.repository';
import type {
  InitiatePurchaseDto, UpgradeQuoteDto, UpgradeRequestDto, VerifyCardQuery,
  LookupMembershipDto, SubmitUpgradeTransactionDto, SubmitPurchaseTransactionDto,
} from './community-membership.types';

// ─── Helper: Compute current price based on offer ────────────────

export interface TierWithPrice {
  currentPrice: number;
  offerRemainingSeconds: number;
  isOfferActive: boolean;
  priceAfterOffer: string | null;
}

export async function computeTierPrice(tier: { launchPriceBdt: any; regularPriceBdt: any }): Promise<TierWithPrice> {
  const program = await repo.getOrCreateDefaultProgram();
  const now = new Date();
  let isOfferActive = false;
  let offerRemainingSeconds = 0;

  // Only offerEndAt gates offer activation. offerStartAt is informational only.
  if (program?.offerEndAt && now <= program.offerEndAt) {
    isOfferActive = true;
    offerRemainingSeconds = Math.max(0, Math.floor((program.offerEndAt.getTime() - now.getTime()) / 1000));
  }

  const launchPrice = Number(tier.launchPriceBdt);
  const regularPrice = Number(tier.regularPriceBdt);

  let currentPrice: number;
  if (isOfferActive) {
    currentPrice = launchPrice;
  } else {
    currentPrice = regularPrice;
  }

  return {
    currentPrice,
    offerRemainingSeconds,
    isOfferActive,
    priceAfterOffer: program?.priceAfterOffer ?? 'USE_REGULAR_PRICE',
  };
}

function generateQrToken(purchaseId: string, tierId: string): string {
  return createHmac('sha256', config.CARE_CARD_QR_SECRET)
    .update(`${purchaseId}:${tierId}:${Date.now()}`)
    .digest('hex');
}

// ─── Public: Get overview with all tiers, services, discounts ─────

export async function getPublicOverview() {
  const program = await repo.getOrCreateDefaultProgram();
  const tiers = await repo.listTiersPublic();
  const services = await repo.listServices(false);
  const discounts = await repo.listDiscounts(false);
  const benefits = await repo.listBenefits(false);
  const now = new Date();

  let isOfferActive = false;
  let offerRemainingSeconds = 0;
  if (program?.offerEndAt && now <= program.offerEndAt) {
    isOfferActive = true;
    offerRemainingSeconds = Math.max(0, Math.floor((program.offerEndAt.getTime() - now.getTime()) / 1000));
  }

  const tiersWithPrices = tiers.map((t) => {
    const launchPrice = Number(t.launchPriceBdt);
    const regularPrice = Number(t.regularPriceBdt);
    return {
      id: t.id,
      code: t.code,
      nameEn: t.nameEn,
      nameBn: t.nameBn,
      slug: t.slug,
      launchPriceBdt: launchPrice,
      regularPriceBdt: regularPrice,
      currentPriceBdt: isOfferActive ? launchPrice : regularPrice,
      isOfferActive,
      offerRemainingSeconds,
      petLimitMin: t.petLimitMin,
      includedPets: t.includedPets,
      petLimitMax: t.petLimitMax,
      isActive: t.isActive,
      version: t.version,
      status: t.status,
      validityMonths: t.validityMonths,
      badgeTextEn: t.badgeTextEn,
      badgeTextBn: t.badgeTextBn,
      shortDescEn: t.shortDescEn,
      shortDescBn: t.shortDescBn,
      fullDescEn: t.fullDescEn,
      fullDescBn: t.fullDescBn,
      cardTheme: t.cardTheme,
      sortOrder: t.sortOrder,
      benefits: t.benefits.map((b) => ({
        id: b.benefit.id,
        titleEn: b.benefit.titleEn,
        titleBn: b.benefit.titleBn,
        descriptionEn: b.benefit.descriptionEn,
        descriptionBn: b.benefit.descriptionBn,
        icon: b.benefit.icon,
      })),
      serviceDiscounts: t.serviceDiscounts.map((d) => ({
        serviceId: d.serviceId,
        serviceNameEn: d.service.nameEn,
        serviceNameBn: d.service.nameBn,
        discountType: d.discountType,
        discountValue: Number(d.discountValue),
        minDiscount: d.minDiscount ? Number(d.minDiscount) : null,
        maxDiscount: d.maxDiscount ? Number(d.maxDiscount) : null,
      })),
    };
  });

  return {
    program: program ? {
      nameEn: program.nameEn,
      nameBn: program.nameBn,
      descriptionEn: program.descriptionEn,
      descriptionBn: program.descriptionBn,
      offerStartAt: program.offerStartAt,
      offerEndAt: program.offerEndAt,
      priceAfterOffer: program.priceAfterOffer,
      offerBannerEn: program.offerBannerEn,
      offerBannerBn: program.offerBannerBn,
      legalDisclaimer: program.legalDisclaimer,
      cardValidityLabel: program.cardValidityLabel,
      isOfferActive,
      offerRemainingSeconds,
      paymentMode: (isEPSConfigured() && config.EPS_ENABLED === 'true' && config.PAYMENT_CHANNEL_MODE !== 'MANUAL') ? ('eps' as const) : ('manual' as const),
    } : null,
    tiers: tiersWithPrices,
    services: services.map((s) => ({
      id: s.id,
      nameEn: s.nameEn,
      nameBn: s.nameBn,
      category: s.category,
      basePriceBdt: Number(s.basePriceBdt),
      descriptionEn: s.descriptionEn,
      descriptionBn: s.descriptionBn,
    })),
    discounts: discounts.map((d) => ({
      id: d.id,
      tierId: d.tierId,
      tierName: d.tier.nameEn,
      serviceId: d.serviceId,
      serviceName: d.service.nameEn,
      discountType: d.discountType,
      discountValue: Number(d.discountValue),
      minDiscount: d.minDiscount ? Number(d.minDiscount) : null,
      maxDiscount: d.maxDiscount ? Number(d.maxDiscount) : null,
    })),
    benefits: benefits.map((b) => ({
      id: b.id,
      titleEn: b.titleEn,
      titleBn: b.titleBn,
      descriptionEn: b.descriptionEn,
      descriptionBn: b.descriptionBn,
      icon: b.icon,
      tierIds: b.tierMappings.map((m) => m.tierId),
    })),
  };
}

// ─── Public: Initiate Purchase ────────────────────────────────────

export async function initiatePurchase(dto: InitiatePurchaseDto, ipAddress?: string) {
  const tier = await repo.getTierBySlug(dto.tierSlug);
  if (!tier) throw AppError.notFound('Membership tier');
  if (!tier.isActive) throw AppError.badRequest('This membership tier is currently not available');

  const { currentPrice, isOfferActive, priceAfterOffer } = await computeTierPrice(tier);

  // If offer is expired and tier is hidden, block purchase
  if (!isOfferActive && priceAfterOffer === 'HIDE_TIER') {
    throw AppError.badRequest('This membership tier is no longer available for purchase');
  }

  // Validate preferred zone if provided
  let zone: { id: string; name: string } | null = null;
  if (dto.preferredZoneId) {
    const found = await getZoneById(dto.preferredZoneId);
    if (!found || !found.isActive || found.status !== 'active') {
      throw AppError.badRequest('Selected clinic zone is not available. Please choose another zone.');
    }
    zone = { id: found.id, name: found.name };
  }

  const amount = currentPrice;
  const merchantTxnId = generateMerchantTxnId();

  // Create pending payment
  const payment = await createPayment({
    gateway: 'eps',
    merchantTxnId,
    amount,
    currency: 'BDT',
    purpose: 'community_membership',
    payload: {
      type: 'community_membership',
      tierSlug: dto.tierSlug,
      memberName: dto.memberName,
      memberMobile: dto.memberMobile,
      memberEmail: dto.memberEmail ?? null,
      memberAddress: dto.memberAddress ?? null,
    },
  });

  // Create pending purchase
  const purchase = await repo.createPurchase({
    tier: { connect: { id: tier.id } },
    payment: { connect: { id: payment.id } },
    memberName: dto.memberName,
    memberMobile: dto.memberMobile,
    memberEmail: dto.memberEmail || null,
    memberAddress: dto.memberAddress || null,
    divisionId: dto.divisionId ?? null,
    districtId: dto.districtId ?? null,
    upazilaId: dto.upazilaId ?? null,
    unionId: dto.unionId ?? null,
    cityCorporationId: dto.cityCorporationId ?? null,
    cityZoneId: dto.cityZoneId ?? null,
    wardId: dto.wardId ?? null,
    amountBdt: amount,
    petLimit: tier.petLimitMax,
    status: 'pending_payment',
    ...(zone ? { preferredZone: { connect: { id: zone.id } } } : {}),
    notes: [
      ipAddress ? `IP: ${ipAddress}` : null,
      dto.petCount ? `Pets: ${dto.petCount}` : null,
      zone ? `Zone: ${zone.name}` : null,
    ].filter(Boolean).join(' | ') || null,
  });

  notifyAdmins({
    type: 'membership_purchase',
    title: `New Membership: ${tier.nameEn}`,
    message: `${dto.memberName} initiated ${tier.nameEn} membership (BDT ${amount}). Pending payment.`,
    module: 'community-membership',
    entityType: 'CommunityMembershipPurchase',
    entityId: purchase.id,
    priority: 'normal',
    actionUrl: `/community-membership/${purchase.id}`,
    dedupeKey: `membership:${purchase.id}:initiated`,
    createdForRole: 'admin',
  });

  // If EPS is not configured or disabled, return as pending for manual payment
  const isEps = config.EPS_ENABLED === 'true' && config.PAYMENT_CHANNEL_MODE !== 'MANUAL' && isEPSConfigured();

  if (!isEps) {
    console.warn(`[Membership] Payment gateway inactive — purchase ${purchase.id} created as pending_payment for manual settlement.`);
    return {
      // stable response shape
      purchaseReference: purchase.id,
      paymentReference: payment.id,
      paymentMode: 'manual' as const,
      redirectUrl: null,
      statusUrl: `${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/status?ref=${purchase.id}`,
      message: 'Purchase initialized for manual payment',

      // legacy fields for frontend compatibility
      purchaseId: purchase.id,
      paymentId: payment.id,
      merchantTxnId,
      amount,
      currency: 'BDT',
      tierName: tier.nameEn,
      mfs: {
        bKash: config.MFS_BKASH_NUMBER,
        nagad: config.MFS_NAGAD_NUMBER,
        rocket: config.MFS_ROCKET_NUMBER,
        accountHolder: config.MFS_ACCOUNT_HOLDER,
        instructionsEn: config.MFS_INSTRUCTIONS_EN,
        instructionsBn: config.MFS_INSTRUCTIONS_BN,
        reference: purchase.id.slice(0, 8).toUpperCase(),
      },
    };
  }

  // Initiate EPS payment — phone normalization handled inside initializeEpsPayment()
  const epsResult = await initializeEpsPayment({
    customerOrderId: purchase.id,
    merchantTransactionId: merchantTxnId,
    totalAmount: amount,
    customerName: dto.memberName,
    customerEmail: dto.memberEmail || 'no-email@bpa.org',
    customerPhone: dto.memberMobile,
    customerAddress: dto.memberAddress || 'Bangladesh',
    customerCity: 'Dhaka',
    customerState: 'Dhaka Division',
    customerPostcode: '1000',
    productName: `BPA Community Care ${tier.nameEn} Membership`,
    valueA: purchase.id,
    valueB: 'community_membership',
  });

  await updatePaymentEpsTxnId(payment.id, epsResult.TransactionId);

  // Extract redirect URL with support for multiple common casing styles
  let redirectUrl = epsResult.RedirectURL || 
                    (epsResult as any).redirectUrl || 
                    (epsResult as any).redirect_url || 
                    (epsResult as any).gatewayUrl || 
                    (epsResult as any).gateway_url || 
                    (epsResult as any).paymentUrl || 
                    (epsResult as any).payment_url || 
                    (epsResult as any).url || null;

  if (redirectUrl) {
    if (!/^https?:\/\//i.test(redirectUrl)) {
      const base = (config.EPS_BASE_URL || getEpsGatewayBase()).replace(/\/$/, '');
      redirectUrl = `${base}${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }

    // Allowed hosts validation on backend-side
    try {
      const parsedUrl = new URL(redirectUrl);
      const allowedHosts = config.EPS_ALLOWED_REDIRECT_HOSTS
        ? config.EPS_ALLOWED_REDIRECT_HOSTS.split(',').map((h) => h.trim().toLowerCase())
        : [];
      
      const host = parsedUrl.hostname.toLowerCase();
      if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
        console.error(`[EPS] Invalid redirect URL host: "${host}" (raw URL: "${redirectUrl}"). Allowed hosts: ${config.EPS_ALLOWED_REDIRECT_HOSTS}`);
        throw AppError.badRequest('Payment gateway redirect URL is invalid or not allowed', 'PAYMENT_GATEWAY_REDIRECT_INVALID');
      }
    } catch (urlErr) {
      if (urlErr instanceof AppError) throw urlErr;
      console.error(`[EPS] Error parsing or validating redirect URL: "${redirectUrl}"`, urlErr);
      throw AppError.badRequest('Payment gateway returned an invalid redirect URL', 'PAYMENT_GATEWAY_REDIRECT_INVALID');
    }
  }

  return {
    // stable response shape
    purchaseReference: purchase.id,
    paymentReference: payment.id,
    paymentMode: 'eps' as const,
    redirectUrl,
    statusUrl: `${config.FRONTEND_URL.replace(/\/$/, '')}/community-pet-care/payment/status?ref=${purchase.id}`,
    message: 'Redirecting to payment gateway',

    // legacy fields for frontend compatibility
    purchaseId: purchase.id,
    paymentId: payment.id,
    merchantTxnId,
    amount,
    currency: 'BDT',
    tierName: tier.nameEn,
  };
}

// ─── Payment Callback Handler ─────────────────────────────────────

export async function handlePaymentSuccess(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) throw AppError.notFound('Payment');

  // Handle community membership purchase
  const purchase = await repo.getPurchaseByPaymentId(paymentId);
  if (purchase && purchase.status === 'pending_payment') {
    const tier = await repo.getTierById(purchase.tierId);
    if (!tier) throw AppError.notFound('Tier');

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + tier.validityMonths);

    // Generate card
    const cardNumber = await repo.generateCardNumber();
    const qrToken = generateQrToken(purchase.id, purchase.tierId);
    const downloadToken = randomUUID();

    await prisma.$transaction(async (tx) => {
      // Update purchase
      await tx.communityMembershipPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'paid',
          startsAt: now,
          expiresAt,
          purchasedAt: now,
          petLimit: tier.petLimitMax,
        },
      });

      // Create card
      await tx.communityMembershipCard.create({
        data: {
          purchaseId: purchase.id,
          cardNumber,
          qrToken,
          status: 'active',
          issuedAt: now,
          expiresAt,
          downloadToken,
        },
      });
    });

    // Generate PDF (fire and forget - non-blocking)
    try {
      const { generateMembershipPdf } = await import('./community-membership-pdf.service');
      const pdfResult = await generateMembershipPdf(purchase.id);
      if (pdfResult) {
        await repo.updateCard(
          (await repo.getCardByPurchaseId(purchase.id))!.id,
          { pdfDocumentKey: pdfResult.objectKey },
        );
      }
    } catch (err) {
      console.error('[Membership] PDF generation failed:', err);
    }

    // SMS notification (idempotent, fire and forget)
    void sendMembershipActivationSms(purchase.id);

    return { purchaseId: purchase.id, cardNumber, qrToken };
  }

  // Handle upgrade payment
  const upgrade = await repo.getUpgradeByPaymentId(paymentId);
  if (upgrade && upgrade.status === 'pending_payment') {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Mark upgrade as paid then completed
      await tx.communityMembershipUpgrade.update({
        where: { id: upgrade.id },
        data: { status: 'paid' },
      });

      // Update the purchase with new tier and recalculated pet limit + dates
      const toTier = await tx.communityMembershipTier.findUnique({ where: { id: upgrade.toTierId } });
      if (toTier) {
        const currentPurchase = await tx.communityMembershipPurchase.findUnique({ where: { id: upgrade.purchaseId } });
        if (currentPurchase) {
          const newExpiry = currentPurchase.expiresAt
            ? new Date(currentPurchase.expiresAt)
            : new Date(now);
          newExpiry.setMonth(newExpiry.getMonth() + toTier.validityMonths);

          await tx.communityMembershipPurchase.update({
            where: { id: upgrade.purchaseId },
            data: {
              tier: { connect: { id: upgrade.toTierId } },
              petLimit: toTier.petLimitMax,
              expiresAt: newExpiry,
            },
          });
        }
      }

      await tx.communityMembershipUpgrade.update({
        where: { id: upgrade.id },
        data: { status: 'completed', completedAt: now },
      });

      // Regenerate card PDF
      const card = await tx.communityMembershipCard.findUnique({ where: { purchaseId: upgrade.purchaseId } });
      if (card) {
        const newDownloadToken = randomUUID();
        await tx.communityMembershipCard.update({
          where: { id: card.id },
          data: { downloadToken: newDownloadToken },
        });
      }
    });

    // Regenerate PDF
    try {
      const { generateMembershipPdf } = await import('./community-membership-pdf.service');
      await generateMembershipPdf(upgrade.purchaseId);
    } catch (err) {
      console.error('[Membership] Upgrade PDF regeneration failed:', err);
    }

    return { upgradeId: upgrade.id };
  }

  return null;
}

// ─── Card Verification ───────────────────────────────────────────

export async function verifyCard(query: VerifyCardQuery, ipAddress?: string, userAgent?: string) {
  const card = await repo.getCardByQrToken(query.token);

  if (!card) {
    return {
      valid: false,
      cardNumber: null,
      status: 'not_found',
      memberName: null,
      tierName: null,
      tierNameBn: null,
      petLimit: null,
      issuedAt: null,
      expiresAt: null,
    };
  }

  const now = new Date();
  const isExpired = card.expiresAt ? new Date(card.expiresAt) < now : false;
  const valid = card.status === 'active' && !isExpired;
  const scanResult = isExpired ? 'expired' : card.status;

  // Mask member name for public verification
  const rawName = card.purchase.memberName;
  const maskedName = rawName.length > 2
    ? rawName[0] + '*'.repeat(rawName.length - 2) + rawName[rawName.length - 1]
    : rawName;

  await repo.logCardVerification({
    cardId: card.id,
    qrToken: query.token,
    scanResult,
    ipAddress,
    userAgent,
  });

  return {
    valid,
    cardNumber: card.cardNumber,
    status: isExpired ? 'expired' : card.status,
    memberName: maskedName,
    tierName: card.purchase.tier.nameEn,
    tierNameBn: card.purchase.tier.nameBn,
    petLimit: card.purchase.petLimit,
    issuedAt: card.issuedAt,
    expiresAt: card.expiresAt,
  };
}

// ─── Membership Lookup (for upgrade flow) ────────────────────────

function maskName(name: string): string {
  return name.length > 2
    ? name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
    : name;
}

function buildLookupResult(card: NonNullable<Awaited<ReturnType<typeof repo.getCardByQrToken>>>) {
  const now = new Date();
  const isExpired = card.expiresAt ? new Date(card.expiresAt) < now : false;
  return {
    purchaseId: card.purchase.id,
    cardNumber: card.cardNumber,
    cardStatus: isExpired ? 'expired' : card.status,
    memberName: maskName(card.purchase.memberName),
    tierName: card.purchase.tier.nameEn,
    tierNameBn: card.purchase.tier.nameBn,
    tierSlug: card.purchase.tier.slug,
    amountBdt: Number(card.purchase.amountBdt),
    petLimit: card.purchase.petLimit,
    startsAt: card.purchase.startsAt,
    expiresAt: card.expiresAt,
    purchasedAt: card.purchase.purchasedAt,
  };
}

// Generic error used for all lookup failures — does not reveal whether a card number exists
const LOOKUP_NOT_FOUND = AppError.badRequest('No matching membership found. Check your card number and mobile, then try again.');

export async function lookupMembership(dto: LookupMembershipDto) {
  let card: Awaited<ReturnType<typeof repo.getCardByQrToken>> | null = null;

  if ('token' in dto) {
    card = await repo.getCardByQrToken(dto.token);
    if (!card) throw AppError.badRequest('Membership card not found for this token. Please use card number and mobile instead.');
  } else {
    card = await repo.getCardByCardNumberAndMobile(dto.cardNumber, dto.mobile);
    // Always return the same message — do not reveal whether the card number itself exists
    if (!card) throw LOOKUP_NOT_FOUND;
  }

  return buildLookupResult(card);
}

// ─── Upgrade: Submit Manual Transaction ──────────────────────────

export async function submitUpgradeTransaction(dto: SubmitUpgradeTransactionDto) {
  const upgrade = await prisma.communityMembershipUpgrade.findUnique({
    where: { id: dto.upgradeId },
    include: { payment: true },
  });
  if (!upgrade) throw AppError.notFound('Upgrade request');
  if (upgrade.status !== 'pending_payment') throw AppError.badRequest('Upgrade is not pending payment');

  if (upgrade.payment) {
    const payload = (upgrade.payment.payload as Record<string, unknown>) ?? {};
    // Prevent duplicate transaction submission
    if (payload['manualTransaction']) {
      throw AppError.badRequest('A transaction has already been submitted for this upgrade. Please wait for admin review.');
    }
    payload['manualTransaction'] = { provider: dto.provider, transactionId: dto.transactionId, submittedAt: new Date().toISOString() };
    await prisma.payment.update({ where: { id: upgrade.payment.id }, data: { payload: payload as any } });
  }

  await prisma.communityMembershipUpgrade.update({
    where: { id: upgrade.id },
    data: { notes: `${upgrade.notes ?? ''}\nTransaction submitted: ${dto.provider} ${dto.transactionId}` },
  });

  return { submitted: true, message: 'Upgrade payment submitted. Your membership will be upgraded after verification.' };
}

export async function submitPurchaseTransaction(dto: SubmitPurchaseTransactionDto) {
  const purchase = await repo.getPurchaseById(dto.purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');
  if (purchase.status !== 'pending_payment') throw AppError.badRequest('Purchase is not pending payment');

  if (purchase.payment) {
    const payload = (purchase.payment.payload as Record<string, unknown>) ?? {};
    // Prevent duplicate transaction submission
    if (payload['manualTransaction']) {
      throw AppError.badRequest('A transaction has already been submitted for this purchase. Please wait for admin review.');
    }
    payload['manualTransaction'] = { provider: dto.provider, transactionId: dto.transactionId, submittedAt: new Date().toISOString() };
    await prisma.payment.update({ where: { id: purchase.payment.id }, data: { payload: payload as any } });
  }

  await repo.updatePurchase(dto.purchaseId, {
    notes: `${purchase.notes ?? ''}\nTransaction submitted: ${dto.provider} ${dto.transactionId}`,
  });

  return { submitted: true, message: 'Payment submitted. Your card will be activated after verification.' };
}

// ─── Upgrade: Quote ──────────────────────────────────────────────

export async function getUpgradeQuote(dto: UpgradeQuoteDto) {
  const purchase = await repo.getPurchaseById(dto.purchaseId);
  if (!purchase) throw AppError.notFound('Membership purchase');
  if (purchase.status !== 'paid') throw AppError.badRequest('Membership is not active');

  // Check for active card
  const card = await repo.getCardByPurchaseId(purchase.id);
  if (!card || card.status !== 'active') throw AppError.badRequest('Membership card is not active');
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) throw AppError.badRequest('Membership has expired');

  const toTier = await repo.getTierBySlug(dto.toTierSlug);
  if (!toTier) throw AppError.notFound('Target tier');
  if (!toTier.isActive) throw AppError.badRequest('Target tier is not available');

  // Prevent same tier or downgrade
  if (purchase.tierId === toTier.id) throw AppError.badRequest('You are already on this tier');
  const { currentPrice: targetPrice } = await computeTierPrice(toTier);
  const originalPaid = Number(purchase.amountBdt);

  // Calculate upgrade amount: target current price - what they paid
  const upgradeAmount = Math.max(0, targetPrice - originalPaid);
  if (upgradeAmount <= 0) throw AppError.badRequest('Your current tier value equals or exceeds the target tier. No upgrade needed.');

  // Check for duplicate pending upgrade
  const existing = await repo.getUpgradeByPurchaseAndTier(purchase.id, toTier.id);
  if (existing) throw AppError.badRequest('An upgrade request is already pending for this membership');

  return {
    purchaseId: purchase.id,
    currentTier: { name: purchase.tier.nameEn },
    targetTier: { name: toTier.nameEn, slug: toTier.slug },
    originalPaidAmount: originalPaid,
    targetCurrentPrice: targetPrice,
    upgradeAmount,
    currency: 'BDT',
  };
}

// ─── Upgrade: Request (initiate payment) ──────────────────────────

export async function requestUpgrade(dto: UpgradeRequestDto, ipAddress?: string) {
  const quote = await getUpgradeQuote(dto);
  const toTier = await repo.getTierBySlug(dto.toTierSlug);
  if (!toTier) throw AppError.notFound('Target tier');

  const amount = quote.upgradeAmount;
  const merchantTxnId = generateMerchantTxnId();
  const purchase = await repo.getPurchaseById(dto.purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');

  if (!isEPSConfigured()) {
    // Manual mode — create upgrade as pending_payment
    const payment = await createPayment({
      gateway: 'eps',
      merchantTxnId,
      amount,
      currency: 'BDT',
      purpose: 'community_membership_upgrade',
      payload: {
        type: 'community_membership_upgrade',
        purchaseId: dto.purchaseId,
        fromTierId: purchase.tierId,
        toTierId: toTier.id,
      },
    });

    const upgrade = await repo.createUpgrade({
      purchase: { connect: { id: purchase.id } },
      fromTier: { connect: { id: purchase.tierId } },
      toTier: { connect: { id: toTier.id } },
      payment: { connect: { id: payment.id } },
      upgradeAmountBdt: amount,
      originalPaidAmount: quote.originalPaidAmount,
      status: 'pending_payment',
      notes: ipAddress ? `IP: ${ipAddress} (manual)` : 'Manual payment',
    });

    return {
      upgradeId: upgrade.id,
      paymentId: payment.id,
      merchantTxnId,
      redirectUrl: null,
      amount,
      currency: 'BDT',
      paymentMode: 'manual',
      mfs: {
        bKash: config.MFS_BKASH_NUMBER,
        nagad: config.MFS_NAGAD_NUMBER,
        rocket: config.MFS_ROCKET_NUMBER,
        accountHolder: config.MFS_ACCOUNT_HOLDER,
        instructionsEn: config.MFS_INSTRUCTIONS_EN,
        instructionsBn: config.MFS_INSTRUCTIONS_BN,
        reference: upgrade.id.slice(0, 8).toUpperCase(),
      },
    };
  }

  // No duplicate declarations needed below — already declared above
  // EPS path
  const payment = await createPayment({
    gateway: 'eps',
    merchantTxnId,
    amount,
    currency: 'BDT',
    purpose: 'community_membership_upgrade',
    payload: {
      type: 'community_membership_upgrade',
      purchaseId: dto.purchaseId,
      fromTierId: purchase.tierId,
      toTierId: toTier.id,
    },
  });

  // Create upgrade record
  const upgrade = await repo.createUpgrade({
    purchase: { connect: { id: purchase.id } },
    fromTier: { connect: { id: purchase.tierId } },
    toTier: { connect: { id: toTier.id } },
    payment: { connect: { id: payment.id } },
    upgradeAmountBdt: amount,
    originalPaidAmount: quote.originalPaidAmount,
    status: 'pending_payment',
    notes: ipAddress ? `IP: ${ipAddress}` : null,
  });

  // Initiate EPS
  const epsResult = await initializeEpsPayment({
    customerOrderId: upgrade.id,
    merchantTransactionId: merchantTxnId,
    totalAmount: amount,
    customerName: purchase.memberName,
    customerEmail: purchase.memberEmail || 'no-email@bpa.org',
    customerPhone: purchase.memberMobile,
    customerAddress: 'Bangladesh',
    customerCity: 'Dhaka',
    customerState: 'Dhaka Division',
    customerPostcode: '1000',
    productName: `BPA Community Care Membership Upgrade`,
    valueA: upgrade.id,
    valueB: 'community_membership_upgrade',
  });

  await updatePaymentEpsTxnId(payment.id, epsResult.TransactionId);

  return {
    upgradeId: upgrade.id,
    paymentId: payment.id,
    merchantTxnId,
    redirectUrl: epsResult.RedirectURL,
    amount,
    currency: 'BDT',
  };
}

// ─── Admin: Regenerate Card PDF ─────────────────────────────────

export async function regenerateCardPdf(purchaseId: string) {
  const purchase = await repo.getPurchaseById(purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');
  if (!purchase.card) throw AppError.badRequest('No card issued for this purchase');

  const { generateMembershipPdf } = await import('./community-membership-pdf.service');
  const pdfResult = await generateMembershipPdf(purchaseId);
  if (pdfResult) {
    // Regenerate download token
    const newToken = randomUUID();
    await repo.updateCard(purchase.card.id, {
      pdfDocumentKey: pdfResult.objectKey,
      downloadToken: newToken,
    });
    return { pdfUrl: pdfResult.url, downloadToken: newToken };
  }
  return null;
}

// ─── Admin: Update Purchase Status ───────────────────────────────

export async function adminUpdatePurchaseStatus(purchaseId: string, status: string) {
  const purchase = await repo.getPurchaseById(purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');

  return repo.updatePurchase(purchaseId, { status: status as any });
}

// ─── Admin: Settle Purchase (manual payment verification) ────────

export async function adminSettlePurchase(purchaseId: string, adminNote?: string) {
  const purchase = await repo.getPurchaseById(purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');
  if (purchase.status !== 'pending_payment') throw AppError.badRequest('Purchase is not in pending_payment status');

  const tier = await repo.getTierById(purchase.tierId);
  if (!tier) throw AppError.notFound('Tier');

  // Check if card already exists
  const existingCard = await repo.getCardByPurchaseId(purchase.id);
  if (existingCard) throw AppError.badRequest('Card already exists for this purchase');

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + tier.validityMonths);

  const cardNumber = await repo.generateCardNumber();
  const qrToken = generateQrToken(purchase.id, purchase.tierId);
  const downloadToken = randomUUID();

  // Also mark the linked payment as success
  if (purchase.payment) {
    await updatePaymentStatus(purchase.payment.id, 'success');
  }

  await prisma.$transaction(async (tx) => {
    await tx.communityMembershipPurchase.update({
      where: { id: purchase.id },
      data: {
        status: 'paid',
        startsAt: now,
        expiresAt,
        purchasedAt: now,
        petLimit: tier.petLimitMax,
        notes: adminNote ? `${purchase.notes ?? ''}\nAdmin settle: ${adminNote}` : purchase.notes,
      },
    });

    await tx.communityMembershipCard.create({
      data: {
        purchaseId: purchase.id,
        cardNumber,
        qrToken,
        status: 'active',
        issuedAt: now,
        expiresAt,
        downloadToken,
      },
    });
  });

  // Generate PDF (best-effort)
  let pdfGenerated = false;
  try {
    const { generateMembershipPdf } = await import('./community-membership-pdf.service');
    const pdfResult = await generateMembershipPdf(purchase.id);
    if (pdfResult) {
      const card = await repo.getCardByPurchaseId(purchase.id);
      if (card) {
        await repo.updateCard(card.id, { pdfDocumentKey: pdfResult.objectKey });
      }
      pdfGenerated = true;
    }
  } catch (err) {
    console.error('[Membership] PDF generation failed (non-blocking):', err);
  }

  // SMS notification (idempotent, fire and forget)
  void sendMembershipActivationSms(purchase.id);

  // Audit log
  try {
    await prisma.auditLog.create({
      data: {
        action: 'update',
        resource: 'community_membership_purchases',
        resourceId: purchase.id,
        newValues: { status: 'paid', cardNumber, settledBy: 'admin' } as any,
        ipAddress: 'admin',
      },
    });
  } catch { /* noop */ }

  return {
    purchaseId: purchase.id,
    cardNumber,
    qrToken,
    downloadToken,
    pdfGenerated,
    status: 'paid',
  };
}

// ─── Admin: Reject Purchase ─────────────────────────────────────

export async function adminRejectPurchase(purchaseId: string, reason?: string) {
  const purchase = await repo.getPurchaseById(purchaseId);
  if (!purchase) throw AppError.notFound('Purchase');
  if (purchase.status !== 'pending_payment') throw AppError.badRequest('Purchase is not pending');

  const result = await repo.updatePurchase(purchaseId, {
    status: 'cancelled',
    notes: reason ? `${purchase.notes ?? ''}\nRejected: ${reason}` : purchase.notes,
  });

  // SMS notification for rejection (best-effort)
  try {
    const { sendSms } = await import('../../services/sms.service');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const supportPhone = settings?.supportPhone || '01575008300';
    void sendSms({
      to: purchase.memberMobile,
      message: `BPA: আপনার পেমেন্ট যাচাই সম্পন্ন হয়নি। রেফারেন্স: ${purchase.id}. অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন: ${supportPhone}`,
    });
  } catch { /* noop */ }

  return result;
}

// ─── Admin: Settle Upgrade ──────────────────────────────────────

export async function adminSettleUpgrade(upgradeId: string, adminNote?: string) {
  const upgrade = await repo.getUpgradeById(upgradeId);
  if (!upgrade) throw AppError.notFound('Upgrade request');
  if (upgrade.status !== 'pending_payment') throw AppError.badRequest('Upgrade is not pending_payment');

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark upgrade as paid then completed
    await tx.communityMembershipUpgrade.update({
      where: { id: upgrade.id },
      data: { status: 'paid' },
    });

    // Update the purchase with new tier
    if (upgrade.toTier) {
      const currentPurchase = await tx.communityMembershipPurchase.findUnique({ where: { id: upgrade.purchaseId } });
      if (currentPurchase) {
        const newExpiry = currentPurchase.expiresAt
          ? new Date(currentPurchase.expiresAt)
          : new Date(now);
        newExpiry.setMonth(newExpiry.getMonth() + upgrade.toTier.validityMonths);

        await tx.communityMembershipPurchase.update({
          where: { id: upgrade.purchaseId },
          data: {
            tier: { connect: { id: upgrade.toTierId } },
            petLimit: upgrade.toTier.petLimitMax,
            expiresAt: newExpiry,
            notes: adminNote ? `${currentPurchase.notes ?? ''}\nUpgrade settle: ${adminNote}` : currentPurchase.notes,
          },
        });
      }
    }

    await tx.communityMembershipUpgrade.update({
      where: { id: upgrade.id },
      data: { status: 'completed', completedAt: now },
    });

    // Regenerate card download token
    const card = await tx.communityMembershipCard.findUnique({ where: { purchaseId: upgrade.purchaseId } });
    if (card) {
      await tx.communityMembershipCard.update({
        where: { id: card.id },
        data: { downloadToken: randomUUID() },
      });
    }

    // Mark linked payment as success
    if (upgrade.paymentId) {
      await tx.payment.update({
        where: { id: upgrade.paymentId },
        data: { status: 'success' },
      });
    }
  });

  // Regenerate PDF (best-effort)
  try {
    const { generateMembershipPdf } = await import('./community-membership-pdf.service');
    await generateMembershipPdf(upgrade.purchaseId);
  } catch (err) {
    console.error('[Membership] Upgrade PDF regeneration failed:', err);
  }

  // Audit log
  try {
    await prisma.auditLog.create({
      data: {
        action: 'update',
        resource: 'community_membership_upgrades',
        resourceId: upgrade.id,
        newValues: { status: 'completed', settledBy: 'admin' } as any,
        ipAddress: 'admin',
      },
    });
  } catch { /* noop */ }

  return { upgradeId: upgrade.id, status: 'completed' };
}

export async function getMembershipStatus(reference: string) {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  
  const purchase = await prisma.communityMembershipPurchase.findFirst({
    where: {
      OR: [
        ...(isUuid(reference) ? [{ id: reference }] : []),
        { payment: { merchantTxnId: reference } },
        { payment: { gatewayRef: reference } },
        { payment: { epsTxnId: reference } },
      ]
    },
    include: {
      tier: true,
      payment: true,
      card: true,
      preferredZone: true,
    }
  });

  if (!purchase) {
    throw AppError.notFound('Membership purchase');
  }

  const maskPhone = (phone: string) => {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
  };
  
  const maskEmail = (email: string) => {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [local, domain] = parts;
    if (local.length <= 2) return `*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  };

  const hasCard = !!purchase.card;
  const baseUrl = config.BACKEND_URL.replace(/\/$/, '');
  const frontendUrl = config.FRONTEND_URL.replace(/\/$/, '');

  const regularPrice = Number(purchase.tier.regularPriceBdt);
  const launchPrice = purchase.tier.launchPriceBdt ? Number(purchase.tier.launchPriceBdt) : null;

  // SMS status check
  const smsLog = await prisma.smsLog.findFirst({
    where: {
      to: purchase.memberMobile,
      OR: [
        { body: { contains: purchase.id } },
        ...(purchase.card ? [{ body: { contains: purchase.card.cardNumber } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  let smsStatus = 'not_sent';
  if (smsLog) {
    if (smsLog.status === 'sent' || smsLog.status === 'delivered') {
      smsStatus = 'sent';
    } else if (smsLog.status === 'queued') {
      smsStatus = 'queued';
    } else if (smsLog.status === 'failed' || smsLog.status === 'undelivered') {
      smsStatus = 'failed';
    }
  }
  const smsSentAt = smsLog?.sentAt ? smsLog.sentAt.toISOString() : null;

  // Site settings for support contact
  const settings = await prisma.siteSettings.findUnique({
    where: { id: 'default' },
  });
  const supportPhone = settings?.supportPhone || '01575008300';
  const supportEmail = settings?.supportEmail || 'info@bangladeshpetassociation.com';

  return {
    reference: purchase.id,
    status: purchase.status,
    paymentStatus: purchase.payment?.status ?? 'pending',
    cardIssued: hasCard,
    tierName: purchase.tier.nameEn,
    tierNameBn: purchase.tier.nameBn,
    amount: Number(purchase.amountBdt),
    regularPrice,
    launchPrice,
    currency: purchase.currency,
    fullName: purchase.memberName,
    mobileMasked: maskPhone(purchase.memberMobile),
    emailMasked: purchase.memberEmail ? maskEmail(purchase.memberEmail) : null,
    preferredZone: purchase.preferredZone?.name ?? null,
    numberOfPets: purchase.petLimit,
    validFrom: purchase.startsAt ? purchase.startsAt.toISOString() : null,
    validUntil: purchase.expiresAt ? purchase.expiresAt.toISOString() : null,
    cardNumber: purchase.card?.cardNumber ?? null,
    verificationUrl: purchase.card?.qrToken ? `${frontendUrl}/verify/membership-card/${purchase.card.qrToken}` : null,
    receiptPdfUrl: `${baseUrl}/api/v1/public/memberships/${purchase.id}/receipt.pdf`,
    cardPdfUrl: purchase.card ? `${baseUrl}/api/v1/public/memberships/${purchase.id}/card.pdf` : null,
    guidePdfUrl: purchase.status === 'paid' ? `${baseUrl}/api/v1/public/memberships/${purchase.id}/guide.pdf` : null,
    welcomePackPdfUrl: purchase.card ? `${baseUrl}/api/v1/public/memberships/${purchase.id}/welcome-pack.pdf` : null,
    smsStatus,
    smsSentAt,
    supportPhone,
    supportEmail,
  };
}

export async function sendMembershipActivationSms(purchaseId: string) {
  try {
    const purchase = await prisma.communityMembershipPurchase.findUnique({
      where: { id: purchaseId },
      include: { card: true, tier: true }
    });
    if (!purchase || purchase.status !== 'paid' || !purchase.card) {
      return;
    }

    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const supportPhone = settings?.supportPhone || '01575008300';
    const frontendUrl = config.FRONTEND_URL.replace(/\/$/, '');
    const downloadUrl = `${frontendUrl}/community-pet-care/payment/status?ref=${purchase.id}`;

    const message = `BPA: আপনার Community Care Partner Card সক্রিয় হয়েছে। কার্ড নং: ${purchase.card.cardNumber}. ডাউনলোড: ${downloadUrl}. সহায়তা: ${supportPhone}`;

    const { sendTransactionalSms } = await import('../../services/sms.service');
    await sendTransactionalSms({
      to: purchase.memberMobile,
      message,
      messageType: 'membership_activation',
      module: 'community_membership',
      entityType: 'CommunityMembershipPurchase',
      entityId: purchase.id,
      reference: (purchase as any).purchaseReference ?? purchase.id,
      idempotencyKey: `membership:activated:${purchase.id}`,
    });
  } catch (err) {
    console.error('[Membership SMS] Error sending activation SMS:', err);
  }
}
