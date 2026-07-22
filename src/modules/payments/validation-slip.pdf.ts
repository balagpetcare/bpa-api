import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import type { Response } from 'express';
import { config } from '../../config';
import { getPublicSettings } from '../site-settings/site-settings.service';

type Numeric = number | string | { toString(): string };

export type ValidationSlipData = {
  bookingNumber: string;
  totalAmountBdt: Numeric;
  status: string;
  createdAt: Date;
  campaign: { title: string } | null;
  session: {
    sessionDate: string | Date;
    startTime: string;
    endTime: string;
    venue: { name: string; address?: string | null } | null;
  } | null;
  owner: { ownerName: string; mobile: string; email: string | null } | null;
  payment: {
    status: string;
    amount: Numeric;
    merchantTxnId?: string | null;
    epsTxnId?: string | null;
    createdAt?: Date | null;
  } | null;
  petBookings: Array<{ id: string }>;
};

type StatusConfig = {
  label: 'PAID' | 'PAYMENT UNDER REVIEW' | 'PAY AT CENTER' | 'FAILED / CANCELLED';
  color: string;
  bg: string;
  border: string;
  isPaid: boolean;
};

type FontNames = {
  regular: string;
  bold: string;
};

const WEBSITE = 'https://bangladeshpetassociation.com/';
const SUPPORT_EMAIL = 'bangladeshpetassociation@gmail.com';
const SUPPORT_PHONES = '01575008300, 01701022278';
const OFFICE_ADDRESS = '364 DIT Road, East Rampura, Dhaka 1219';
const FACEBOOK = 'https://www.facebook.com/BangladeshPetAssociation/';
const YOUTUBE = 'https://www.youtube.com/@BangladeshPetAssociation-s7k';

const FONT_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Regular.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Bold.ttf');
const HIND_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Regular.ttf');
const HIND_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf');

