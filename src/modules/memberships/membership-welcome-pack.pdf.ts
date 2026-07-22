import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import type { Response } from 'express';
import { config } from '../../config';
import { getPublicSettings } from '../site-settings/site-settings.service';
import { drawMembershipGuideContent, registerFonts } from './membership-guide.pdf';

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
    console.warn('[welcome-pack-pdf] Unable to load logo:', err);
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
    // Deep Green with Gold Accent (per requested rule)
    return {
      primary: '#064e3b',   // Deep Emerald Green
      secondary: '#0f5132', // Dark Green
      textColor: '#ffffff',
      accent: '#fbbf24',    // Gold accent
      bgLight: '#f0fdf4',   // Light green/emerald tint
    };
  }
  if (s.includes('enterprise') || s.includes('corporate')) {
    // Dark Navy with Silver/Platinum Accent (per requested rule)
    return {
      primary: '#0f172a',   // Dark Navy
      secondary: '#1e293b', // Navy Slate
      textColor: '#ffffff',
      accent: '#cbd5e1',    // Silver/Platinum
      bgLight: '#f8fafc',   // Light navy/slate tint
    };
  }
  // Primary / Standard: Blue/Teal Professional Style (per requested rule)
  return {
    primary: '#0e7490',     // Teal/Blue
    secondary: '#155e75',   // Dark Teal/Blue
    textColor: '#ffffff',
    accent: '#22d3ee',      // Cyan accent
    bgLight: '#ecfeff',     // Teal tint
  };
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

