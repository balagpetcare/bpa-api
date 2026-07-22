import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { writeAuditLog } from '../../utils/audit';
import { AuditAction, CampaignRegistrationStatus } from '@prisma/client';
import * as certSvc from '../campaign-certificates/campaign-certificates.service';
import { config } from '../../config';
import type { QrVerifyDto, CheckInDto, VaccinationCompleteDto, IssueCertificateDto, ScanLogsQuery } from './campaign-field-ops.types';

// ─── QR Scan Result codes ─────────────────────────────────────────

const SCAN_RESULT = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
  ALREADY_VACCINATED: 'ALREADY_VACCINATED',
  EXPIRED: 'EXPIRED',
  WRONG_SESSION: 'WRONG_SESSION',
  CANCELLED: 'CANCELLED',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────

function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  if (phone.length <= 6) return '***';
  return phone.slice(0, 4) + '*'.repeat(phone.length - 7) + phone.slice(-3);
}

function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  if (name.length <= 2) return `*@${domain}`;
  return name.slice(0, 1) + '*'.repeat(name.length - 2) + name.slice(-1) + '@' + domain;
}

async function resolveRegistration(token: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const include = {
    campaign: true,
    session: { include: { venue: true } },
    owner: true,
    payment: true,
    petBookings: {
      include: {
        pet: true,
        services: { include: { campaignService: true } },
        certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } },
        vaccinationRecords: { orderBy: { administeredAt: 'desc' as const }, take: 1, select: {
          id: true,
          vaccineName: true,
          batchNumber: true,
          administeredAt: true,
          nextDueDate: true,
          doctorId: true,
          notes: true,
          createdAt: true,
          doctor: { select: { id: true, name: true, licenseNumber: true, specialization: true } },
        } },
      },
    },
  };

  let reg = await prisma.campaignRegistration.findFirst({
    where: { OR: [{ staffQrToken: token }, { bookingNumber: token }, ...(isUuid ? [{ id: token }] : [])] },
    include,
  });
  if (reg) return reg;

  const pb = await prisma.petBooking.findFirst({
    where: { OR: [{ qrToken: token }, ...(isUuid ? [{ id: token }] : [])] },
    select: { registrationId: true },
  });
  if (pb) {
    reg = await prisma.campaignRegistration.findUnique({ where: { id: pb.registrationId }, include });
  }
  return reg;
}

async function resolveSigningDoctor(campaignId: string, sessionId?: string | null, explicitDoctorId?: string | null) {
  if (explicitDoctorId) {
    const doc = await prisma.doctor.findUnique({ where: { id: explicitDoctorId } });
    if (doc && doc.isActive) return doc;
  }

  // Priority 1: session signing doctor
  if (sessionId) {
    const sessionDoc = await prisma.campaignDoctor.findFirst({
      where: { campaignId, sessionId, isSigningDoctor: true, isActive: true },
      include: { doctor: true },
    });
    if (sessionDoc?.doctor) return sessionDoc.doctor;
  }

  // Priority 2: campaign default signing doctor (no session)
  const campaignDoc = await prisma.campaignDoctor.findFirst({
    where: { campaignId, sessionId: null, isSigningDoctor: true, isActive: true },
    include: { doctor: true },
  });
  if (campaignDoc?.doctor) return campaignDoc.doctor;

  return null;
}

async function logQrScan(opts: {
  qrToken: string;
  campaignId: string;
  sessionId?: string | null;
  registrationId?: string | null;
  petBookingId?: string | null;
  scannedById: string;
  scanResult: string;
  ipAddress?: string;
  userAgent?: string;
  notes?: string;
}) {
  await prisma.qRScanLog.create({
    data: {
      qrToken: opts.qrToken,
      campaignId: opts.campaignId,
      sessionId: opts.sessionId ?? null,
      registrationId: opts.registrationId ?? null,
      petBookingId: opts.petBookingId ?? null,
      scannedById: opts.scannedById,
      scanResult: opts.scanResult,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      notes: opts.notes ?? null,
    },
  }).catch(() => { /* never block the main flow */ });
}