function resolveStatus(reg: ValidationSlipData, amount: number): StatusConfig {
  const ps = reg.payment?.status?.toLowerCase() ?? '';
  const rs = reg.status?.toLowerCase() ?? '';

  if (
    amount === 0 ||
    ps === 'success' ||
    rs === 'paid' ||
    rs === 'checked_in' ||
    rs === 'vaccinated' ||
    rs === 'certificate_issued' ||
    rs === 'completed'
  ) {
    return { label: 'PAID', color: '#166534', bg: '#dcfce7', border: '#86efac', isPaid: true };
  }

  if (ps === 'pending_review') {
    return {
      label: 'PAYMENT UNDER REVIEW',
      color: '#92400e',
      bg: '#fef3c7',
      border: '#fcd34d',
      isPaid: false,
    };
  }

  if (ps === 'cancelled' || ps === 'failed' || rs === 'cancelled') {
    return { label: 'FAILED / CANCELLED', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', isPaid: false };
  }

  return { label: 'PAY AT CENTER', color: '#075985', bg: '#e0f2fe', border: '#7dd3fc', isPaid: false };
}

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return 'N/A';
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmt12(t: string): string {
  if (!t) return 'N/A';
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function money(amount: number): string {
  return amount === 0 ? 'Free' : `BDT ${amount.toLocaleString('en-BD')} /-`;
}

function registerFonts(doc: PDFKit.PDFDocument): FontNames {
  const candidates = [
    {
      label: 'Hind Siliguri',
      regularName: 'BPA-HindSiliguri',
      boldName: 'BPA-HindSiliguri-Bold',
      regularPath: HIND_REGULAR_PATH,
      boldPath: HIND_BOLD_PATH,
    },
    {
      label: 'Noto Sans Bengali',
      regularName: 'BPA-NotoSansBengali',
      boldName: 'BPA-NotoSansBengali-Bold',
      regularPath: FONT_REGULAR_PATH,
      boldPath: FONT_BOLD_PATH,
    },
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.regularPath) || !fs.existsSync(candidate.boldPath)) continue;

    try {
      doc.registerFont(candidate.regularName, candidate.regularPath);
      doc.registerFont(candidate.boldName, candidate.boldPath);
      doc.font(candidate.regularName).fontSize(8).heightOfString('বাংলা টেক্সট পরীক্ষা', { width: 120 });
      return { regular: candidate.regularName, bold: candidate.boldName };
    } catch (err) {
      console.warn(
        `[validation-slip] ${candidate.label} failed PDFKit preflight:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.error('[validation-slip] No usable Bangla font found in assets/fonts.');
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
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
      if (!response.ok) return null;
      raw = Buffer.from(await response.arrayBuffer());
    }

    return await sharp(raw)
      .resize({ width: 260, height: 110, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('[validation-slip] Unable to load primary logo:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function loadBranding() {
  const settings = await getPublicSettings().catch(() => null);
  return {
    siteName: settings?.organizationName || settings?.siteName || 'Bangladesh Pet Association',
    logo: await loadLogoBuffer(settings?.primaryLogoUrl),
  };
}

export async function streamValidationSlipPdf(reg: ValidationSlipData, res: Response): Promise<void> {
  const amount = Number(String(reg.payment?.amount ?? reg.totalAmountBdt ?? 0));
  const status = resolveStatus(reg, amount);
  const branding = await loadBranding();
  const frontendBase = config.FRONTEND_URL.replace(/\/$/, '');
  const verifyUrl = `${frontendBase}/payment/status?bookingRef=${encodeURIComponent(reg.bookingNumber)}`;

  let qrBuffer: Buffer | null = null;
  try {
    const qrDataUri = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 156,
      color: { dark: '#0f2d59', light: '#ffffff' },
    });
    qrBuffer = Buffer.from(qrDataUri.split(',')[1]!, 'base64');
  } catch {
    qrBuffer = null;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 38, bufferPages: false, autoFirstPage: true });
  doc.pipe(res);

  const fonts = registerFonts(doc);
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = 38;
  const right = pageW - 38;
  const width = right - left;
  const bottom = pageH - 58;

  function topBar(): void {
    doc.rect(0, 0, pageW, 7).fill('#16a34a');
  }

  function ensureSpace(height: number): void {
    if (doc.y + height <= bottom) return;
    doc.addPage();
    topBar();
    doc.y = 34;
  }

  function text(
    value: string,
    x: number,
    y: number,
    options: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number; color?: string } = {},
  ): number {
    const { bold = false, size = 8.6, color = '#111827', ...textOptions } = options;
    doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color);
    doc.text(value, x, y, { lineGap: 1.2, ...textOptions });
    return doc.y;
  }

  function heightOf(
    value: string,
    textWidth: number,
    options: { bold?: boolean; size?: number; lineGap?: number } = {},
  ): number {
    doc.font(options.bold ? fonts.bold : fonts.regular).fontSize(options.size ?? 8.6);
    return doc.heightOfString(value, { width: textWidth, lineGap: options.lineGap ?? 1.2 });
  }

  function sectionTitle(en: string, bn?: string): void {
    ensureSpace(26);
    const title = bn ? `${en} / ${bn}` : en;
    text(title, left, doc.y, { width, bold: true, size: 9.4, color: '#0f2d59' });
    doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    doc.y += 8;
  }

  function infoRow(label: string, value: string, x: number, y: number, rowW: number): number {
    text(label, x, y, { width: rowW, bold: true, size: 7.4, color: '#6b7280' });
    return text(value || 'N/A', x, y + 11, { width: rowW, size: 8.6, color: '#111827' });
  }

  function infoGrid(rows: Array<[string, string]>): void {
    const gap = 14;
    const colW = (width - gap) / 2;
    for (let i = 0; i < rows.length; i += 2) {
      ensureSpace(38);
      const y = doc.y;
      const leftEnd = infoRow(rows[i][0], rows[i][1], left, y, colW);
      const rightItem = rows[i + 1];
      const rightEnd = rightItem ? infoRow(rightItem[0], rightItem[1], left + colW + gap, y, colW) : y;
      doc.y = Math.max(leftEnd, rightEnd) + 7;
    }
  }

  function policyBlock(titleEn: string, titleBn: string, en: string, bn: string): void {
    const pad = 10;
    const innerW = width - pad * 2;
    const title = `${titleEn} / ${titleBn}`;
    const h =
      heightOf(title, innerW, { bold: true, size: 8.8 }) +
      heightOf(en, innerW, { size: 7.5 }) +
      heightOf(bn, innerW, { size: 7.5 }) +
      30;

    ensureSpace(h + 8);
    const y = doc.y;
    doc.roundedRect(left, y, width, h, 4).fillAndStroke('#f8fafc', '#e5e7eb');
    text(title, left + pad, y + 8, { width: innerW, bold: true, size: 8.8, color: '#0f2d59' });
    text(en, left + pad, doc.y + 4, { width: innerW, size: 7.5, color: '#374151' });
    text(bn, left + pad, doc.y + 3, { width: innerW, size: 7.5, color: '#374151' });
    doc.y = y + h + 7;
  }

  function listBlock(titleEn: string, titleBn: string, items: string[]): void {
    const pad = 10;
    const innerW = width - pad * 2;
    const listText = items.map((item) => `- ${item}`).join('\n');
    const h = heightOf(`${titleEn} / ${titleBn}`, innerW, { bold: true, size: 8.8 }) +
      heightOf(listText, innerW, { size: 7.7, lineGap: 1 }) + 24;

    ensureSpace(h + 8);
    const y = doc.y;
    doc.roundedRect(left, y, width, h, 4).fillAndStroke('#f0fdf4', '#bbf7d0');
    text(`${titleEn} / ${titleBn}`, left + pad, y + 8, { width: innerW, bold: true, size: 8.8, color: '#166534' });
    text(listText, left + pad, doc.y + 4, { width: innerW, size: 7.7, color: '#14532d', lineGap: 1 });
    doc.y = y + h + 7;
  }

  topBar();

  const headerY = 31;
  if (branding.logo) {
    doc.image(branding.logo, left, headerY, { fit: [64, 46] });
    text(branding.siteName, left + 76, headerY + 1, { width: width - 76, bold: true, size: 15, color: '#0f2d59' });
    text(WEBSITE, left + 76, doc.y + 1, { width: width - 76, size: 8.2, color: '#64748b' });
  } else {
    text(branding.siteName, left, headerY, { width, align: 'center', bold: true, size: 16, color: '#0f2d59' });
    text(WEBSITE, left, doc.y + 1, { width, align: 'center', size: 8.2, color: '#64748b' });
  }

  doc.y = 88;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#d1d5db').lineWidth(0.7).stroke();
  doc.y += 10;

  text('Booking Validation Slip / বুকিং ভ্যালিডেশন স্লিপ', left, doc.y, {
    width: width - 172,
    bold: true,
    size: 14,
    color: '#0f2d59',
  });

  const badgeW = 160;
  const badgeH = 26;
  const badgeX = right - badgeW;
  const badgeY = doc.y - 4;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 5).fillAndStroke(status.bg, status.border);
  text(status.label, badgeX, badgeY + 7, { width: badgeW, align: 'center', bold: true, size: 8.2, color: status.color });
  doc.y = Math.max(doc.y, badgeY + badgeH + 10);

  const cardY = doc.y;
  const cardH = 112;
  doc.roundedRect(left, cardY, width, cardH, 6).fillAndStroke('#ffffff', '#dbeafe');
  text('Booking Reference', left + 14, cardY + 12, { width: 255, bold: true, size: 7.6, color: '#64748b' });
  text(reg.bookingNumber, left + 14, cardY + 26, { width: 300, bold: true, size: 15.5, color: '#0f2d59' });
  text(`Payment Ref: ${reg.payment?.merchantTxnId || 'N/A'}`, left + 14, cardY + 53, {
    width: 310,
    size: 8,
    color: '#334155',
  });
  text(`Gateway Ref / EPS Txn ID: ${reg.payment?.epsTxnId || 'N/A'}`, left + 14, cardY + 68, {
    width: 310,
    size: 8,
    color: '#334155',
  });
  text(`Verify URL: ${verifyUrl}`, left + 14, cardY + 84, { width: 320, size: 6.6, color: '#64748b' });

  if (qrBuffer) {
    const qrSize = 78;
    const qrX = right - qrSize - 18;
    const qrY = cardY + 10;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    text('Scan to verify booking and latest campaign update', qrX - 34, qrY + qrSize + 2, {
      width: qrSize + 68,
      align: 'center',
      size: 5.8,
      color: '#475569',
    });
    text('বুকিং ও ক্যাম্পেইনের সর্বশেষ আপডেট যাচাই করতে স্ক্যান করুন', qrX - 36, doc.y, {
      width: qrSize + 72,
      align: 'center',
      size: 5.8,
      color: '#475569',
    });
  }

  doc.y = cardY + cardH + 13;

  sectionTitle('Booking Details', 'বুকিং তথ্য');
  infoGrid([
    ['Campaign name', reg.campaign?.title ?? 'N/A'],
    ['Owner name', reg.owner?.ownerName ?? 'N/A'],
    ['Owner mobile', reg.owner?.mobile ?? 'N/A'],
    ['Pet count', String(reg.petBookings.length)],
    ['Venue', [reg.session?.venue?.name, reg.session?.venue?.address].filter(Boolean).join(', ') || 'N/A'],
    ['Date', fmtDate(reg.session?.sessionDate)],
    ['Time', reg.session ? `${fmt12(reg.session.startTime)} - ${fmt12(reg.session.endTime)}` : 'N/A'],
    ['Booking created', fmtDate(reg.createdAt)],
  ]);

  sectionTitle('Payment Summary', 'পেমেন্ট সারাংশ');
  infoGrid([
    ['Amount', money(amount)],
    ['Status', status.label],
    ['Payment Ref', reg.payment?.merchantTxnId ?? 'N/A'],
    ['Gateway Ref / EPS Txn ID', reg.payment?.epsTxnId ?? 'N/A'],
  ]);

  sectionTitle('Important Campaign Notice', 'গুরুত্বপূর্ণ ক্যাম্পেইন নোটিশ');
  policyBlock(
    'Campaign change policy',
    'ক্যাম্পেইন পরিবর্তন নীতি',
    'Campaign date, time, venue, doctor, vaccine availability, or session schedule may change at any time due to operational reasons. If any change occurs, BPA may notify participants through SMS, phone call, website notice, Facebook page, or other official communication channels. Participants are responsible for checking the latest update before visiting the vaccination center.',
    'ক্যাম্পেইনের তারিখ, সময়, ভেন্যু, ডাক্তার, ভ্যাকসিনের প্রাপ্যতা বা সেশন সময় যেকোনো সময় পরিবর্তন হতে পারে। পরিবর্তন হলে BPA SMS, ফোন কল, ওয়েবসাইট নোটিশ, Facebook পেজ অথবা অন্যান্য অফিসিয়াল মাধ্যমে জানাবে। ভ্যাকসিনেশন সেন্টারে আসার আগে সর্বশেষ আপডেট দেখে আসা অংশগ্রহণকারীর দায়িত্ব।',
  );

  policyBlock(
    'Pet Health Requirements',
    'পোষা প্রাণীর স্বাস্থ্য শর্ত',
    'Only healthy pets should be brought for vaccination. Sick, feverish, weak, injured, vomiting, diarrhoea-affected, highly stressed, or visibly unwell animals may be refused vaccination. The final vaccination decision will be made by the attending veterinarian.',
    'শুধুমাত্র সুস্থ পোষা প্রাণী ভ্যাকসিনের জন্য আনতে হবে। অসুস্থ, জ্বরযুক্ত, দুর্বল, আহত, বমি/ডায়রিয়ায় আক্রান্ত, অতিরিক্ত স্ট্রেসড বা দৃশ্যমানভাবে অসুস্থ প্রাণীকে ভ্যাকসিন না-ও দেওয়া হতে পারে। ভ্যাকসিন দেওয়া হবে কি না, তার চূড়ান্ত সিদ্ধান্ত দায়িত্বপ্রাপ্ত ভেটেরিনারিয়ান গ্রহণ করবেন।',
  );

  policyBlock(
    'Arrival & Missed Session Policy',
    'উপস্থিতি ও মিসড সেশন নীতি',
    'Please arrive within the assigned campaign time. If a participant arrives late or misses the session, service is not guaranteed. BPA may provide support subject to vaccine availability, doctor availability, and campaign capacity.',
    'নির্ধারিত সময়ের মধ্যে উপস্থিত হতে হবে। নির্ধারিত সময়ের পরে আসলে বা সেশন মিস করলে সার্ভিস নিশ্চিত নয়। তবে ভ্যাকসিন, ডাক্তার এবং ক্যাম্পেইন ক্যাপাসিটি available থাকলে BPA সহায়তা করার চেষ্টা করতে পারে।',
  );

  policyBlock(
    'Payment & Refund Policy',
    'পেমেন্ট ও রিফান্ড নীতি',
    'Payment is generally non-refundable. If BPA cancels or reschedules a session, BPA may provide an alternative schedule or further instruction through official channels.',
    'পেমেন্ট সাধারণত non-refundable। BPA যদি কোনো সেশন বাতিল বা reschedule করে, তাহলে BPA অফিসিয়াল মাধ্যমে বিকল্প সময়সূচি অথবা পরবর্তী নির্দেশনা দিতে পারে।',
  );

  listBlock('What to Bring', 'যা সঙ্গে আনবেন', [
    'Validation slip or booking reference',
    'Registered mobile number',
    'Payment transaction reference if needed',
    'Previous vaccination record if available',
    'Cat carrier, cage, or secure bag',
  ]);

  sectionTitle('Contact & Support', 'যোগাযোগ ও সহায়তা');
  infoGrid([
    ['Website', WEBSITE],
    ['Email', SUPPORT_EMAIL],
    ['Phone', SUPPORT_PHONES],
    ['Office Address', OFFICE_ADDRESS],
    ['Facebook', FACEBOOK],
    ['YouTube', YOUTUBE],
  ]);

  doc.end();
}
