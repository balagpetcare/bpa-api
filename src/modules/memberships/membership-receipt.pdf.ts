import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import type { Response } from 'express';
import { config } from '../../config';
import { getPublicSettings } from '../site-settings/site-settings.service';

const FONT_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Regular.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Bold.ttf');
const HIND_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Regular.ttf');
const HIND_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf');

function registerFonts(doc: PDFKit.PDFDocument) {
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
    if (fs.existsSync(candidate.regularPath) && fs.existsSync(candidate.boldPath)) {
      try {
        doc.registerFont(candidate.regularName, candidate.regularPath);
        doc.registerFont(candidate.boldName, candidate.boldPath);
        return { regular: candidate.regularName, bold: candidate.boldName };
      } catch (err) {
        console.warn(`[receipt-pdf] ${candidate.label} registration failed:`, err);
      }
    }
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

function isBangladesh(purchase: any): boolean {
  const phone = purchase.memberMobile || '';
  const startsWithBd = phone.startsWith('+880') || phone.startsWith('880') || phone.startsWith('01');
  const hasLocation = !!(purchase.divisionId || purchase.districtId || purchase.upazilaId || purchase.cityCorporationId);
  return startsWithBd || hasLocation;
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

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) return `*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function streamMembershipReceiptPdf(purchase: any, res: Response): Promise<void> {
  const settings = await getPublicSettings().catch(() => null);
  const isBd = isBangladesh(purchase);
  
  const orgName = settings?.organizationName || 'Bangladesh Pet Association';
  const logo = await loadLogoBuffer(settings?.primaryLogoUrl);
  const supportEmail = settings?.supportEmail || 'info@bangladeshpetassociation.com';
  const supportPhone = settings?.supportPhone || '01575008300';
  const officeAddress = settings?.officeAddress || 'Bangladesh';

  const title = isBd ? 'কমিউনিটি কেয়ার পার্টনার কার্ড — অফিসিয়াল রসিদ' : 'Community Care Partner Card — Official Receipt';
  const statusLabel = 'PAID / VERIFIED';
  
  const verifyUrl = purchase.card?.qrToken
    ? `${config.FRONTEND_URL.replace(/\/$/, '')}/verify/membership-card/${purchase.card.qrToken}`
    : `${config.FRONTEND_URL.replace(/\/$/, '')}/membership/lookup?ref=${purchase.id}`;

  let qrBuffer: Buffer | null = null;
  try {
    const qrDataUri = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
      color: { dark: '#0f2d59', light: '#ffffff' },
    });
    qrBuffer = Buffer.from(qrDataUri.split(',')[1]!, 'base64');
  } catch {
    qrBuffer = null;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 38, autoFirstPage: true });
  doc.pipe(res);

  const fonts = registerFonts(doc);
  const pageW = doc.page.width;
  const left = 38;
  const right = pageW - 38;
  const width = right - left;

  // Header Bar
  doc.rect(0, 0, pageW, 7).fill('#16a34a');

  // Brand Header
  const headerY = 31;
  if (logo) {
    doc.image(logo, left, headerY, { fit: [60, 40] });
    doc.font(fonts.bold).fontSize(14).fillColor('#0f2d59').text(orgName, left + 70, headerY + 2);
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left + 70, doc.y + 1);
  } else {
    doc.font(fonts.bold).fontSize(15).fillColor('#0f2d59').text(orgName, left, headerY, { align: 'center' });
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left, doc.y + 1, { align: 'center' });
  }

  doc.y = 80;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  doc.y += 10;

  // Title and Status Badge
  const titleY = doc.y;
  doc.font(fonts.bold).fontSize(12).fillColor('#0f2d59').text(title, left, titleY, { width: width - 130 });
  
  const badgeW = 110;
  const badgeH = 22;
  const badgeX = right - badgeW;
  doc.roundedRect(badgeX, titleY - 2, badgeW, badgeH, 4).fillAndStroke('#dcfce7', '#86efac');
  doc.font(fonts.bold).fontSize(7.5).fillColor('#166534').text(statusLabel, badgeX, titleY + 5, { width: badgeW, align: 'center' });

  doc.y = Math.max(doc.y, titleY + badgeH) + 12;

  // Payment Details Card
  const cardY = doc.y;
  const cardH = 95;
  doc.roundedRect(left, cardY, width, cardH, 5).fillAndStroke('#f8fafc', '#e2e8f0');
  
  doc.font(fonts.bold).fontSize(7.5).fillColor('#64748b').text(isBd ? 'রসিদ নম্বর / Receipt Number' : 'Receipt / Reference Number', left + 12, cardY + 12);
  doc.font(fonts.bold).fontSize(12).fillColor('#0f2d59').text(purchase.id, left + 12, cardY + 23);
  
  doc.font(fonts.regular).fontSize(8.5).fillColor('#334155').text(
    `${isBd ? 'পেমেন্ট গেটওয়ে' : 'Payment Gateway'}: ${purchase.payment?.gateway?.toUpperCase() || 'EPS'}  |  ${isBd ? 'গেটওয়ে ট্রানজেকশন আইডি' : 'Gateway Txn ID'}: ${purchase.payment?.gatewayRef || purchase.payment?.epsTxnId || 'N/A'}`,
    left + 12, cardY + 48
  );
  
  doc.font(fonts.regular).fontSize(8.5).fillColor('#334155').text(
    `${isBd ? 'পেমেন্টের তারিখ' : 'Paid Date'}: ${purchase.purchasedAt ? new Date(purchase.purchasedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}`,
    left + 12, cardY + 62
  );
  
  doc.font(fonts.regular).fontSize(7.5).fillColor('#64748b').text(
    `Validity: ${purchase.startsAt ? new Date(purchase.startsAt).toLocaleDateString('en-GB') : 'N/A'} - ${purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleDateString('en-GB') : 'N/A'} (5 Years)`,
    left + 12, cardY + 76
  );

  if (qrBuffer) {
    doc.image(qrBuffer, right - 75, cardY + 10, { width: 65, height: 65 });
    doc.font(fonts.regular).fontSize(5.5).fillColor('#64748b').text(isBd ? 'যাচাই করতে স্ক্যান করুন' : 'Scan to Verify Card', right - 85, cardY + 77, { width: 85, align: 'center' });
  }

  doc.y = cardY + cardH + 15;

  // Member Information Section
  doc.font(fonts.bold).fontSize(9.5).fillColor('#0f2d59').text(isBd ? 'সদস্য এবং কার্ডের বিবরণ' : 'Member & Card Details', left, doc.y);
  doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.y += 8;

  const infoTableY = doc.y;
  const colW = (width - 15) / 2;

  const renderInfoRow = (label: string, val: string, x: number, y: number) => {
    doc.font(fonts.bold).fontSize(7.5).fillColor('#64748b').text(label, x, y);
    doc.font(fonts.regular).fontSize(8.5).fillColor('#1e293b').text(val || 'N/A', x, y + 11);
    return y + 25;
  };

  const nameLabel = isBd ? 'সদস্যের নাম / Member Name' : 'Member Name';
  const mobileLabel = isBd ? 'মোবাইল নম্বর / Mobile Number' : 'Mobile Number';
  const emailLabel = isBd ? 'ইমেল এড্রেস / Email Address' : 'Email Address';
  const tierLabelStr = isBd ? 'কার্ডের ক্যাটাগরি / Membership Tier' : 'Membership Tier';
  const petLabel = isBd ? 'কাভার্ড পোষা প্রাণীর সংখ্যা / Pets Covered' : 'Number of Pets Covered';
  const zoneLabel = isBd ? 'পছন্দের ক্লিনিক জোন / Preferred Clinic Zone' : 'Preferred Clinic Zone';

  const tierVal = isBd ? `${purchase.tier.nameEn} (${purchase.tier.nameBn})` : purchase.tier.nameEn;
  
  let leftY = infoTableY;
  leftY = renderInfoRow(nameLabel, purchase.memberName, left, leftY);
  leftY = renderInfoRow(mobileLabel, maskPhone(purchase.memberMobile), left, leftY);
  leftY = renderInfoRow(emailLabel, maskEmail(purchase.memberEmail) || 'N/A', left, leftY);

  let rightY = infoTableY;
  rightY = renderInfoRow(tierLabelStr, tierVal, left + colW + 15, rightY);
  rightY = renderInfoRow(petLabel, String(purchase.petLimit), left + colW + 15, rightY);
  rightY = renderInfoRow(zoneLabel, purchase.preferredZone?.name || 'N/A', left + colW + 15, rightY);

  doc.y = Math.max(leftY, rightY) + 5;

  // Price Breakdowns Section
  doc.font(fonts.bold).fontSize(9.5).fillColor('#0f2d59').text(isBd ? 'পেমেন্ট সারাংশ' : 'Payment Summary', left, doc.y);
  doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.y += 8;

  const regularPrice = Number(purchase.tier.regularPriceBdt);
  const paidAmount = Number(purchase.amountBdt);
  const savings = regularPrice - paidAmount;

  const renderSummaryRow = (label: string, val: string, isTotal = false) => {
    const currentY = doc.y;
    doc.font(isTotal ? fonts.bold : fonts.regular).fontSize(isTotal ? 9 : 8.5).fillColor(isTotal ? '#0f2d59' : '#334155').text(label, left + 10, currentY);
    doc.font(isTotal ? fonts.bold : fonts.regular).fontSize(isTotal ? 9 : 8.5).fillColor(isTotal ? '#0f2d59' : '#334155').text(val, right - 120, currentY, { width: 110, align: 'right' });
    doc.y = currentY + 16;
  };

  renderSummaryRow(isBd ? 'নিয়মিত মূল্য / Regular Price' : 'Regular Price', `BDT ${regularPrice.toLocaleString('en-BD')}/-`);
  if (savings > 0) {
    renderSummaryRow(isBd ? 'অফার ডিসকাউন্ট / Launch Offer Discount' : 'Launch Offer Savings', `- BDT ${savings.toLocaleString('en-BD')}/-`);
  }
  doc.moveTo(left + 10, doc.y).lineTo(right - 10, doc.y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.y += 6;
  renderSummaryRow(isBd ? 'সর্বমোট পরিশোধিত / Amount Paid (Paid in Full)' : 'Amount Paid (Paid in Full)', `BDT ${paidAmount.toLocaleString('en-BD')}/-`, true);

  doc.y += 12;

  // Legal Disclaimer Block
  const legalTitle = isBd ? 'আইনি নোটিশ / Legal Disclaimer' : 'Legal Disclaimer';
  const disclaimerText = "BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return. Service discounts and third-party benefits are subject to availability and partner terms. Clinic zone establishment is subject to sufficient member demand and BPA operational planning.";
  const legalHeight = doc.heightOfString(disclaimerText, { width: width - 20, lineGap: 1.2 }) + 26;

  const disY = doc.y;
  doc.roundedRect(left, disY, width, legalHeight, 4).fillAndStroke('#fffbeb', '#fde68a');
  doc.font(fonts.bold).fontSize(8).fillColor('#b45309').text(legalTitle, left + 10, disY + 8);
  doc.font(fonts.regular).fontSize(7).fillColor('#78350f').text(disclaimerText, left + 10, doc.y + 4, { width: width - 20, lineGap: 1.2 });

  doc.y = disY + legalHeight + 15;

  // Support / Footer Section
  doc.font(fonts.bold).fontSize(9.5).fillColor('#0f2d59').text(isBd ? 'যোগাযোগ ও সহায়তা' : 'Support & Contact', left, doc.y);
  doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.y += 8;

  const footerYStart = doc.y;
  const colWSupport = (width - 15) / 2;

  doc.font(fonts.bold).fontSize(7.5).fillColor('#64748b').text('Email Support', left, footerYStart);
  doc.font(fonts.regular).fontSize(8.5).fillColor('#1e293b').text(supportEmail, left, footerYStart + 11);

  doc.font(fonts.bold).fontSize(7.5).fillColor('#64748b').text('Helpline Numbers', left + colWSupport + 15, footerYStart);
  doc.font(fonts.regular).fontSize(8.5).fillColor('#1e293b').text(supportPhone, left + colWSupport + 15, footerYStart + 11);

  doc.y = footerYStart + 35;

  // Final Footer Text
  doc.font(fonts.regular).fontSize(7.5).fillColor('#94a3b8').text(`Bangladesh Pet Association | Office Address: ${officeAddress}`, left, doc.y, { align: 'center', width });
  doc.font(fonts.regular).fontSize(6.5).fillColor('#cbd5e1').text(`Document digitally verified. Reference ID: ${purchase.id}`, left, doc.y + 3, { align: 'center', width });

  doc.end();
}