// ─── QR Verify ───────────────────────────────────────────────────

export async function verifyQR(campaignId: string, dto: QrVerifyDto, actorId: string, ipAddress?: string, userAgent?: string) {
  const token = dto.qrToken || dto.bookingReference!;
  const reg = await resolveRegistration(token);

  if (!reg) {
    await logQrScan({ qrToken: token, campaignId, sessionId: dto.sessionId, scannedById: actorId, scanResult: SCAN_RESULT.INVALID, ipAddress, userAgent });
    throw AppError.notFound('No registration found for this QR code or booking reference.');
  }

  // Cross-campaign guard
  if (reg.campaignId !== campaignId) {
    await logQrScan({ qrToken: token, campaignId, sessionId: dto.sessionId, registrationId: reg.id, scannedById: actorId, scanResult: SCAN_RESULT.WRONG_SESSION, ipAddress, userAgent, notes: 'Wrong campaign' });
    throw AppError.badRequest('This booking does not belong to the current campaign.');
  }

  const paymentOk = reg.payment?.status === 'success' || ['paid', 'checked_in', 'vaccinated', 'certificate_issued', 'completed'].includes(reg.status);
  const cancelled = reg.status === CampaignRegistrationStatus.cancelled;
  const expired = new Date(reg.campaign.endDate) < new Date();
  const wrongSession = dto.sessionId && reg.sessionId !== dto.sessionId;

  let scanResult: string = SCAN_RESULT.VALID;
  if (cancelled) scanResult = SCAN_RESULT.CANCELLED;
  else if (!paymentOk) scanResult = SCAN_RESULT.PAYMENT_PENDING;
  else if (wrongSession) scanResult = SCAN_RESULT.WRONG_SESSION;
  else if (expired) scanResult = SCAN_RESULT.EXPIRED;

  await logQrScan({
    qrToken: token,
    campaignId,
    sessionId: dto.sessionId ?? reg.sessionId,
    registrationId: reg.id,
    petBookingId: reg.petBookings[0]?.id,
    scannedById: actorId,
    scanResult,
    ipAddress,
    userAgent,
  });

  const assignedDoctors = await prisma.campaignDoctor.findMany({
    where: { campaignId, isActive: true },
    include: { doctor: { select: { id: true, name: true, licenseNumber: true, specialization: true, photoUrl: true } } },
  });

  const petBookings = reg.petBookings.map((pb) => {
    const isCheckedIn = pb.checkedInAt != null;
    const isVaccinated = ['vaccinated', 'certificate_issued', 'completed'].includes(pb.status);
    const hasCert = pb.certificates.length > 0;
    const latestVaccine = pb.vaccinationRecords[0] ?? null;

    return {
      id: pb.id,
      pet: pb.pet,
      status: pb.status,
      checkedInAt: pb.checkedInAt,
      vaccinatedAt: pb.vaccinatedAt,
      services: pb.services.map((s) => ({
        id: s.id,
        campaignServiceId: s.campaignServiceId,
        name: s.campaignService?.name,
        isRequired: s.campaignService?.isRequired,
        administered: s.administered,
      })),
      certificate: hasCert ? { id: pb.certificates[0].id, certificateNumber: pb.certificates[0].certificateNumber, verifyToken: pb.certificates[0].verifyToken, issuedAt: pb.certificates[0].issuedAt } : null,
      latestVaccinationRecord: latestVaccine ? { vaccineName: latestVaccine.vaccineName, batchNumber: latestVaccine.batchNumber, administeredAt: latestVaccine.administeredAt, doctor: latestVaccine.doctor } : null,
      allowedActions: {
        canCheckIn: !isCheckedIn && !cancelled && !expired,
        canMarkVaccinated: paymentOk && isCheckedIn && !isVaccinated && !cancelled,
        canIssueCertificate: isVaccinated && !hasCert && !cancelled,
        canResendCertificate: hasCert,
      },
    };
  });

  return {
    scanResult,
    bookingNumber: reg.bookingNumber,
    registrationId: reg.id,
    campaign: { id: reg.campaign.id, title: reg.campaign.title, status: reg.campaign.status },
    session: { id: reg.session.id, sessionDate: reg.session.sessionDate, startTime: reg.session.startTime, endTime: reg.session.endTime, venue: { name: reg.session.venue.name, address: reg.session.venue.address } },
    owner: { id: reg.owner.id, name: reg.owner.ownerName, phoneMasked: maskPhone(reg.owner.mobile), emailMasked: maskEmail(reg.owner.email) },
    paymentStatus: reg.payment?.status ?? 'pending',
    isPaid: paymentOk,
    overallStatus: reg.status,
    petBookings,
    assignedDoctors: assignedDoctors.map((ad) => ad.doctor),
    flags: { cancelled, expired, wrongSession: !!wrongSession, paymentPending: !paymentOk },
  };
}

