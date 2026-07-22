import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { AppError } from '../../utils/AppError';
import { notifyAdmins } from '../notifications/notifications.service';
import * as repo from './donations.repository';
import {
  initializeEpsPayment, generateMerchantTxnId, isEpsMockModeEnabled,
  isDonationEPSMode, getEPSMissingCredentials,
} from '../../services/eps.service';
import { prisma } from '../../database/prisma';
import { config } from '../../config';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { getPublicSettings } from '../site-settings/site-settings.service';

// ─── Locale helpers ──────────────────────────────────────────────

export type DonationReceiptLocale = 'bn' | 'en';

export function getDonationReceiptLocale(country: string | null | undefined): DonationReceiptLocale {
  if (!country) return 'bn';
  const normalized = country.trim().toLowerCase();
  return normalized === 'bangladesh' || normalized === 'bd' ? 'bn' : 'en';
}

const BPA_SUPPORT_EMAIL = 'support@bdpetassociation.org';
const BPA_SUPPORT_PHONE = '+880 1700-000000';
const BPA_FULL_NAME = 'Bangladesh Pet Association';
const RECEIPT_POLICY =
  'This receipt confirms your donation has been received and is non-refundable unless cancelled before processing. ' +
  'BPA is a registered non-profit animal welfare organization. Your contribution is used solely for animal care, ' +
  'rescue, vaccination, and welfare programs.';

function buildGatewayUnavailableError(referenceNo: string) {
  return new AppError(
    503,
    'EPS_UNAVAILABLE',
    'Payment gateway is temporarily unavailable. Please try again later.',
    [{ donationReferenceNo: referenceNo }],
  );
}

function buildMockDonationPaymentUrl(referenceNo: string) {
  return `${config.FRONTEND_URL.replace(/\/$/, '')}/donate/thank-you?ref=${encodeURIComponent(referenceNo)}&mock=1`;
}