export async function streamMembershipWelcomePackPdf(purchase: any, res: Response): Promise<void> {
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

  // ─────────────────────────────────────────────────────────────────
  // PAGE 1: COVER PAGE
  // ─────────────────────────────────────────────────────────────────
  
  // Theme Background Accent (Stripes)
  doc.rect(0, 0, pageW, 15).fill(theme.primary);
  
  // Big Logo or Org Name
  let coverLogoY = 180;
  if (logo) {
    doc.image(logo, (pageW - 140) / 2, coverLogoY, { width: 140 });
    coverLogoY += 75;
  }
  
  doc.font(fonts.bold).fontSize(24).fillColor(theme.primary).text(orgName, left, coverLogoY, { align: 'center', width });
  doc.y = coverLogoY + 32;
  
  doc.font(fonts.bold).fontSize(16).fillColor('#1e293b').text(isBd ? 'কমিউনিটি কেয়ার মেম্বারশিপ' : 'Community Care Membership', left, doc.y, { align: 'center', width });
  doc.font(fonts.regular).fontSize(13).fillColor('#475569').text(isBd ? 'স্বাগতম কিট ও ডিজিটাল পার্টনার কার্ড' : 'Welcome Pack & Digital Partner Card', left, doc.y + 19, { align: 'center', width });
  
  // Info Card in the center
  const boxW = 320;
  const boxH = 140;
  const boxX = (pageW - boxW) / 2;
  const boxY = doc.page.height - boxH - 130;
  
  doc.roundedRect(boxX, boxY, boxW, boxH, 6).fillAndStroke(theme.bgLight, theme.primary);
  
  doc.font(fonts.bold).fontSize(8.5).fillColor(theme.primary).text(isBd ? 'সদস্যের বিবরণ / MEMBER DETAILS' : 'MEMBER DETAILS', boxX + 15, boxY + 15);
  
  const renderCoverRow = (lbl: string, val: string, yOffset: number) => {
    doc.font(fonts.bold).fontSize(8).fillColor('#64748b').text(lbl, boxX + 15, boxY + yOffset);
    doc.font(fonts.regular).fontSize(9.5).fillColor('#0f172a').text(val, boxX + 110, boxY + yOffset - 1);
  };
  
  renderCoverRow(isBd ? 'নাম' : 'Name', purchase.memberName, 38);
  renderCoverRow(isBd ? 'টিয়ার' : 'Tier', `${purchase.tier.nameEn} (${purchase.tier.nameBn || ''})`, 58);
  renderCoverRow(isBd ? 'কার্ড নম্বর' : 'Card No', purchase.card?.cardNumber || 'N/A', 78);
  renderCoverRow(isBd ? 'মেয়াদ' : 'Validity', `${purchase.startsAt ? new Date(purchase.startsAt).toLocaleDateString('en-GB') : 'N/A'} - ${purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleDateString('en-GB') : 'N/A'}`, 98);
  renderCoverRow(isBd ? 'পছন্দের জোন' : 'Preferred Zone', purchase.preferredZone?.name || 'N/A', 118);

  // Footer Cover
  doc.font(fonts.regular).fontSize(8.5).fillColor('#94a3b8').text('Bangladesh Pet Association | https://bangladeshpetassociation.com', left, doc.page.height - 50, { align: 'center', width });

  // ─────────────────────────────────────────────────────────────────
  // PAGE 2: RECEIPT & DIGITAL CARD
  // ─────────────────────────────────────────────────────────────────
  doc.addPage();
  
  // Header Bar
  doc.rect(0, 0, pageW, 7).fill(theme.primary);

  // Logo + title
  const rHeaderY = 31;
  if (logo) {
    doc.image(logo, left, rHeaderY, { fit: [60, 40] });
    doc.font(fonts.bold).fontSize(14).fillColor('#0f2d59').text(orgName, left + 70, rHeaderY + 2);
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left + 70, doc.y + 1);
  } else {
    doc.font(fonts.bold).fontSize(15).fillColor('#0f2d59').text(orgName, left, rHeaderY, { align: 'center' });
    doc.font(fonts.regular).fontSize(8).fillColor('#64748b').text('https://bangladeshpetassociation.com', left, doc.y + 1, { align: 'center' });
  }

  doc.y = 80;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  doc.y += 10;

  // Title: Official Receipt
  const rTitleY = doc.y;
  const titleText = isBd ? 'কমিউনিটি কেয়ার পার্টনার কার্ড — অফিসিয়াল রসিদ' : 'Community Care Partner Card — Official Receipt';
  doc.font(fonts.bold).fontSize(11).fillColor('#0f2d59').text(titleText, left, rTitleY, { width: width - 130 });
  
  // Status Badge
  const badgeW = 100;
  const badgeH = 20;
  const badgeX = right - badgeW;
  doc.roundedRect(badgeX, rTitleY - 2, badgeW, badgeH, 4).fillAndStroke('#dcfce7', '#86efac');
  doc.font(fonts.bold).fontSize(7.5).fillColor('#166534').text('PAID / VERIFIED', badgeX, rTitleY + 4, { width: badgeW, align: 'center' });

  doc.y = Math.max(doc.y, rTitleY + badgeH) + 10;

  // Payment Receipt info
  const receiptCardY = doc.y;
  const receiptCardH = 75;
  doc.roundedRect(left, receiptCardY, width, receiptCardH, 4).fillAndStroke('#f8fafc', '#e2e8f0');
  
  doc.font(fonts.bold).fontSize(7).fillColor('#64748b').text(isBd ? 'রসিদ নম্বর / Receipt Number' : 'Receipt / Reference Number', left + 10, receiptCardY + 10);
  doc.font(fonts.bold).fontSize(11).fillColor('#0f2d59').text(purchase.id, left + 10, receiptCardY + 19);
  
  doc.font(fonts.regular).fontSize(8).fillColor('#334155').text(
    `Gateway: ${purchase.payment?.gateway?.toUpperCase() || 'EPS'} | Gateway Txn ID: ${purchase.payment?.gatewayRef || purchase.payment?.epsTxnId || 'N/A'}`,
    left + 10, receiptCardY + 36
  );
  doc.font(fonts.regular).fontSize(8).fillColor('#334155').text(
    `Paid Date: ${purchase.purchasedAt ? new Date(purchase.purchasedAt).toLocaleString('en-GB') : 'N/A'} | Regular Price: BDT ${purchase.tier.regularPriceBdt} | Paid: BDT ${purchase.amountBdt}`,
    left + 10, receiptCardY + 48
  );
  doc.font(fonts.regular).fontSize(7).fillColor('#64748b').text(
    `Member: ${purchase.memberName} | Mobile: ${maskPhone(purchase.memberMobile)} | Email: ${maskEmail(purchase.memberEmail) || 'N/A'}`,
    left + 10, receiptCardY + 60
  );

  if (qrBuffer) {
    doc.image(qrBuffer, right - 68, receiptCardY + 6, { width: 55, height: 55 });
    doc.font(fonts.regular).fontSize(5).fillColor('#64748b').text('Scan to Verify', right - 73, receiptCardY + 62, { width: 65, align: 'center' });
  }

  // Draw Card visual directly below receipt
  doc.y = receiptCardY + receiptCardH + 15;
  doc.font(fonts.bold).fontSize(10).fillColor('#0f2d59').text(isBd ? 'ডিজিটাল কার্ড ভিউ / Digital Card Visual' : 'Digital Card Visual', left);
  doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.y += 10;

  const cardW = 310;
  const cardH = 180;
  const cardX = left + (width - cardW) / 2;
  const cardY = doc.y;

  // Draw CR-80 styled card
  doc.roundedRect(cardX, cardY, cardW, cardH, 8).fillAndStroke(theme.primary, theme.secondary);
  if (logo) {
    doc.image(logo, cardX + 15, cardY + 15, { fit: [45, 28] });
    doc.font(fonts.bold).fontSize(8).fillColor(theme.textColor).text(orgName.toUpperCase(), cardX + 65, cardY + 17);
  } else {
    doc.font(fonts.bold).fontSize(9.5).fillColor(theme.textColor).text(orgName.toUpperCase(), cardX + 15, cardY + 17);
  }

  doc.font(fonts.bold).fontSize(6.5).fillColor(theme.accent).text(purchase.tier.nameEn.toUpperCase(), cardX + 65, cardY + 28);

  const cardDetailsY = cardY + 54;
  doc.font(fonts.bold).fontSize(6).fillColor(theme.accent).text('CARD HOLDER', cardX + 15, cardDetailsY);
  doc.font(fonts.bold).fontSize(10).fillColor(theme.textColor).text(purchase.memberName.toUpperCase(), cardX + 15, cardDetailsY + 8, { width: cardW - 100 });

  doc.font(fonts.bold).fontSize(6).fillColor(theme.accent).text('CARD NUMBER', cardX + 15, cardDetailsY + 26);
  doc.font(fonts.bold).fontSize(10).fillColor(theme.textColor).text(purchase.card?.cardNumber || 'N/A', cardX + 15, cardDetailsY + 34);

  const vFromStr = purchase.startsAt ? new Date(purchase.startsAt).toLocaleDateString('en-GB') : 'N/A';
  const vUntilStr = purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleDateString('en-GB') : 'N/A';
  doc.font(fonts.bold).fontSize(6).fillColor(theme.accent).text('VALID THRU', cardX + 15, cardDetailsY + 52);
  doc.font(fonts.regular).fontSize(8).fillColor(theme.textColor).text(`${vFromStr} - ${vUntilStr}`, cardX + 15, cardDetailsY + 60);

  doc.font(fonts.bold).fontSize(6).fillColor(theme.accent).text('PET LIMIT', cardX + 120, cardDetailsY + 52);
  doc.font(fonts.regular).fontSize(8).fillColor(theme.textColor).text(`${purchase.petLimit} PETS`, cardX + 120, cardDetailsY + 60);

  if (qrBuffer) {
    const cardQrSize = 60;
    const cardQrX = cardX + cardW - cardQrSize - 15;
    const cardQrY = cardY + (cardH - cardQrSize) / 2;
    doc.roundedRect(cardQrX - 4, cardQrY - 4, cardQrSize + 8, cardQrSize + 8, 4).fill('#ffffff');
    doc.image(qrBuffer, cardQrX, cardQrY, { width: cardQrSize, height: cardQrSize });
    doc.font(fonts.regular).fontSize(4.5).fillColor(theme.primary).text('Verify Card', cardQrX, cardQrY + cardQrSize + 1, { width: cardQrSize, align: 'center' });
  }

  doc.font(fonts.regular).fontSize(6.5).fillColor(theme.accent).text(`PREFERRED CLINIC ZONE: ${(purchase.preferredZone?.name || 'N/A').toUpperCase()}`, cardX + 15, cardY + cardH - 13);

  // Legal Note
  doc.y = cardY + cardH + 15;
  const miniLegalText = "This Welcome Pack contains your official receipt and digital card visualization. For physical verification, scan the QR code or use the card number. Subject to BPA terms & conditions. Support: " + supportEmail + " | Helpline: " + supportPhone;
  doc.font(fonts.regular).fontSize(6.5).fillColor('#64748b').text(miniLegalText, left, doc.y, { align: 'center', width });

  // ─────────────────────────────────────────────────────────────────
  // PAGE 3: RULES & GUIDES
  // ─────────────────────────────────────────────────────────────────
  doc.addPage();
  doc.rect(0, 0, pageW, 7).fill('#0f2d59');
  doc.y = 35;

  drawMembershipGuideContent(doc, purchase, fonts, isBd);

  // Footer on last page
  doc.font(fonts.regular).fontSize(7).fillColor('#94a3b8').text(`Bangladesh Pet Association | Reference ID: ${purchase.id}`, left, doc.page.height - 30, { align: 'center', width });

  doc.end();
}
