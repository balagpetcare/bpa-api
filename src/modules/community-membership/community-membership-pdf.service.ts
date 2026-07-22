/**
 * PDF Generation for Community Care Membership Cards
 *
 * Uses Puppeteer for HTML → PDF with full Bangla font support.
 * Falls back to a basic inline template when admin templates are empty.
 */
import { prisma } from '../../database/prisma';
import { config } from '../../config';
import { uploadBufferToStorage } from '../../storage/storage.service';
import * as repo from './community-membership.repository';

// ─── Template Helpers ────────────────────────────────────────────

async function getDocumentContent(docType: string): Promise<{ en: string; bn: string }> {
  const doc = await repo.getActiveDocument(docType);
  return { en: doc?.contentEn ?? '', bn: doc?.contentBn ?? '' };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Build HTML Template ─────────────────────────────────────────

async function buildPdfHtml(purchaseId: string): Promise<string> {
  const purchase = await prisma.communityMembershipPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      tier: true,
      card: true,
    },
  });
  if (!purchase || !purchase.card) throw new Error('Purchase or card not found');

  const card = purchase.card;
  const tier = purchase.tier;
  const qrVerifyUrl = `${config.FRONTEND_URL}/verify/care-card/${card.qrToken}`;

  // Get document templates
  const terms = await getDocumentContent('terms_and_conditions');
  const policy = await getDocumentContent('refund_policy');
  const welcome = await getDocumentContent('welcome_letter');
  const servicePolicy = await getDocumentContent('service_availability_policy');
  const discountPolicy = await getDocumentContent('discount_policy');

  // Get tier benefits
  const tierBenefits = await prisma.communityTierBenefitMapping.findMany({
    where: { tierId: tier.id },
    include: { benefit: true },
  });

  // Get service discounts
  const discounts = await prisma.communityTierServiceDiscount.findMany({
    where: { tierId: tier.id, isActive: true },
    include: { service: true },
  });

  const benefitRows = tierBenefits
    .map((b) => `<tr><td>${b.benefit.icon ? `${b.benefit.icon} ` : ''}${b.benefit.titleEn}</td><td>${b.benefit.titleBn}</td></tr>`)
    .join('');

  const discountRows = discounts
    .map((d) => {
      const val = d.discountType === 'PERCENTAGE' ? `${Number(d.discountValue)}%` : `৳${Number(d.discountValue)}`;
      return `<tr><td>${d.service.nameEn}</td><td>${d.service.nameBn}</td><td>${val}</td></tr>`;
    })
    .join('');

  const now = new Date();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Noto Sans Bengali', 'Segoe UI', Arial, sans-serif;
  font-size: 11pt;
  color: #1a2540;
  padding: 30px;
}
.header { text-align: center; border-bottom: 3px solid #1a6b3c; padding-bottom: 15px; margin-bottom: 20px; }
.header h1 { color: #1a6b3c; font-size: 18pt; margin-bottom: 4px; }
.header h2 { color: #145530; font-size: 14pt; }
.header p { color: #666; font-size: 9pt; }
.card-section { background: #f0f9f0; border: 2px solid #1a6b3c; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
.card-section h3 { color: #1a6b3c; margin-bottom: 10px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.info-grid .label { font-weight: 700; color: #555; }
.info-grid .value { color: #1a2540; }
.qr-area { text-align: center; margin: 15px 0; }
.qr-area a { color: #1a6b3c; word-break: break-all; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 10pt; }
th { background: #1a6b3c; color: white; }
tr:nth-child(even) { background: #f9f9f9; }
.section { margin-bottom: 18px; }
.section h3 { color: #1a6b3c; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; font-size: 13pt; }
.content-block { line-height: 1.6; color: #333; font-size: 10pt; }
.bn { direction: rtl; text-align: right; font-family: 'Noto Sans Bengali', sans-serif; }
.footer { text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ccc; font-size: 9pt; color: #888; }
.signature { margin-top: 20px; }
.signature .line { border-top: 1px solid #333; width: 250px; margin-top: 30px; padding-top: 4px; font-size: 10pt; }
.page-break { page-break-before: always; }
</style>
</head>
<body>

<div class="header">
  <h1>BANGLADESH PET ASSOCIATION</h1>
  <h2>Community Care Partnership Program</h2>
  <p>বাংলাদেশ পেট অ্যাসোসিয়েশন — কমিউনিটি কেয়ার পার্টনারশিপ প্রোগ্রাম</p>
  <p>Document Generated: ${formatDate(now)}</p>
</div>

<div class="card-section">
  <h3>Membership Card / সদস্যপদ কার্ড</h3>
  <div class="info-grid">
    <span class="label">Card Number:</span><span class="value">${card.cardNumber}</span>
    <span class="label">Member Name:</span><span class="value">${purchase.memberName}</span>
    <span class="label">Tier:</span><span class="value">${tier.nameEn} (${tier.nameBn})</span>
    <span class="label">Amount Paid:</span><span class="value">৳${Number(purchase.amountBdt).toLocaleString()}</span>
    <span class="label">Pet Limit:</span><span class="value">${purchase.petLimit} pets</span>
    <span class="label">Valid From:</span><span class="value">${purchase.startsAt ? formatDate(purchase.startsAt) : '-'}</span>
    <span class="label">Valid Until:</span><span class="value">${purchase.expiresAt ? formatDate(purchase.expiresAt) : '-'}</span>
    <span class="label">Status:</span><span class="value" style="color:#1a6b3c;font-weight:700;">${card.status.toUpperCase()}</span>
  </div>
  <div class="qr-area">
    <p style="font-size:9pt;color:#666;">Scan to verify your membership card</p>
    <p style="font-size:8pt;"><a href="${qrVerifyUrl}">${qrVerifyUrl}</a></p>
  </div>
</div>

${welcome.en || welcome.bn ? `<div class="section">
  <h3>Welcome / স্বাগতম</h3>
  ${welcome.en ? `<div class="content-block">${welcome.en.replace(/\n/g, '<br>')}</div>` : ''}
  ${welcome.bn ? `<div class="content-block bn">${welcome.bn.replace(/\n/g, '<br>')}</div>` : ''}
</div>` : ''}

<div class="section">
  <h3>Tier Benefits / টিয়ার সুবিধা</h3>
  <table>
    <tr><th>Benefit (English)</th><th>সুবিধা (বাংলা)</th></tr>
    ${benefitRows || '<tr><td colspan="2">Standard benefits apply</td></tr>'}
  </table>
</div>

<div class="section">
  <h3>Service Discounts / পরিষেবা ছাড়</h3>
  <table>
    <tr><th>Service</th><th>পরিষেবা</th><th>Discount</th></tr>
    ${discountRows || '<tr><td colspan="3">Discounts may apply at time of service</td></tr>'}
  </table>
</div>

${terms.en || terms.bn ? `<div class="page-break"></div>
<div class="section">
  <h3>Terms & Conditions / শর্তাবলী</h3>
  ${terms.en ? `<div class="content-block">${terms.en.replace(/\n/g, '<br>')}</div>` : ''}
  ${terms.bn ? `<div class="content-block bn">${terms.bn.replace(/\n/g, '<br>')}</div>` : ''}
</div>` : ''}

${policy.en || policy.bn ? `<div class="section">
  <h3>Refund Policy / ফেরত নীতি</h3>
  ${policy.en ? `<div class="content-block">${policy.en.replace(/\n/g, '<br>')}</div>` : ''}
  ${policy.bn ? `<div class="content-block bn">${policy.bn.replace(/\n/g, '<br>')}</div>` : ''}
</div>` : ''}

${servicePolicy.en || servicePolicy.bn ? `<div class="section">
  <h3>Service Availability / পরিষেবার প্রাপ্যতা</h3>
  ${servicePolicy.en ? `<div class="content-block">${servicePolicy.en.replace(/\n/g, '<br>')}</div>` : ''}
  ${servicePolicy.bn ? `<div class="content-block bn">${servicePolicy.bn.replace(/\n/g, '<br>')}</div>` : ''}
</div>` : ''}

${discountPolicy.en || discountPolicy.bn ? `<div class="section">
  <h3>Discount Policy / ডিসকাউন্ট নীতি</h3>
  ${discountPolicy.en ? `<div class="content-block">${discountPolicy.en.replace(/\n/g, '<br>')}</div>` : ''}
  ${discountPolicy.bn ? `<div class="content-block bn">${discountPolicy.bn.replace(/\n/g, '<br>')}</div>` : ''}
</div>` : ''}

<div class="section signature">
  <h3>Authorized Signature / অনুমোদিত স্বাক্ষর</h3>
  <div class="line">Authorized Officer — Bangladesh Pet Association</div>
</div>

<div class="footer">
  <p>Bangladesh Pet Association | www.bpa.community</p>
  <p>Card: ${card.cardNumber} | Version: 1.0</p>
  <p>This document was generated on ${formatDate(now)}. Verify at: ${qrVerifyUrl}</p>
</div>

</body>
</html>`;
}

// ─── Generate PDF ────────────────────────────────────────────────

export async function generateMembershipPdf(purchaseId: string) {
  try {
    const html = await buildPdfHtml(purchaseId);
    const puppeteer = await import('puppeteer');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
      preferCSSPageSize: true,
    }));

    await browser.close();

    // Upload to storage
    const filename = `membership-${purchaseId.slice(0, 8)}-${Date.now()}.pdf`;
    const result = await uploadBufferToStorage(pdfBuffer, filename, 'application/pdf');

    // Save the document key
    const purchase = await prisma.communityMembershipPurchase.findUnique({
      where: { id: purchaseId },
      include: { card: true },
    });
    if (purchase?.card) {
      await prisma.communityMembershipCard.update({
        where: { id: purchase.card.id },
        data: { pdfDocumentKey: result.objectKey },
      });
    }

    return result;
  } catch (err) {
    console.error('[Membership PDF] Generation error:', err);
    return null;
  }
}