// ─── Check-In ────────────────────────────────────────────────────

export async function checkIn(campaignId: string, dto: CheckInDto, actorId: string, ipAddress?: string) {
  const token = dto.token ?? dto.registrationId ?? dto.petBookingId!;

  const regInclude = {
    campaign: true,
    session: { include: { venue: true } },
    owner: true,
    payment: true,
    petBookings: { include: { pet: true, services: { include: { campaignService: true } }, certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } } } },
  } as const;

  let reg;
  if (dto.token) {
    reg = await resolveRegistration(dto.token);
  } else if (dto.registrationId) {
    reg = await prisma.campaignRegistration.findUnique({ where: { id: dto.registrationId }, include: regInclude });
  } else if (dto.petBookingId) {
    // Look up registration via petBooking
    const pb = await prisma.petBooking.findUnique({ where: { id: dto.petBookingId }, select: { registrationId: true } });
    if (pb) reg = await prisma.campaignRegistration.findUnique({ where: { id: pb.registrationId }, include: regInclude });
  }

  if (!reg) throw AppError.notFound('Registration not found');
  if (reg.campaignId !== campaignId) throw AppError.badRequest('Registration does not belong to this campaign');
  if (reg.status === CampaignRegistrationStatus.cancelled) throw AppError.badRequest('Cannot check in a cancelled booking');

  // If dto.petBookingId, only check in that specific pet booking
  const targetBookings = dto.petBookingId
    ? reg.petBookings.filter((pb) => pb.id === dto.petBookingId)
    : reg.petBookings;

  if (!targetBookings.length) throw AppError.notFound('Pet booking not found in this registration');

  const now = new Date();
  const checkedInIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const pb of targetBookings) {
      if (pb.checkedInAt && !dto.adminOverride) {
        if (targetBookings.length === 1) throw AppError.conflict('This pet is already checked in');
        continue;
      }
      await tx.petBooking.update({
        where: { id: pb.id },
        data: { status: CampaignRegistrationStatus.checked_in, checkedInAt: now },
      });
      checkedInIds.push(pb.id);
    }

    // Advance registration status
    const allBookings = await tx.petBooking.findMany({ where: { registrationId: reg.id } });
    const anyCheckedIn = allBookings.some((pb) => pb.checkedInAt || checkedInIds.includes(pb.id));
    if (anyCheckedIn && ['pending_payment', 'paid'].includes(reg.status)) {
      await tx.campaignRegistration.update({
        where: { id: reg.id },
        data: { status: CampaignRegistrationStatus.checked_in },
      });
    }
  });

  await writeAuditLog(
    { action: AuditAction.update, resource: 'campaign_check_in', resourceId: reg.id, newValues: { campaignId, checkedInIds, checkedInAt: now, actorId, adminOverride: dto.adminOverride } },
    { actorId, ipAddress },
  );

  await logQrScan({
    qrToken: token,
    campaignId,
    sessionId: dto.sessionId ?? reg.sessionId,
    registrationId: reg.id,
    petBookingId: targetBookings[0]?.id,
    scannedById: actorId,
    scanResult: SCAN_RESULT.ALREADY_CHECKED_IN,
    ipAddress,
    notes: `Checked in ${checkedInIds.length} pet(s)`,
  });

  return { success: true, checkedInPetBookings: checkedInIds, checkedInAt: now };
}

