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
        console.warn(`[card-pdf] ${candidate.label} registration failed:`, err);
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
      .resize({ width: 150, height: 60, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('[card-pdf] Unable to load logo:', err);
    return null;
  }
}

type ThemeConfig = {
  primary: string;
  secondary: string;
  textColor: string;
  accent: string;
  bgLight: string;
};

function getThemeByTier(slug: string): ThemeConfig {
  const s = slug.toLowerCase();
  if (s.includes('premium')) {
    // Deep Green with Gold Accent
    return {
      primary: '#064e3b',   // Deep Emerald Green
      secondary: '#0f5132', // Dark Green
      textColor: '#ffffff',
      accent: '#fbbf24',    // Gold accent
      bgLight: '#f0fdf4',   // Light green tint
    };
  }
  if (s.includes('enterprise') || s.includes('corporate')) {
    // Dark Navy with Silver/Platinum Accent
    return {
      primary: '#0f172a',   // Dark Navy
      secondary: '#1e293b', // Navy Slate
      textColor: '#ffffff',
      accent: '#cbd5e1',    // Silver/Platinum
      bgLight: '#f8fafc',   // Light slate/navy tint
    };
  }
  // Primary / Standard: Blue/Teal Professional Style
  return {
    primary: '#0e7490',     // Deep Teal
    secondary: '#155e75',   // Dark Teal
    textColor: '#ffffff',
    accent: '#22d3ee',      // Cyan accent
    bgLight: '#ecfeff',     // Teal tint
  };
}

