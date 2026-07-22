import type { Prisma } from '@prisma/client';
import type { certificateInclude } from './campaign-certificates.repository';

type CertificateWithRelations = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>;

const PET_ICON: Record<string, string> = {
  dog: '🐕',
  cat: '🐈',
  bird: '🐦',
  rabbit: '🐇',
  other: '🐾',
};

export function renderCertificateHtml(cert: CertificateWithRelations): string {
  const pb = cert.petBooking;
  const pet = pb.pet;
  const owner = pet.owner;
  const campaign = pb.registration.campaign;
  const venue = pb.session.venue;
  const sessionDate = new Date(pb.session.sessionDate).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const issuedDate = new Date(cert.issuedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const vaccineRows = pb.vaccinationRecords
    .map(vr => {
      const adminDate = new Date(vr.administeredAt).toLocaleDateString('en-GB');
      const nextDue = vr.nextDueDate
        ? new Date(vr.nextDueDate).toLocaleDateString('en-GB')
        : '—';
      const doctor = vr.doctor?.name ?? '—';
      return `
        <tr>
          <td>${vr.vaccineName}</td>
          <td>${vr.batchNumber ?? '—'}</td>
          <td>${adminDate}</td>
          <td>${nextDue}</td>
          <td>${doctor}</td>
        </tr>`;
    })
    .join('');

  const petIcon = PET_ICON[pet.petType] ?? '🐾';
  const verifyUrl = `${process.env.FRONTEND_URL ?? 'https://bpa.org.bd'}/verify/certificate/${cert.verifyToken}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Vaccination Certificate – ${cert.certificateNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; }
  .page { max-width: 800px; margin: 20px auto; background: #fff; border: 2px solid #1a5276; padding: 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a5276; padding-bottom: 20px; margin-bottom: 24px; }
  .logo-block h1 { color: #1a5276; font-size: 22px; font-weight: 700; }
  .logo-block p { color: #555; font-size: 13px; }
  .cert-title { text-align: center; margin-bottom: 24px; }
  .cert-title h2 { font-size: 26px; color: #1a5276; letter-spacing: 1px; text-transform: uppercase; }
  .cert-title .cert-num { color: #888; font-size: 13px; margin-top: 4px; font-family: monospace; }
  .section { margin-bottom: 20px; }
  .section h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #1a5276; border-bottom: 1px solid #dce9f3; padding-bottom: 6px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
  .field label { font-size: 11px; color: #999; text-transform: uppercase; display: block; }
  .field span { font-size: 14px; color: #222; font-weight: 500; }
  .pet-icon { font-size: 32px; margin-right: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #1a5276; color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f8fbfd; }
  .footer { margin-top: 30px; border-top: 2px solid #1a5276; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .qr-note { font-size: 11px; color: #888; max-width: 300px; }
  .issued-block { text-align: right; font-size: 12px; color: #555; }
  .issued-block strong { display: block; font-size: 14px; color: #222; }
  .superseded-banner { background: #ffd700; padding: 8px 16px; text-align: center; font-weight: bold; color: #5a4000; margin-bottom: 16px; }
  @media print { body { background: none; } .page { margin: 0; border: none; padding: 20px; } }
</style>
</head>
<body>
<div class="page">
  ${cert.supersededAt ? '<div class="superseded-banner">⚠ This certificate has been superseded. Please obtain the latest reissued certificate.</div>' : ''}
  <div class="header">
    <div class="logo-block">
      <h1>Bangladesh Pet Association</h1>
      <p>BPA – Promoting Animal Welfare Since 2010</p>
    </div>
    <div style="text-align:right; font-size:12px; color:#888;">
      <div>Certificate No.</div>
      <div style="font-family:monospace; font-size:14px; color:#1a5276; font-weight:700;">${cert.certificateNumber}</div>
      <div style="margin-top:4px;">Issued: ${issuedDate}</div>
    </div>
  </div>

  <div class="cert-title">
    <h2>${petIcon} Vaccination Certificate</h2>
    <div class="cert-num">Campaign: ${campaign.title}</div>
  </div>

  <div class="section">
    <h3>Pet Information</h3>
    <div class="grid">
      <div class="field"><label>Pet Name</label><span>${pet.name}</span></div>
      <div class="field"><label>Species</label><span style="text-transform:capitalize">${pet.petType}${pet.breed ? ` (${pet.breed})` : ''}</span></div>
      <div class="field"><label>Gender</label><span style="text-transform:capitalize">${pet.gender}</span></div>
      <div class="field"><label>Approximate Age</label><span>${pet.approxAge ? `${pet.approxAge} months` : '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <h3>Owner Information</h3>
    <div class="grid">
      <div class="field"><label>Owner Name</label><span>${owner.ownerName}</span></div>
      <div class="field"><label>Mobile</label><span>${owner.mobile}</span></div>
    </div>
  </div>

  <div class="section">
    <h3>Campaign &amp; Session</h3>
    <div class="grid">
      <div class="field"><label>Campaign</label><span>${campaign.title}</span></div>
      <div class="field"><label>Session Date</label><span>${sessionDate}</span></div>
      <div class="field"><label>Venue</label><span>${venue?.name ?? '—'}</span></div>
      <div class="field"><label>Address</label><span>${venue?.address ?? '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <h3>Vaccination Details</h3>
    ${vaccineRows
      ? `<table>
          <thead><tr><th>Vaccine</th><th>Batch #</th><th>Administered</th><th>Next Due</th><th>Doctor</th></tr></thead>
          <tbody>${vaccineRows}</tbody>
        </table>`
      : '<p style="color:#888;font-size:13px">No vaccination records found.</p>'}
  </div>

  <div class="footer">
    <div class="qr-note">
      <strong>Verify this certificate</strong><br/>
      Scan the QR code or visit:<br/>
      <span style="font-family:monospace;font-size:11px;word-break:break-all">${verifyUrl}</span>
    </div>
    <div class="issued-block">
      <div>Issued by: <strong>${cert.issuedBy.name}</strong></div>
      <div style="margin-top:6px">Bangladesh Pet Association</div>
    </div>
  </div>
</div>
</body>
</html>`;
}