// ─── Vaccination Complete ─────────────────────────────────────────

export async function vaccinationComplete(campaignId: string, dto: VaccinationCompleteDto, actorId: string, ipAddress?: string) {
  const pb = await prisma.petBooking.findUnique({
    where: { id: dto.petBookingId },
    include: {
      registration: { include: { campaign: true, payment: true } },
      pet: true,
      services: { include: { campaignService: true } },
    },
  });

  if (!pb) throw AppError.notFound('Pet booking not found');
  if (pb.registration.campaignId !== campaignId) throw AppError.badRequest('Pet booking does not belong to this campaign');
  if (pb.status === CampaignRegistrationStatus.cancelled) throw AppError.badRequest('Cannot vaccinate a cancelled booking');

  // Payment check
  const paymentOk = pb.registration.payment?.status === 'success' || ['paid', 'checked_in', 'vaccinated', 'certificate_issued', 'completed'].includes(pb.registration.status);
  if (!paymentOk && !dto.adminOverride) {
    throw AppError.badRequest('Payment must be confirmed before marking vaccination complete. Use adminOverride to bypass.');
  }

  // Duplicate vaccination check
  const alreadyVaccinated = ['vaccinated', 'certificate_issued', 'completed'].includes(pb.status);
  if (alreadyVaccinated && !dto.adminOverride) {
    throw AppError.conflict('This pet is already vaccinated. Use adminOverride to record another vaccination.');
  }

  // Resolve vaccine name and service
  let vaccineName = dto.vaccineName ?? 'Vaccine';
  let campaignServiceId = dto.serviceId ?? null;

  if (dto.serviceId) {
    const svc = pb.services.find((s) => s.campaignServiceId === dto.serviceId)?.campaignService;
    if (svc) vaccineName = dto.vaccineName ?? svc.name;
  } else if (!dto.vaccineName) {
    const firstSvc = pb.services[0]?.campaignService;
    if (firstSvc) { vaccineName = firstSvc.name; campaignServiceId = firstSvc.id; }
  }

  // Resolve signing doctor
  const signingDoctor = await resolveSigningDoctor(campaignId, pb.registration.sessionId, dto.signingDoctorId);

  const administeredAt = dto.vaccinatedAt ? new Date(dto.vaccinatedAt) : new Date();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark services as administered
    await tx.petBookingService.updateMany({
      where: { petBookingId: pb.id, ...(campaignServiceId ? { campaignServiceId } : {}) },
      data: { administered: true, administeredAt },
    });

    // Create vaccination record
    await tx.vaccinationRecord.create({
      data: {
        petId: pb.petId,
        petBookingId: pb.id,
        campaignServiceId,
        campaignId,
        vaccineName,
        batchNumber: dto.batchNumber ?? null,
        administeredAt,
        doctorId: signingDoctor?.id ?? null,
        notes: dto.remarks ?? null,
      },
    });

    // Update pet booking status
    await tx.petBooking.update({
      where: { id: pb.id },
      data: { status: CampaignRegistrationStatus.vaccinated, vaccinatedAt: now },
    });

    // Update registration status if all sibling bookings are vaccinated
    const siblings = await tx.petBooking.findMany({ where: { registrationId: pb.registrationId } });
    const allVaccinated = siblings.every((s) =>
      s.id === pb.id || ['vaccinated', 'certificate_issued', 'completed'].includes(s.status)
    );
    if (allVaccinated) {
      await tx.campaignRegistration.update({
        where: { id: pb.registrationId },
        data: { status: CampaignRegistrationStatus.vaccinated },
      });
    }

    // Upsert analytics
    await tx.campaignAnalytics.upsert({
      where: { campaignId },
      update: { totalVaccinated: { increment: 1 } },
      create: { campaignId, totalVaccinated: 1 },
    });
  });

  await writeAuditLog(
    { action: AuditAction.update, resource: 'vaccination_complete', resourceId: pb.id, newValues: { campaignId, petId: pb.petId, vaccineName, batchNumber: dto.batchNumber, signingDoctorId: signingDoctor?.id, performedById: actorId, adminOverride: dto.adminOverride } },
    { actorId, ipAddress },
  );

  return {
    success: true,
    petBookingId: pb.id,
    vaccineName,
    administeredAt,
    signingDoctor: signingDoctor ? { id: signingDoctor.id, name: signingDoctor.name, licenseNumber: signingDoctor.licenseNumber } : null,
    warningNoSigningDoctor: !signingDoctor,
  };
}

