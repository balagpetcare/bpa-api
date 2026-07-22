import { prisma } from '../../database/prisma';
import type { ParticipantsListQuery } from './participants.types';

interface FlatParticipantRow {
  campaignId: string;
  campaignTitle: string;
  registrationId: string;
  bookingReference: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  fullAddress: string;
  petName: string;
  species: string;
  breed: string;
  age: string;
  sex: string;
  sessionDate: string;
  sessionTime: string;
  venue: string;
  paymentStatus: string;
  paymentAmount: string;
  gateway: string;
  transactionId: string;
  paymentCreatedAt: string;
  paymentUpdatedAt: string;
  checkInStatus: string;
  vaccinationStatus: string;
  certificateNumber: string;
  smsSentStatus: string;
  notes: string;
}

function buildWhereSql(campaignId: string, query: ParticipantsListQuery): { sql: string; params: any[] } {
  const conditions: string[] = ['cr.campaign_id = $1::uuid'];
  const params: any[] = [campaignId];
  let idx = 2;

  if (query.search) {
    conditions.push(`(cr.booking_number ILIKE $${idx} OR po.owner_name ILIKE $${idx} OR po.mobile ILIKE $${idx} OR po.email ILIKE $${idx} OR p.merchant_txn_id ILIKE $${idx} OR p.eps_txn_id ILIKE $${idx})`);
    params.push(`%${query.search}%`);
    idx++;
  }
  if (query.paymentStatus) {
    conditions.push(`p.status = $${idx}`);
    params.push(query.paymentStatus);
    idx++;
  }
  if (query.registrationStatus) {
    conditions.push(`cr.status = $${idx}`);
    params.push(query.registrationStatus);
    idx++;
  }
  if (query.sessionId) {
    conditions.push(`cr.session_id = $${idx}::uuid`);
    params.push(query.sessionId);
    idx++;
  }
  if (query.venueId) {
    conditions.push(`cs.venue_id = $${idx}::uuid`);
    params.push(query.venueId);
    idx++;
  }
  if (query.dateFrom) {
    conditions.push(`cr.created_at >= $${idx}::timestamp`);
    params.push(query.dateFrom);
    idx++;
  }
  if (query.dateTo) {
    conditions.push(`cr.created_at <= $${idx}::timestamp`);
    params.push(query.dateTo);
    idx++;
  }

  return { sql: conditions.join(' AND '), params };
}