async function generateReferenceNo() {
  const year = new Date().getFullYear();
  const prefix = `BPA-DON-${year}-`;
  
  const lastDonation = await prisma.donation.findFirst({
    where: { referenceNo: { startsWith: prefix } },
    orderBy: { referenceNo: 'desc' },
    select: { referenceNo: true },
  });

  let nextNumber = 1;
  if (lastDonation) {
    const lastNum = parseInt(lastDonation.referenceNo.split('-').pop() || '0');
    nextNumber = lastNum + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

// ─── Public Facing Initialization ───────────────────────────────

export async function initializeDonation(params: {
  amount: number;
  currency?: string;
  purposeId?: string;
  purposeSlug?: string;
  campaignId?: string;
  campaignSlug?: string;
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  donorCountry?: string;
  donorType?: 'INDIVIDUAL' | 'ORGANIZATION' | 'ANONYMOUS';
  organizationName?: string;
  isAnonymous?: boolean;
  showOnDonorWall?: boolean;
  message?: string;
  qrSlug?: string;
  source?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (params.amount < 50) throw AppError.badRequest('Minimum donation amount is BDT 50');

  // Pre-flight: verify payment gateway is configured before touching the DB
  if (!isEpsMockModeEnabled()) {
    const missingCreds = getEPSMissingCredentials();
    if (missingCreds.length) {
      console.error('[Donations] EPS credentials missing:', missingCreds.join(', '));
      throw new AppError(
        503, 'EPS_CONFIG_MISSING',
        `Payment gateway credentials not configured. Missing env vars: ${missingCreds.join(', ')}`,
      );
    }
    if (!isDonationEPSMode()) {
      console.error('[Donations] EPS gateway not enabled for donations.');
      throw new AppError(
        503, 'EPS_NOT_ENABLED',
        'Payment gateway is not enabled for donations. ' +
        'Set PAYMENT_PROVIDER=EPS and DONATION_PAYMENT_MODE=GATEWAY ' +
        '(or EPS_ENABLED=true and PAYMENT_CHANNEL_MODE=EPS).',
      );
    }
  }

  let resolvedPurposeId = params.purposeId;
  if (params.purposeSlug && !resolvedPurposeId) {
    const p = await repo.findPurposeBySlug(params.purposeSlug);
    if (p) resolvedPurposeId = p.id;
  }

  let resolvedCampaignId = params.campaignId;
  if (params.campaignSlug && !resolvedCampaignId) {
    const c = await repo.findCampaignBySlug(params.campaignSlug);
    if (c) resolvedCampaignId = c.id;
  }

  let resolvedQrId = undefined;
  if (params.qrSlug) {
    const q = await repo.findQrCodeBySlug(params.qrSlug);
    if (q) {
      resolvedQrId = q.id;
      // Inherit purpose/campaign from QR code if not explicitly passed
      if (!resolvedPurposeId && q.purposeId) resolvedPurposeId = q.purposeId;
      if (!resolvedCampaignId && q.campaignId) resolvedCampaignId = q.campaignId;
    }
  }

  if (resolvedPurposeId) {
    const purpose = await repo.findPurposeById(resolvedPurposeId);
    if (!purpose || !purpose.isActive) throw AppError.notFound('Donation purpose not found or inactive');
  }
  if (resolvedCampaignId) {
    const campaign = await repo.findCampaignById(resolvedCampaignId);
    if (!campaign || campaign.status !== 'ACTIVE') {
      throw AppError.notFound('Donation campaign not found or not active');
    }
  }

  const merchantTxnId = generateMerchantTxnId();
  const referenceNo = await generateReferenceNo();

  const { payment, donation } = await prisma.$transaction(async (tx) => {
    const createdPayment = await tx.payment.create({
      data: {
        gateway: 'eps',
        merchantTxnId,
        amount: params.amount,
        currency: params.currency || 'BDT',
        status: 'pending',
        purpose: 'donation',
        entityType: 'donation',
      },
    });

    const createdDonation = await tx.donation.create({
      data: {
        referenceNo,
        amount: params.amount,
        currency: params.currency || 'BDT',
        status: 'pending',
        donorName: params.donorName,
        donorEmail: params.donorEmail,
        donorPhone: params.donorPhone,
        donorCountry: params.donorCountry || 'Bangladesh',
        donorType: params.donorType || 'INDIVIDUAL',
        organizationName: params.organizationName,
        isAnonymous: params.isAnonymous || false,
        showOnDonorWall: params.showOnDonorWall ?? true,
        message: params.message,
        userId: params.userId,
        purposeId: resolvedPurposeId,
        campaignId: resolvedCampaignId,
        qrCodeId: resolvedQrId,
        source: params.source,
        paymentId: createdPayment.id,
        paymentProvider: 'EPS',
      },
    });

    notifyAdmins({
      type: 'donation_new',
      title: `New Donation: BDT ${params.amount.toLocaleString()}`,
      message: `${params.isAnonymous ? 'Anonymous' : params.donorName} donated BDT ${params.amount.toLocaleString()}. Ref: ${referenceNo}`,
      module: 'donations',
      entityType: 'Donation',
      entityId: createdDonation.id,
      priority: params.amount >= 5000 ? 'high' : 'normal',
      actionUrl: `/donations/${createdDonation.id}`,
      dedupeKey: `donation:${createdDonation.id}:new`,
      createdForRole: 'admin',
    });

    return { payment: createdPayment, donation: createdDonation };
  });

  if (isEpsMockModeEnabled()) {
    await repo.updatePaymentForDonation(payment.id, {
      payload: {
        mode: 'mock',
        mockRedirectUrl: buildMockDonationPaymentUrl(referenceNo),
      },
    });

    return {
      referenceNo: donation.referenceNo,
      paymentUrl: buildMockDonationPaymentUrl(referenceNo),
      mockMode: true,
    };
  }

  try {
    const epsResult = await initializeEpsPayment({
      merchantTransactionId: merchantTxnId,
      customerOrderId: referenceNo,
      totalAmount: params.amount,
      customerName: params.donorName,
      customerEmail: params.donorEmail || 'donor@bpa.org.bd',
      customerPhone: params.donorPhone || '01700000000',
      customerAddress: params.donorCountry || 'Bangladesh',
      customerCity: 'Donation',
      customerState: 'Donation',
      customerPostcode: '1000',
      productName: 'Donation to BPA',
      referenceRef: referenceNo,
    });

    const gatewayPayload = epsResult as unknown as Record<string, unknown>;
    await repo.updatePaymentForDonation(payment.id, {
      gatewayRef:
        typeof gatewayPayload.TransactionId === 'string'
          ? gatewayPayload.TransactionId
          : typeof gatewayPayload.EPSTransactionId === 'string'
            ? gatewayPayload.EPSTransactionId
            : undefined,
      epsTxnId:
        typeof gatewayPayload.EPSTransactionId === 'string'
          ? gatewayPayload.EPSTransactionId
          : undefined,
      payload: gatewayPayload as never,
    });

    return {
      referenceNo: donation.referenceNo,
      paymentUrl: String(gatewayPayload.RedirectURL || ''),
    };
  } catch (error) {
    const epsErrMsg = error instanceof Error ? error.message : String(error);
    console.error('[Donations] EPS initializePayment failed:', { error: epsErrMsg, env: config.NODE_ENV });
    await Promise.all([
      repo.updatePaymentForDonation(payment.id, {
        status: 'failed',
        payload: {
          code: 'EPS_UNAVAILABLE',
          message: epsErrMsg,
          failedAt: new Date().toISOString(),
        },
      }),
      repo.updateDonation(donation.id, {
        status: 'pending',
      }),
    ]);

    throw buildGatewayUnavailableError(referenceNo);
  }
}

// ─── Payment Callbacks ──────────────────────────────────────────

import { sendEmail } from '../../services/email.service';

// ...

export async function settleDonationPayment(paymentId: string) {
  const donation = await repo.findDonationByPaymentId(paymentId);
  if (!donation) return;

  if (donation.status === 'success') return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

  await prisma.$transaction(async (tx) => {
    await tx.donation.update({
      where: { id: donation.id },
      data: { 
        status: 'success',
        paidAt: new Date(),
        gatewayTransactionId: payment?.epsTxnId || undefined,
      },
    });

    if (donation.campaignId) {
      await tx.donationCampaign.update({
        where: { id: donation.campaignId },
        data: { raisedAmount: { increment: donation.amount } },
      });
    }

    if (donation.qrCodeId) {
      await tx.donationQrCode.update({
        where: { id: donation.qrCodeId },
        data: {
          donationCount: { increment: 1 },
          totalRaised: { increment: donation.amount },
        },
      });
    }
  });

  const receiptUrl = `${config.FRONTEND_URL}/donation/receipt/${donation.referenceNo}`;
  const amountFmt = `${donation.currency} ${Number(donation.amount).toLocaleString()}`;

  if (donation.donorEmail) {
    void sendEmail({
      to: donation.donorEmail,
      template: 'DONATION_RECEIPT',
      data: {
        donorName: donation.isAnonymous ? 'Valued Donor' : donation.donorName,
        referenceNo: donation.referenceNo,
        amount: amountFmt,
        campaignTitle: donation.campaign?.titleEn,
        purposeTitle: donation.purpose?.titleEn,
        paidAt: donation.paidAt || donation.createdAt,
        gatewayTransactionId: donation.gatewayTransactionId,
        receiptUrl,
      },
    }).catch(console.error);
  }

  if (donation.donorPhone) {
    const donorName = donation.isAnonymous ? 'Donor' : donation.donorName.split(' ')[0];
    const { sendTransactionalSms } = await import('../../services/sms.service');
    void sendTransactionalSms({
      to: donation.donorPhone,
      message: `Dear ${donorName}, BPA received your donation of ${amountFmt}. Ref: ${donation.referenceNo}. View receipt: ${receiptUrl}. Thank you!`,
      messageType: 'donation_receipt',
      module: 'donations',
      entityType: 'Donation',
      entityId: donation.id,
      reference: donation.referenceNo,
      idempotencyKey: `donation:receipt:${donation.id}`,
    }).catch(console.error);
  }

  notifyAdmins({
    type: 'donation_payment_completed',
    title: `Donation Paid: ${amountFmt}`,
    message: `${donation.isAnonymous ? 'Anonymous' : donation.donorName} — ${amountFmt}. Ref: ${donation.referenceNo}`,
    module: 'donations',
    entityType: 'Donation',
    entityId: donation.id,
    priority: Number(donation.amount) >= 5000 ? 'high' : 'normal',
    actionUrl: `/donations/${donation.id}`,
    dedupeKey: `donation:${donation.id}:paid`,
    createdForRole: 'admin',
  });
}


export async function cancelDonationPayment(paymentId: string) {
  const donation = await repo.findDonationByPaymentId(paymentId);
  if (!donation || donation.status !== 'pending') return;
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  const status = payment?.status === 'failed' ? 'failed' : 'cancelled';
  await repo.updateDonationStatus(donation.id, status);
}

// ─── Public Helpers ─────────────────────────────────────────────

export async function getDonationStatus(referenceNo: string) {
  const donation = await repo.findDonationByReference(referenceNo);
  if (!donation) throw AppError.notFound('Donation record not found');

  return {
    referenceNo: donation.referenceNo,
    status: donation.status,
    amount: Number(donation.amount),
    currency: donation.currency,
    createdAt: donation.createdAt,
    paidAt: donation.paidAt,
    donorName: donation.isAnonymous ? 'Anonymous Kind Donor' : donation.donorName,
    donorCountry: donation.donorCountry,
    campaignTitle: donation.campaign?.titleEn || null,
    purposeTitle: donation.purpose?.titleEn || null,
  };
}

export async function getReceiptData(referenceNo: string) {
  const donation = await repo.findDonationByReference(referenceNo);
  if (!donation) throw AppError.notFound('Donation record not found');
  if (donation.status !== 'success') throw AppError.badRequest('Receipt only available for successful donations');

  const settings = await getPublicSettings().catch(() => null);
  const supportEmail = settings?.supportEmail || BPA_SUPPORT_EMAIL;
  const supportPhone = settings?.primaryPhone || settings?.supportPhone || BPA_SUPPORT_PHONE;

  const locale = getDonationReceiptLocale(donation.donorCountry);
  const isBn = locale === 'bn';
  const policy = isBn 
    ? (settings?.donationReceiptTermsBn || 'এই রসিদটি নিশ্চিত করে যে আপনার অনুদানটি গৃহীত হয়েছে এবং এটি ফেরতযোগ্য নয় (যদি না প্রক্রিয়াকরণের আগে বাতিল করা হয়)। বিপিএ একটি নিবন্ধিত অলাভজনক প্রাণী কল্যাণ সংস্থা। আপনার অবদান শুধুমাত্র প্রাণীদের সেবা, উদ্ধার, চিকিৎসা, টিকাদান এবং কল্যাণমূলক কার্যক্রমে ব্যবহার করা হবে।')
    : (settings?.donationReceiptTermsEn || settings?.receiptFooterNote || RECEIPT_POLICY);

  let frontendUrl = (process.env.PUBLIC_WEB_URL || config.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) {
    frontendUrl = 'https://bangladeshpetassociation.com';
  }
  const verifyUrl = `${frontendUrl}/donation/receipt/${donation.referenceNo}`;

  return {
    referenceNo: donation.referenceNo,
    status: donation.status,
    amount: Number(donation.amount),
    currency: donation.currency,
    createdAt: donation.createdAt,
    paidAt: donation.paidAt,
    donorName: donation.isAnonymous ? (isBn ? 'পরিচয়-গোপন দাতা' : 'Anonymous Kind Donor') : donation.donorName,
    isAnonymous: donation.isAnonymous,
    donorEmail: donation.isAnonymous ? undefined : donation.donorEmail,
    donorPhone: donation.isAnonymous ? undefined : donation.donorPhone,
    donorCountry: donation.donorCountry,
    organizationName: donation.organizationName,
    campaignTitle: isBn 
      ? (donation.campaign?.titleBn || donation.campaign?.titleEn || null)
      : (donation.campaign?.titleEn || null),
    purposeTitle: isBn 
      ? (donation.purpose?.titleBn || donation.purpose?.titleEn || null)
      : (donation.purpose?.titleEn || null),
    gatewayTransactionId: donation.gatewayTransactionId,
    paymentProvider: donation.paymentProvider,
    verifyUrl,
    supportEmail,
    supportPhone,
    policy,
  };
}

export async function getDonationPageData() {
  const [purposes, campaigns, settings, donors, stories, transparency, impactCounters, qrCodes] = await Promise.all([
    repo.listPurposes({ isActive: true }),
    repo.listCampaigns({ status: 'ACTIVE', showOnDonatePage: true }),
    repo.getDonationPageSettings(),
    repo.getDonorWall(15),
    repo.listImpactStories({ status: 'PUBLISHED', showOnDonationPage: true }),
    repo.listTransparencyReports({ status: 'PUBLISHED' }).then(res => res[0] || null),
    repo.getDonationImpactCounters(),
    repo.listQrCodes(),
  ]);

  const activeQrCodes = qrCodes.filter((qr) => qr.isActive);
  const qrSection = settings.showQrSection
    ? {
        enabled: true,
        featured: activeQrCodes[0] || null,
        items: activeQrCodes,
      }
    : {
        enabled: false,
        featured: null,
        items: [],
      };

  return {
    settings,
    purposes,
    campaigns,
    featuredCampaigns: campaigns,
    impactCounters: {
      ...impactCounters,
      goalAmount: settings.goalAmount ? Number(settings.goalAmount) : null,
    },
    donors,
    recentDonorWall: donors,
    stories,
    impactStories: stories,
    transparencySummary: transparency,
    qrSection,
  };
}

export async function handleQrRedirect(slug: string) {
  const qr = await repo.findQrCodeBySlug(slug);
  if (!qr || !qr.isActive) throw AppError.notFound('QR code not found or inactive');
  await repo.incrementQrScanCount(qr.id);
  return qr.targetUrl;
}

function absoluteLogoUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.BACKEND_URL.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function localUploadPath(url: string): string | null {
  const pathPart = /^https?:\/\//i.test(url) ? new URL(url).pathname : url;
  if (!pathPart.startsWith('/uploads/')) return null;
  return path.join(process.cwd(), 'uploads', path.basename(pathPart));
}

async function loadLogoBuffer(primaryLogoUrl?: string | null): Promise<Buffer | null> {
  if (!primaryLogoUrl) return null;
  try {
    const localPath = localUploadPath(primaryLogoUrl);
    let raw: Buffer | null = null;
    if (localPath && fs.existsSync(localPath)) {
      raw = await fs.promises.readFile(localPath);
    } else {
      const response = await fetch(absoluteLogoUrl(primaryLogoUrl));
      if (response.ok) {
        raw = Buffer.from(await response.arrayBuffer());
      }
    }
    if (!raw) return null;
    return await sharp(raw)
      .resize({ width: 200, height: 80, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('[receipt-pdf] Unable to load logo:', err);
    return null;
  }
}

export async function generateReceiptPdf(referenceNo: string, langOverride?: string): Promise<Buffer> {
  const d = await repo.findDonationByReference(referenceNo);
  if (!d || d.status !== 'success') throw AppError.badRequest('Donation not found or not paid');

  // Determine language: query override > stored country
  const locale: DonationReceiptLocale =
    langOverride === 'en' ? 'en' :
    langOverride === 'bn' ? 'bn' :
    getDonationReceiptLocale(d.donorCountry);

  const isBn = locale === 'bn';

  const settings = await getPublicSettings().catch(() => null);
  const pdfLogoUrl = settings?.secondaryLogoUrl || settings?.primaryLogoUrl || null;
  const logoBuffer = pdfLogoUrl ? await loadLogoBuffer(pdfLogoUrl) : null;
  const orgName = settings?.organizationName || BPA_FULL_NAME;
  const supportEmail = settings?.supportEmail || BPA_SUPPORT_EMAIL;
  const supportPhone = settings?.primaryPhone || settings?.supportPhone || BPA_SUPPORT_PHONE;

  // ── Translations ──
  const T = {
    orgName:        orgName,
    receiptTitle:   isBn ? 'অফিসিয়াল অনুদান রসিদ' : 'Official Donation Receipt',
    verified:       isBn ? 'পেমেন্ট যাচাইকৃত' : 'Payment Verified',
    refLabel:       isBn ? 'রেফারেন্স নম্বর' : 'REFERENCE NO',
    datePaidLabel:  isBn ? 'পেমেন্টের তারিখ' : 'DATE PAID',
    donorLabel:     isBn ? 'দাতার তথ্য' : 'DONOR',
    payDetailsLabel:isBn ? 'পেমেন্টের বিবরণ' : 'PAYMENT DETAILS',
    statusLabel:    isBn ? 'স্ট্যাটাস' : 'Status',
    statusPaid:     isBn ? 'পরিশোধিত' : 'PAID',
    methodLabel:    isBn ? 'পেমেন্ট পদ্ধতি' : 'Method',
    txnRefLabel:    isBn ? 'ট্রানজেকশন রেফ.' : 'Txn Ref',
    descHeader:     isBn ? 'বিবরণ' : 'DESCRIPTION',
    amtHeader:      isBn ? 'পরিমাণ' : 'AMOUNT',
    donationTo:     isBn ? `বাংলাদেশ পেট অ্যাসোসিয়েশনে অনুদান` : `Donation to ${orgName}`,
    campaignLabel:  isBn ? 'ক্যাম্পেইন' : 'Campaign',
    purposeLabel:   isBn ? 'উদ্দেশ্য' : 'Purpose',
    generalFund:    isBn ? 'সাধারণ তহবিল' : 'General Fund',
    totalPaid:      isBn ? 'মোট পরিশোধিত' : 'TOTAL PAID',
    scanLabel:      isBn ? 'যাচাই করতে স্ক্যান করুন' : 'Scan to Verify',
    thankYou:       isBn
      ? 'আপনার মূল্যবান অনুদানের জন্য আন্তরিক ধন্যবাদ!'
      : 'Thank you for your generous gift!',
    thankYouBody:   isBn
      ? 'আপনার এই অবদান বাংলাদেশ জুড়ে প্রাণীদের উদ্ধার, চিকিৎসা, টিকাদান, খাদ্য সহায়তা এবং কল্যাণমূলক কার্যক্রমে ব্যবহৃত হবে।'
      : 'Your contribution helps fund animal rescue, treatment, vaccination, food support, and welfare programs across Bangladesh.',
    computerGenerated: isBn
      ? 'এটি একটি কম্পিউটার-জেনারেটেড রসিদ, স্বাক্ষরের প্রয়োজন নেই।'
      : 'This is a computer-generated receipt and does not require a signature.',
    legalNote: isBn
      ? 'এই রসিদটি নিশ্চিত করে যে আপনার অনুদানটি গৃহীত হয়েছে এবং এটি ফেরতযোগ্য নয় (যদি না প্রক্রিয়াকরণের আগে বাতিল করা হয়)। বিপিএ একটি নিবন্ধিত অলাভজনক প্রাণী কল্যাণ সংস্থা। আপনার অবদান শুধুমাত্র প্রাণীদের সেবা, উদ্ধার, চিকিৎসা, টিকাদান এবং কল্যাণমূলক কার্যক্রমে ব্যবহার করা হবে।'
      : RECEIPT_POLICY,
  };

  // ── Font paths (HindSiliguri for Bangla) ──
  const FONT_REG  = isBn ? path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Regular.ttf') : 'Helvetica';
  const FONT_BOLD = isBn ? path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf')    : 'Helvetica-Bold';

  let frontendUrl = (process.env.PUBLIC_WEB_URL || config.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) {
    frontendUrl = 'https://bangladeshpetassociation.com';
  }
  const verifyUrl = `${frontendUrl}/donation/receipt/${d.referenceNo}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

  const paidAt = d.paidAt || d.createdAt;
  const dateStr = paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = paidAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const donorName = d.isAnonymous
    ? (isBn ? 'পরিচয়-গোপন দাতা' : 'Anonymous Kind Donor')
    : d.donorName;
  const amountFormatted = `${d.currency} ${Number(d.amount).toLocaleString()}`;

  const NAVY       = '#1a2540';
  const GREEN      = '#1a6b3c';
  const LIGHT_GRAY = '#f5f5f5';
  const MID_GRAY   = '#888888';
  const PAGE_W     = 595.28;
  const PAGE_H     = 841.89;
  const MARGIN     = 32;
  const CONTENT_W  = PAGE_W - MARGIN * 2;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
      info: {
        Title: `${T.receiptTitle} — ${d.referenceNo}`,
        Author: orgName,
      }
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register custom fonts
    if (isBn) {
      doc.registerFont('BPA-Reg',  FONT_REG);
      doc.registerFont('BPA-Bold', FONT_BOLD);
    }

    const fontReg  = isBn ? 'BPA-Reg'  : 'Helvetica';
    const fontBold = isBn ? 'BPA-Bold' : 'Helvetica-Bold';

    // ── Header band ──
    doc.rect(0, 0, PAGE_W, 100).fill(NAVY);

    const logoX = 32;
    const logoY = 25;
    if (logoBuffer) {
      doc.image(logoBuffer, logoX, logoY, { fit: [70, 50] });
    } else {
      doc.circle(logoX + 20, 50, 16).fill(GREEN);
      doc.fillColor('white').fontSize(16).font(fontBold).text('B', logoX + 13, 40);
    }

    const orgNameX = logoX + 85;
    doc.fillColor('white').fontSize(13).font(fontBold)
      .text(orgName, orgNameX, 32, { width: 300 });
    doc.fontSize(9.5).font(fontReg).fillColor('#b0c4de')
      .text(T.receiptTitle, orgNameX, 52, { width: 300 });

    // Status Badge
    const badgeW = 110;
    const badgeH = 22;
    const badgeX = PAGE_W - MARGIN - badgeW;
    const badgeY = 39;
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 4).fill(GREEN);
    doc.fillColor('white').fontSize(9).font(fontBold)
      .text(`✓  ${T.verified}`, badgeX, badgeY + 6, { width: badgeW, align: 'center' });

    let y = 120;

    // ── Reference + Date row ──
    doc.fillColor(MID_GRAY).fontSize(8).font(fontBold)
      .text(T.refLabel.toUpperCase(), MARGIN, y)
      .text(T.datePaidLabel.toUpperCase(), PAGE_W / 2, y);
    y += 12;
    doc.fillColor(NAVY).fontSize(11).font(fontBold).text(d.referenceNo, MARGIN, y);
    doc.fillColor(NAVY).fontSize(10).font(fontReg)
      .text(`${dateStr}  ${timeStr}`, PAGE_W / 2, y);
    y += 24;

    // ── Divider ──
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    y += 12;

    // ── Donor + Payment split ──
    doc.fillColor(MID_GRAY).fontSize(8).font(fontBold)
      .text(T.donorLabel.toUpperCase(), MARGIN, y)
      .text(T.payDetailsLabel.toUpperCase(), PAGE_W / 2 + 10, y);
    y += 12;

    const startY = y;
    doc.fillColor(NAVY).fontSize(10).font(fontBold).text(donorName, MARGIN, y);
    let donorY = y + 14;
    doc.fillColor('#333').fontSize(9).font(fontReg);
    if (!d.isAnonymous && d.organizationName) { doc.text(d.organizationName, MARGIN, donorY); donorY += 12; }
    if (!d.isAnonymous && d.donorEmail)        { doc.text(d.donorEmail, MARGIN, donorY); donorY += 12; }
    if (d.donorCountry)                         { doc.text(d.donorCountry, MARGIN, donorY); donorY += 12; }
    if (d.message) {
      const cleanedMsg = d.message.trim();
      if (cleanedMsg) {
        const truncatedMsg = cleanedMsg.length > 160 ? cleanedMsg.slice(0, 160) + '...' : cleanedMsg;
        const msgFont = isBn ? fontReg : 'Helvetica-Oblique';
        doc.fillColor('#555').fontSize(8.5).font(msgFont).text(`"${truncatedMsg}"`, MARGIN, donorY, { width: PAGE_W / 2 - 42 });
        const height = doc.heightOfString(`"${truncatedMsg}"`, { width: PAGE_W / 2 - 42 });
        donorY += height + 4;
      }
    }

    let payY = startY;
    const payLines: [string, string][] = [
      [T.statusLabel,  T.statusPaid],
      [T.methodLabel,  d.paymentProvider || 'EPS Gateway'],
      [T.txnRefLabel,  d.gatewayTransactionId || 'N/A'],
    ];
    for (const [lbl, val] of payLines) {
      doc.fillColor('#666').fontSize(8.5).font(fontBold).text(`${lbl}: `, PAGE_W / 2 + 10, payY, { continued: true });
      doc.font(fontReg).fillColor('#333').text(val);
      payY += 13;
    }

    y = Math.max(donorY, payY) + 15;

    // ── Items table ──
    doc.rect(MARGIN, y, CONTENT_W, 20).fill(NAVY);
    doc.fillColor('white').fontSize(8.5).font(fontBold)
      .text(T.descHeader, MARGIN + 8, y + 5)
      .text(T.amtHeader, PAGE_W - MARGIN - 80, y + 5, { width: 72, align: 'right' });
    y += 20;

    const itemH = 40;
    doc.rect(MARGIN, y, CONTENT_W, itemH).fill(LIGHT_GRAY);
    doc.fillColor(NAVY).fontSize(9.5).font(fontBold)
      .text(T.donationTo, MARGIN + 8, y + 6, { width: CONTENT_W - 90 });
    doc.fillColor('#555').fontSize(8).font(fontReg);
    let secondaryText = T.generalFund;
    if (d.campaign) {
      const title = isBn ? (d.campaign.titleBn || d.campaign.titleEn) : d.campaign.titleEn;
      secondaryText = `${T.campaignLabel}: ${title}`;
    } else if (d.purpose) {
      const title = isBn ? (d.purpose.titleBn || d.purpose.titleEn) : d.purpose.titleEn;
      secondaryText = `${T.purposeLabel}: ${title}`;
    }
    doc.text(secondaryText, MARGIN + 8, y + 21, { width: CONTENT_W - 90 });

    doc.fillColor(NAVY).fontSize(11).font(fontBold)
      .text(amountFormatted, PAGE_W - MARGIN - 80, y + 13, { width: 72, align: 'right' });
    y += itemH;

    // ── Total row ──
    doc.rect(MARGIN, y, CONTENT_W, 28).fill('#e8f5ee');
    doc.fillColor(GREEN).fontSize(10).font(fontBold)
      .text(T.totalPaid, MARGIN + 8, y + 8)
      .text(amountFormatted, PAGE_W - MARGIN - 80, y + 8, { width: 72, align: 'right' });
    y += 28 + 15;

    // ── QR + Thank you ──
    const QR_SIZE = 90;
    doc.image(qrBuffer, MARGIN, y, { width: QR_SIZE, height: QR_SIZE });
    doc.fillColor(MID_GRAY).fontSize(7.5).font(fontReg)
      .text(T.scanLabel, MARGIN, y + 93, { width: QR_SIZE, align: 'center' });
    doc.fillColor('#667799').fontSize(6).font(fontReg)
      .text(verifyUrl.replace(/^https?:\/\//, ''), MARGIN, y + 104, { width: QR_SIZE, align: 'center' });

    const msgX = MARGIN + QR_SIZE + 15;
    const msgW = CONTENT_W - QR_SIZE - 15;
    doc.fillColor(NAVY).fontSize(11).font(fontBold).text(T.thankYou, msgX, y + 5, { width: msgW });
    doc.fillColor('#555').fontSize(8.5).font(fontReg)
      .text(T.thankYouBody, msgX, y + 20, { width: msgW });
    y += QR_SIZE + 22;

    // ── Legal Note / Policy ──
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    y += 10;
    doc.fillColor(MID_GRAY).fontSize(8).font(fontReg)
      .text(T.legalNote, MARGIN, y, { width: CONTENT_W, align: 'justify' });

    // ── Footer ──
    const footerY = 765;
    const footerH = PAGE_H - footerY;
    doc.rect(0, footerY, PAGE_W, footerH).fill(NAVY);
    doc.fillColor('white').fontSize(8.5).font(fontBold)
      .text(orgName, MARGIN, footerY + 10, { width: CONTENT_W, align: 'center' });
    doc.fillColor('#aabbcc').fontSize(7.5).font(fontReg)
      .text(`Email: ${supportEmail}   |   Phone: ${supportPhone}`, MARGIN, footerY + 24, { width: CONTENT_W, align: 'center' })
      .text(frontendUrl.replace(/^https?:\/\//, ''), MARGIN, footerY + 36, { width: CONTENT_W, align: 'center' });
    doc.fillColor('#667799').fontSize(7)
      .text(T.computerGenerated, MARGIN, footerY + 50, { width: CONTENT_W, align: 'center' });

    doc.end();
  });
}

// ─── Admin Services ─────────────────────────────────────────────

export async function exportDonationsCsv(): Promise<string> {
  const donations = await repo.getDonationsForExport();
  const header = ['Reference No', 'Date', 'Donor Name', 'Amount', 'Currency', 'Status', 'Campaign', 'Purpose', 'Payment Gateway ID'];
  
  const rows = donations.map(d => [
    d.referenceNo,
    d.createdAt.toISOString(),
    `"${d.donorName.replace(/"/g, '""')}"`,
    d.amount.toString(),
    d.currency,
    d.status,
    `"${d.campaign?.titleEn || ''}"`,
    `"${d.purpose?.titleEn || ''}"`,
    d.gatewayTransactionId || '',
  ]);

  return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export async function generateQrImage(targetUrl: string): Promise<string> {
  return QRCode.toDataURL(targetUrl, { width: 400, margin: 2 });
}