// ─── Issue Certificate ────────────────────────────────────────────

export async function issueCertificate(campaignId: string, dto: IssueCertificateDto, actorId: string, ipAddress?: string) {
  const pb = await prisma.petBooking.findUnique({
    where: { id: dto.petBookingId },
    include: {
      registration: { include: { campaign: true } },
      certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } },
    },
  });

  if (!pb) throw AppError.notFound('Pet booking not found');
  if (pb.registration.campaignId !== campaignId) throw AppError.badRequest('Pet booking does not belong to this campaign');

  const isVaccinated = ['vaccinated', 'certificate_issued', 'completed'].includes(pb.status);
  if (!isVaccinated) throw AppError.badRequest('Pet must be marked vaccinated before issuing a certificate');

  if (pb.certificates.length > 0) {
    // Already has a certificate — return existing
    const cert = pb.certificates[0];
    const frontendUrl = config.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = config.BACKEND_URL || 'http://localhost:4000';
    return { certificateId: cert.id, certificateNumber: cert.certificateNumber, verifyToken: cert.verifyToken, verifyUrl: `${frontendUrl}/verify/cert/${cert.verifyToken}`, pdfUrl: `${backendUrl}/api/v1/public/campaigns/certificate-pdf/${cert.verifyToken}`, alreadyExisted: true };
  }

  // Resolve signing doctor
  const signingDoctor = await resolveSigningDoctor(campaignId, pb.registration.sessionId, dto.signingDoctorId);
  if (!signingDoctor) {
    throw AppError.badRequest('Cannot issue certificate: no signing doctor assigned to this session or campaign. Please assign a signing doctor first.');
  }

  const cert = await certSvc.issueCertificate({ petBookingId: dto.petBookingId }, actorId);

  await writeAuditLog(
    { action: AuditAction.create, resource: 'certificate_issue', resourceId: cert.id, newValues: { campaignId, petBookingId: dto.petBookingId, signingDoctorId: signingDoctor.id, actorId } },
    { actorId, ipAddress },
  );

  const frontendUrl = config.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = config.BACKEND_URL || 'http://localhost:4000';

  return {
    certificateId: cert.id,
    certificateNumber: cert.certificateNumber,
    verifyToken: cert.verifyToken,
    signingDoctor: { id: signingDoctor.id, name: signingDoctor.name, licenseNumber: signingDoctor.licenseNumber, specialization: signingDoctor.specialization },
    verifyUrl: `${frontendUrl}/verify/cert/${cert.verifyToken}`,
    pdfUrl: `${backendUrl}/api/v1/public/campaigns/certificate-pdf/${cert.verifyToken}`,
    alreadyExisted: false,
  };
}