async function fetchFlatRows(campaignId: string, query: ParticipantsListQuery): Promise<FlatParticipantRow[]> {
  const { sql, params } = buildWhereSql(campaignId, query);

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
    SELECT
      cr.id AS registration_id,
      cr.booking_number,
      cr.status AS reg_status,
      cr.total_amount_bdt,
      cr.notes,
      cr.created_at AS reg_created_at,
      c.id AS campaign_id,
      c.title AS campaign_title,
      po.owner_name,
      po.mobile,
      po.email,
      po.address,
      p.name AS pet_name,
      p.pet_type,
      p.breed,
      p.approx_age,
      p.gender,
      pb.checked_in_at,
      pb.vaccinated_at,
      cs.session_date,
      cs.start_time,
      cs.end_time,
      v.name AS venue_name,
      pay.status AS payment_status,
      pay.amount AS payment_amount,
      pay.gateway,
      pay.merchant_txn_id,
      pay.eps_txn_id,
      pay.created_at AS payment_created_at,
      pay.updated_at AS payment_updated_at,
      cert.certificate_number,
      sms.sent_at IS NOT NULL AS sms_sent
    FROM campaign_registrations cr
    INNER JOIN campaigns c ON c.id = cr.campaign_id
    INNER JOIN pet_owners po ON po.id = cr.owner_id
    INNER JOIN pet_bookings pb ON pb.registration_id = cr.id
    INNER JOIN pets p ON p.id = pb.pet_id
    INNER JOIN campaign_sessions cs ON cs.id = cr.session_id
    INNER JOIN venues v ON v.id = cs.venue_id
    LEFT JOIN payments pay ON pay.id = cr.payment_id
    LEFT JOIN certificates cert ON cert.pet_booking_id = pb.id
    LEFT JOIN sms_logs sms ON sms.entity_id = cr.id AND sms.module = 'campaign_registration'
    WHERE ${sql}
    ORDER BY cr.created_at DESC
  `, ...params);

  return rows.map((r: any) => ({
    campaignId: String(r.campaign_id || ''),
    campaignTitle: String(r.campaign_title || ''),
    registrationId: String(r.registration_id || ''),
    bookingReference: String(r.booking_number || ''),
    ownerName: String(r.owner_name || ''),
    ownerPhone: String(r.mobile || ''),
    ownerEmail: String(r.email || ''),
    fullAddress: String(r.address || ''),
    petName: String(r.pet_name || ''),
    species: String(r.pet_type || ''),
    breed: String(r.breed || ''),
    age: r.approx_age != null ? String(r.approx_age) : '',
    sex: String(r.gender || ''),
    sessionDate: r.session_date ? new Date(r.session_date).toISOString().split('T')[0] : '',
    sessionTime: `${r.start_time || ''} - ${r.end_time || ''}`,
    venue: String(r.venue_name || ''),
    paymentStatus: String(r.payment_status || ''),
    paymentAmount: r.payment_amount != null ? Number(r.payment_amount).toFixed(2) : '0.00',
    gateway: String(r.gateway || ''),
    transactionId: String(r.eps_txn_id || r.merchant_txn_id || ''),
    paymentCreatedAt: r.payment_created_at ? new Date(r.payment_created_at).toISOString() : '',
    paymentUpdatedAt: r.payment_updated_at ? new Date(r.payment_updated_at).toISOString() : '',
    checkInStatus: r.checked_in_at ? 'CHECKED_IN' : 'PENDING',
    vaccinationStatus: r.vaccinated_at ? 'VACCINATED' : 'PENDING',
    certificateNumber: String(r.certificate_number || ''),
    smsSentStatus: r.sms_sent ? 'SENT' : 'PENDING',
    notes: String(r.notes || ''),
  }));
}

export async function generateCsv(campaignId: string, query: ParticipantsListQuery): Promise<string> {
  const rows = await fetchFlatRows(campaignId, query);
  const headers = [
    'Campaign ID', 'Campaign Title', 'Registration ID', 'Booking Reference',
    'Owner Name', 'Owner Phone', 'Owner Email', 'Full Address',
    'Pet Name', 'Species', 'Breed', 'Age', 'Sex',
    'Session Date', 'Session Time', 'Venue',
    'Payment Status', 'Payment Amount', 'Gateway', 'Transaction ID',
    'Payment Created At', 'Payment Updated At',
    'Check-in Status', 'Vaccination Status', 'Certificate Number',
    'SMS Sent Status', 'Notes',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    const row = [
      escapeCsv(r.campaignId), escapeCsv(r.campaignTitle), escapeCsv(r.registrationId), escapeCsv(r.bookingReference),
      escapeCsv(r.ownerName), escapeCsv(r.ownerPhone), escapeCsv(r.ownerEmail), escapeCsv(r.fullAddress),
      escapeCsv(r.petName), escapeCsv(r.species), escapeCsv(r.breed), escapeCsv(r.age), escapeCsv(r.sex),
      escapeCsv(r.sessionDate), escapeCsv(r.sessionTime), escapeCsv(r.venue),
      escapeCsv(r.paymentStatus), escapeCsv(r.paymentAmount), escapeCsv(r.gateway), escapeCsv(r.transactionId),
      escapeCsv(r.paymentCreatedAt), escapeCsv(r.paymentUpdatedAt),
      escapeCsv(r.checkInStatus), escapeCsv(r.vaccinationStatus), escapeCsv(r.certificateNumber),
      escapeCsv(r.smsSentStatus), escapeCsv(r.notes),
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function escapeCsv(val: string): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function generateExcel(campaignId: string, query: ParticipantsListQuery): Promise<Buffer> {
  const XLSX = require('xlsx');
  const rows = await fetchFlatRows(campaignId, query);

  // Participants sheet
  const participantSheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
    'Campaign ID': r.campaignId,
    'Campaign Title': r.campaignTitle,
    'Registration ID': r.registrationId,
    'Booking Ref': r.bookingReference,
    'Owner Name': r.ownerName,
    'Phone': r.ownerPhone,
    'Email': r.ownerEmail,
    'Address': r.fullAddress,
    'Pet Name': r.petName,
    'Species': r.species,
    'Breed': r.breed,
    'Age': r.age,
    'Sex': r.sex,
    'Session Date': r.sessionDate,
    'Session Time': r.sessionTime,
    'Venue': r.venue,
    'Payment Status': r.paymentStatus,
    'Amount': r.paymentAmount,
    'Gateway': r.gateway,
    'Transaction ID': r.transactionId,
    'Payment Created': r.paymentCreatedAt,
    'Payment Updated': r.paymentUpdatedAt,
    'Check-in': r.checkInStatus,
    'Vaccination': r.vaccinationStatus,
    'Certificate': r.certificateNumber,
    'SMS': r.smsSentStatus,
    'Notes': r.notes,
  })));

  // Failed payments sheet
  const failedRows = rows.filter((r) => r.paymentStatus === 'failed' || r.paymentStatus === 'cancelled');
  const failedSheet = XLSX.utils.json_to_sheet(failedRows.map((r) => ({
    'Booking Ref': r.bookingReference,
    'Owner Name': r.ownerName,
    'Phone': r.ownerPhone,
    'Amount': r.paymentAmount,
    'Status': r.paymentStatus,
    'Gateway': r.gateway,
    'Transaction ID': r.transactionId,
  })));

  // Paid participants sheet
  const paidRows = rows.filter((r) => r.paymentStatus === 'success' || r.paymentStatus === 'paid');
  const paidSheet = XLSX.utils.json_to_sheet(paidRows.map((r) => ({
    'Booking Ref': r.bookingReference,
    'Owner Name': r.ownerName,
    'Phone': r.ownerPhone,
    'Amount': r.paymentAmount,
    'Transaction ID': r.transactionId,
  })));

  // Session summary
  const sessionMap: Record<string, { date: string; venue: string; count: number; paid: number; total: number }> = {};
  for (const r of rows) {
    const key = `${r.sessionDate}|${r.venue}`;
    if (!sessionMap[key]) {
      sessionMap[key] = { date: r.sessionDate, venue: r.venue, count: 0, paid: 0, total: 0 };
    }
    sessionMap[key].count++;
    if (r.paymentStatus === 'success') {
      sessionMap[key].paid++;
      sessionMap[key].total += parseFloat(r.paymentAmount) || 0;
    }
  }
  const sessionSheet = XLSX.utils.json_to_sheet(Object.values(sessionMap).map((s) => ({
    'Session Date': s.date,
    'Venue': s.venue,
    'Registrations': s.count,
    'Paid': s.paid,
    'Total Amount (BDT)': s.total.toFixed(2),
  })));

  // Summary sheet
  const totalPaid = rows.filter((r) => r.paymentStatus === 'success').length;
  const totalFailed = rows.filter((r) => r.paymentStatus === 'failed' || r.paymentStatus === 'cancelled').length;
  const totalPending = rows.filter((r) => !r.paymentStatus || r.paymentStatus === 'pending').length;
  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.paymentAmount) || 0), 0);
  const summaryData = [
    { Metric: 'Total Registrations', Value: rows.length },
    { Metric: 'Total Paid', Value: totalPaid },
    { Metric: 'Total Failed', Value: totalFailed },
    { Metric: 'Total Pending', Value: totalPending },
    { Metric: 'Total Collected (BDT)', Value: totalAmount.toFixed(2) },
    { Metric: 'Total Pets', Value: rows.length },
    { Metric: 'Checked In', Value: rows.filter((r) => r.checkInStatus === 'CHECKED_IN').length },
    { Metric: 'Vaccinated', Value: rows.filter((r) => r.vaccinationStatus === 'VACCINATED').length },
    { Metric: 'Certificates Issued', Value: rows.filter((r) => r.certificateNumber).length },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, participantSheet, 'Participants');
  XLSX.utils.book_append_sheet(wb, failedSheet, 'Failed Payments');
  XLSX.utils.book_append_sheet(wb, paidSheet, 'Paid Participants');
  XLSX.utils.book_append_sheet(wb, sessionSheet, 'Session Summary');

  // Column widths
  const wscols = [{ wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  participantSheet['!cols'] = wscols;

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