export async function streamMembershipCardPdf(purchase: any, res: Response): Promise<void> {
  const settings = await getPublicSettings().catch(() => null);
  const isBd = isBangladesh(purchase);
  
  const orgName = settings?.organizationName || 'Bangladesh Pet Association';
  const logo = await loadLogoBuffer(settings?.primaryLogoUrl);
  const supportEmail = settings?.supportEmail || 'info@bangladeshpetassociation.com';
  const supportPhone = settings?.supportPhone || '01575008300';

  const theme = getThemeByTier(purchase.tier.slug);

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
  doc.rect(0, 0, pageW, 7).fill(theme.primary);

  // Brand Header
  const headerY = 31;
  if (logo) {
    doc.image(logo, left, headerY, { fit: [55, 35] });
    doc.font(fonts.bold).fontSize(13).fillColor('#0f2d59').text(orgName, left + 65, headerY + 1);
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left + 65, doc.y + 1);
  } else {
    doc.font(fonts.bold).fontSize(14).fillColor('#0f2d59').text(orgName, left, headerY, { align: 'center' });
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left, doc.y + 1, { align: 'center' });
  }

  doc.y = 80;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.y += 15;

  // Render Card container (CR-80 styled card on the page)
  const cardW = 320;
  const cardH = 190;
  const cardX = left + (width - cardW) / 2; // Center horizontally
  const cardY = doc.y;

  // Draw Card Shadow/Border
  doc.roundedRect(cardX, cardY, cardW, cardH, 8).fillAndStroke(theme.primary, theme.secondary);

  // Logo on Card
  if (logo) {
    doc.image(logo, cardX + 15, cardY + 15, { fit: [50, 30] });
    doc.font(fonts.bold).fontSize(8.5).fillColor(theme.textColor).text(orgName.toUpperCase(), cardX + 70, cardY + 18);
  } else {
    doc.font(fonts.bold).fontSize(10).fillColor(theme.textColor).text(orgName.toUpperCase(), cardX + 15, cardY + 18);
  }

  // Tier Badge inside Card
  const tierName = isBd ? purchase.tier.nameEn.toUpperCase() : purchase.tier.nameEn.toUpperCase();
  doc.font(fonts.bold).fontSize(7).fillColor(theme.accent).text(tierName, cardX + 70, cardY + 30);

  // Card Content
  const detailsY = cardY + 58;
  doc.font(fonts.bold).fontSize(6.5).fillColor(theme.accent).text(isBd ? 'কার্ডধারী / CARD HOLDER' : 'CARD HOLDER', cardX + 15, detailsY);
  doc.font(fonts.bold).fontSize(11).fillColor(theme.textColor).text(purchase.memberName.toUpperCase(), cardX + 15, detailsY + 9, { width: cardW - 100 });

  doc.font(fonts.bold).fontSize(6.5).fillColor(theme.accent).text(isBd ? 'কার্ড নম্বর / CARD NUMBER' : 'CARD NUMBER', cardX + 15, detailsY + 28);
  doc.font(fonts.bold).fontSize(11).fillColor(theme.textColor).text(purchase.card?.cardNumber || 'N/A', cardX + 15, detailsY + 37);

  // Validity and Pet Limit
  const validFromStr = purchase.startsAt ? new Date(purchase.startsAt).toLocaleDateString('en-GB') : 'N/A';
  const validUntilStr = purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleDateString('en-GB') : 'N/A';
  
  doc.font(fonts.bold).fontSize(6.5).fillColor(theme.accent).text('VALID THRU', cardX + 15, detailsY + 56);
  doc.font(fonts.regular).fontSize(8.5).fillColor(theme.textColor).text(`${validFromStr} - ${validUntilStr}`, cardX + 15, detailsY + 65);

  doc.font(fonts.bold).fontSize(6.5).fillColor(theme.accent).text('PET LIMIT', cardX + 130, detailsY + 56);
  doc.font(fonts.regular).fontSize(8.5).fillColor(theme.textColor).text(`${purchase.petLimit} PETS`, cardX + 130, detailsY + 65);

  // QR Code on Card
  if (qrBuffer) {
    const cardQrSize = 65;
    const cardQrX = cardX + cardW - cardQrSize - 15;
    const cardQrY = cardY + (cardH - cardQrSize) / 2;
    // Draw white background under QR to ensure contrast
    doc.roundedRect(cardQrX - 4, cardQrY - 4, cardQrSize + 8, cardQrSize + 8, 4).fill('#ffffff');
    doc.image(qrBuffer, cardQrX, cardQrY, { width: cardQrSize, height: cardQrSize });
    
    doc.font(fonts.regular).fontSize(4.5).fillColor(theme.primary).text(isBd ? 'যাচাই করুন' : 'Verify Card', cardQrX, cardQrY + cardQrSize + 1, { width: cardQrSize, align: 'center' });
  }

  // Card Footer line
  doc.font(fonts.regular).fontSize(6.5).fillColor(theme.accent).text(`PREFERRED CLINIC ZONE: ${(purchase.preferredZone?.name || 'N/A').toUpperCase()}`, cardX + 15, cardY + cardH - 15);

  doc.y = cardY + cardH + 20;

  // Benefits Summary Section
  doc.font(fonts.bold).fontSize(10).fillColor('#0f2d59').text(isBd ? 'কার্ডের সুবিধাসমূহ' : 'Card Benefits & Privileges', left, doc.y);
  doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.y += 8;

  const renderBenefitItem = (title: string, desc: string) => {
    const currentY = doc.y;
    doc.circle(left + 5, currentY + 5, 2.5).fill(theme.primary);
    doc.font(fonts.bold).fontSize(8.5).fillColor('#1e293b').text(title, left + 15, currentY);
    doc.font(fonts.regular).fontSize(7.5).fillColor('#475569').text(desc, left + 15, doc.y + 2, { width: width - 20 });
    doc.y += 8;
  };

  renderBenefitItem(
    isBd ? '৫ বছরের দীর্ঘমেয়াদী মেয়াদ' : '5-Year Validity Period',
    isBd ? 'কার্ড ইস্যুর দিন থেকে আগামী ৫ বছরের জন্য এটি সক্রিয় থাকবে।' : 'Enjoy peace of mind with a long term membership valid for 60 months.'
  );

  const petLimitDesc = isBd 
    ? `আপনার নিবন্ধিত ক্যাটাগরি অনুযায়ী সর্বোচ্চ ${purchase.petLimit}টি পোষা প্রাণী এই কার্ডের আওতায় থাকবে।`
    : `Service coverage and priority access for up to ${purchase.petLimit} registered pets.`;
  renderBenefitItem(
    isBd ? `সর্বোচ্চ ${purchase.petLimit}টি পোষা প্রাণীর কাভারেজ` : `Coverage for up to ${purchase.petLimit} Pets`,
    petLimitDesc
  );

  renderBenefitItem(
    isBd ? 'অগ্রাধিকার সেবা' : 'Priority Care Services',
    isBd ? 'যেকোনো বিপিএ পার্টনার ক্লিনিক ও সেন্টারে অগ্রাধিকার ভিত্তিতে এবং দ্রুত সেবা লাভ।' : 'Get priority center booking, consults, and emergency support queue.'
  );

  renderBenefitItem(
    isBd ? 'বিশেষ ডিসকাউন্ট সুবিধা' : 'Premium Service Discounts',
    isBd ? 'বিপিএ ডায়াগনস্টিক, ভ্যাকসিন এবং পার্টনার হাসপাতালে বিশেষ ছাড়।' : 'Enjoy partner clinic discount rates, vaccination support, and diagnostic care benefits.'
  );

  doc.y += 10;

  // Disclaimer / Legal note in small footer
  const legalNote = isBd
    ? 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড মূলত একটি পরিষেবা কার্ড। এটি অ্যাসোসিয়েশনের মালিকানা, শেয়ার, আর্থিক লভ্যাংশ বা রিফান্ডের অধিকার নির্দেশ করে না। সুবিধা ও সেবা পার্টনার ক্লিনিকের শর্তাবলী অনুযায়ী পরিবর্তনযোগ্য।'
    : 'BPA Community Care Card is for service benefits and prioritization. It does not represent any financial returns, equity ownership, or refunds. Discounts and partner clinic benefits are subject to change and partner terms.';
  
  const disY = doc.y;
  doc.font(fonts.regular).fontSize(6.5).fillColor('#64748b').text(legalNote, left, disY, { align: 'justify', width, lineGap: 1.2 });

  doc.y = disY + 30;

  // Support / Contacts
  doc.font(fonts.regular).fontSize(7.5).fillColor('#94a3b8').text(`Bangladesh Pet Association | Support: ${supportEmail} | Hotline: ${supportPhone}`, left, doc.y, { align: 'center', width });
  doc.font(fonts.regular).fontSize(6.5).fillColor('#cbd5e1').text(`Card verification url: ${verifyUrl}`, left, doc.y + 11, { align: 'center', width });

  doc.end();
}