// ─── Resend Certificate ───────────────────────────────────────────

export async function resendCertificate(campaignId: string, petBookingId: string, actorId: string, ipAddress?: string) {
  const pb = await prisma.petBooking.findUnique({
    where: { id: petBookingId },
    include: {
      registration: true,
      certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } },
    },
  });

  if (!pb) throw AppError.notFound('Pet booking not found');
  if (pb.registration.campaignId !== campaignId) throw AppError.badRequest('Pet booking does not belong to this campaign');

  const cert = pb.certificates[0];
  if (!cert) throw AppError.badRequest('No active certificate found. Issue a certificate first.');

  await writeAuditLog(
    { action: AuditAction.create, resource: 'certificate_resend', resourceId: cert.id, newValues: { campaignId, petBookingId, actorId } },
    { actorId, ipAddress },
  );

  const frontendUrl = config.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = config.BACKEND_URL || 'http://localhost:4000';

  return {
    certificateId: cert.id,
    certificateNumber: cert.certificateNumber,
    verifyToken: cert.verifyToken,
    verifyUrl: `${frontendUrl}/verify/cert/${cert.verifyToken}`,
    pdfUrl: `${backendUrl}/api/v1/public/campaigns/certificate-pdf/${cert.verifyToken}`,
  };
}

// ─── Scan Logs ────────────────────────────────────────────────────

export async function listScanLogs(campaignId: string, query: ScanLogsQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: any = { campaignId };
  if (query.sessionId) where.sessionId = query.sessionId;
  if (query.scanResult) where.scanResult = { contains: query.scanResult, mode: 'insensitive' };
  if (query.scannedById) where.scannedById = query.scannedById;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  const [items, total] = await Promise.all([
    prisma.qRScanLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        scannedBy: { select: { id: true, name: true, email: true } },
        petBooking: { select: { id: true, pet: { select: { id: true, name: true } } } },
      },
    }),
    prisma.qRScanLog.count({ where }),
  ]);

  return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

// ─── Campaign Operational Dashboard ──────────────────────────────

export async function getCampaignOperationalStats(campaignId: string, sessionId?: string) {
  const where: any = { campaignId };
  const pbWhere: any = { registration: { campaignId } };

  if (sessionId) {
    where.sessionId = sessionId;
    pbWhere.sessionId = sessionId;
  }

  const [
    totalBookings,
    paidBookings,
    checkedIn,
    vaccinated,
    certIssued,
    pendingPayment,
    invalidScans,
    alreadyVaccinatedScans,
  ] = await Promise.all([
    prisma.campaignRegistration.count({ where: { campaignId, ...(sessionId ? { sessionId } : {}) } }),
    prisma.campaignRegistration.count({ where: { campaignId, ...(sessionId ? { sessionId } : {}), status: { in: ['paid', 'checked_in', 'vaccinated', 'certificate_issued', 'completed'] as any } } }),
    prisma.petBooking.count({ where: { ...pbWhere, checkedInAt: { not: null } } }),
    prisma.petBooking.count({ where: { ...pbWhere, status: { in: ['vaccinated', 'certificate_issued', 'completed'] as any } } }),
    prisma.petBooking.count({ where: { ...pbWhere, status: { in: ['certificate_issued', 'completed'] as any } } }),
    prisma.campaignRegistration.count({ where: { campaignId, ...(sessionId ? { sessionId } : {}), status: 'pending_payment' } }),
    prisma.qRScanLog.count({ where: { campaignId, ...(sessionId ? { sessionId } : {}), scanResult: 'INVALID' } }),
    prisma.qRScanLog.count({ where: { campaignId, ...(sessionId ? { sessionId } : {}), scanResult: 'ALREADY_VACCINATED' } }),
  ]);

  return { totalBookings, paidBookings, checkedIn, vaccinated, certIssued, pendingPayment, invalidScans, alreadyVaccinatedScans };
}
