import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Response } from 'express';
import { config } from '../../config';

type Numeric = number | string | { toString(): string };

type RegistrationData = {
  bookingNumber: string;
  totalAmountBdt: Numeric;
  status: string;
  createdAt: Date;
  staffQrToken?: string | null;
  campaign: { title: string; basePriceBdt: Numeric } | null;
  session: {
    sessionDate: string | Date;
    startTime: string;
    endTime: string;
    venue: { name: string } | null;
  } | null;
  owner: { ownerName: string; mobile: string; email: string | null } | null;
  payment: { status: string; amount: Numeric } | null;
  petBookings: Array<{
    pet: { name: string; petType: string; breed: string | null } | null;
    services: Array<{ campaignService: { name: string } | null }>;
  }>;
};

function paymentStatusLabel(reg: RegistrationData): { text: string; color: [number, number, number] } {
  const ps = reg.payment?.status?.toLowerCase();
  if (ps === 'success' || ps === 'paid' || reg.status === 'paid') {
    // Distinguish: if EPS payment → PAID ONLINE; else PAID AT CENTER
    const hasMerchantTxn = (reg.payment as { merchantTxnId?: string | null } | null)?.merchantTxnId;
    return hasMerchantTxn
      ? { text: 'PAID ONLINE', color: [34, 197, 94] }
      : { text: 'PAID AT CENTER', color: [34, 197, 94] };
  }
  if (reg.status === 'checked_in' || reg.status === 'vaccinated' ||
      reg.status === 'certificate_issued' || reg.status === 'completed') {
    return { text: 'PAID', color: [34, 197, 94] };
  }
  return { text: 'PAY AT CENTER', color: [245, 158, 11] };
}

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmt12(t: string): string {
  if (!t) return '';
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export async function streamBookingSlipPdf(reg: RegistrationData, res: Response): Promise<void> {
  const { text: statusText, color: statusColor } = paymentStatusLabel(reg);
  const amount = Number(String(reg.payment?.amount ?? reg.totalAmountBdt ?? 0));
  const isFree = amount === 0;

  // Build QR code data URI if staffQrToken exists
  let qrDataUri: string | null = null;
  if (reg.staffQrToken) {
    const adminBase = config.ADMIN_BASE_URL.replace(/\/$/, '');
    const qrUrl = `${adminBase}/campaign-scan/${reg.staffQrToken}`;
    try {
      qrDataUri = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 120,
        color: { dark: '#0f2d59', light: '#ffffff' },
      });
    } catch { /* QR generation failure must not break PDF */ }
  }

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: false });
  doc.pipe(res);

  const W = doc.page.width - 100;
  const LEFT = 50;
  const QR_SIZE = 90;

  // ── Header ─────────────────────────────────────────────────────────────────

  doc.rect(0, 0, doc.page.width, 8).fill('#16a34a');

  doc.moveDown(0.5);
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .fillColor('#0f2d59')
    .text('Bangladesh Pet Association', LEFT, doc.y, { align: 'center', width: W });

  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#6b7280')
    .text('www.bangladeshpetassociation.com', { align: 'center', width: W });

  doc.moveDown(0.3);
  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .fillColor('#16a34a')
    .text('VACCINATION CAMPAIGN BOOKING SLIP', { align: 'center', width: W });

  doc.moveDown(0.4);
  doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
  doc.moveDown(0.5);

  // ── Booking Reference + QR ─────────────────────────────────────────────────

  const refBoxY = doc.y;
  const refBoxH = qrDataUri ? Math.max(70, QR_SIZE + 20) : 70;
  doc.rect(LEFT, refBoxY, W, refBoxH).fillColor('#f0fdf4').fill();
  doc.rect(LEFT, refBoxY, W, refBoxH).strokeColor('#bbf7d0').lineWidth(1).stroke();

  // Booking ref text (left side)
  doc
    .fontSize(9).font('Helvetica-Bold').fillColor('#6b7280')
    .text('BOOKING REFERENCE', LEFT + 16, refBoxY + 12, { characterSpacing: 1.5 });
  doc
    .fontSize(20).font('Helvetica-Bold').fillColor('#0f2d59')
    .text(reg.bookingNumber, LEFT + 16, refBoxY + 26, { characterSpacing: 1.5 });

  // Payment status badge (below ref text)
  const badgeW = 130;
  const badgeX = LEFT + 16;
  const badgeY = refBoxY + 50;
  doc.rect(badgeX, badgeY, badgeW, 16).fillColor(statusColor).fill();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
    .text(statusText, badgeX, badgeY + 4, { width: badgeW, align: 'center' });

  // QR code (right side)
  if (qrDataUri) {
    const qrX = LEFT + W - QR_SIZE - 10;
    const qrY = refBoxY + 5;
    const qrImgBuffer = Buffer.from(qrDataUri.split(',')[1]!, 'base64');
    doc.image(qrImgBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });
    doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
      .text('Staff Scan QR', qrX, qrY + QR_SIZE + 2, { width: QR_SIZE, align: 'center' });
  }

  doc.y = refBoxY + refBoxH + 8;

  // ── Campaign ───────────────────────────────────────────────────────────────

  if (reg.campaign) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f2d59')
      .text(reg.campaign.title, LEFT, doc.y, { width: W });
    doc.moveDown(0.4);
  }

  // ── Info sections ──────────────────────────────────────────────────────────

  function sectionLabel(label: string) {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af')
      .text(label.toUpperCase(), LEFT, doc.y, { characterSpacing: 1.2, width: W });
    doc.moveDown(0.1);
  }

  function infoRow(label: string, value: string, indent = 0) {
    doc
      .fontSize(10).font('Helvetica-Bold').fillColor('#374151')
      .text(label + ':', LEFT + indent, doc.y, { continued: true, width: 120 })
      .font('Helvetica').fillColor('#111827')
      .text('  ' + (value || '—'), { width: W - 120 - indent });
  }

  doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  if (reg.owner) {
    sectionLabel('Owner');
    infoRow('Name', reg.owner.ownerName);
    infoRow('Mobile', reg.owner.mobile);
    if (reg.owner.email) infoRow('Email', reg.owner.email);
    doc.moveDown(0.4);
  }

  if (reg.session) {
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.4);
    sectionLabel('Appointment');
    infoRow('Venue', reg.session.venue?.name ?? '—');
    infoRow('Date', fmtDate(reg.session.sessionDate));
    infoRow('Time', `${fmt12(reg.session.startTime)} – ${fmt12(reg.session.endTime)}`);
    doc.moveDown(0.4);
  }

  if (reg.petBookings.length > 0) {
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.4);
    sectionLabel(`Pets (${reg.petBookings.length})`);

    for (const pb of reg.petBookings) {
      if (!pb.pet) continue;
      const petLabel = `${pb.pet.name} — ${capitalize(pb.pet.petType)}${pb.pet.breed ? ', ' + pb.pet.breed : ''}`;
      const serviceNames = pb.services.map(s => s.campaignService?.name).filter(Boolean).join(', ');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f2d59').text(petLabel, LEFT + 8, doc.y);
      if (serviceNames) {
        doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text('Services: ' + serviceNames, LEFT + 8, doc.y);
      }
      doc.moveDown(0.2);
    }
    doc.moveDown(0.2);
  }

  doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  sectionLabel('Payment');

  const amountText = isFree ? 'Free (No charge)' : `BDT ${amount.toLocaleString('en-BD')} /-`;
  infoRow('Amount', amountText);
  infoRow('Status', statusText.includes('PAID') ? statusText : 'Pay at vaccination center');
  doc.moveDown(0.8);

  // ── Instructions ───────────────────────────────────────────────────────────

  const isPaid = statusText.includes('PAID');
  const instrLines = isPaid ? 2 : 3;
  const instrH = 14 + instrLines * 20;
  const instrY = doc.y;

  doc.rect(LEFT, instrY, W, instrH).fillColor('#fffbeb').fill();
  doc.rect(LEFT, instrY, W, instrH).strokeColor('#fde68a').lineWidth(1).stroke();
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#92400e')
    .text('IMPORTANT INSTRUCTIONS', LEFT + 14, instrY + 8, { characterSpacing: 1 });

  doc.y = instrY + 20;
  doc.fontSize(8.5).font('Helvetica').fillColor('#78350f');

  doc.text(
    'EN: Bring this booking slip or booking reference to the vaccination center.',
    LEFT + 14, doc.y, { width: W - 28 },
  );
  doc.moveDown(0.25);
  doc.text(
    'BN: ভ্যাকসিনেশন সেন্টারে আসার সময় এই বুকিং স্লিপ বা বুকিং রেফারেন্স সঙ্গে রাখুন।',
    LEFT + 14, doc.y, { width: W - 28 },
  );
  if (!isPaid) {
    doc.moveDown(0.25);
    doc.text(
      `Amount payable at center: ${amountText}`,
      LEFT + 14, doc.y, { width: W - 28 },
    );
  }

  doc.moveDown(1.0);

  // ── Footer ─────────────────────────────────────────────────────────────────

  doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  const issuedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
    .text(`Issued: ${issuedAt}`, LEFT, doc.y, { continued: true, width: W / 2 })
    .text('Bangladesh Pet Association — Official Booking Slip', { align: 'right', width: W / 2 });

  doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill('#16a34a');

  doc.end();
}
