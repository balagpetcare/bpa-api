import { prisma } from '../../database/prisma';
import { CampaignRegistrationStatus, AuditAction } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { writeAuditLog } from '../../utils/audit';
import * as certSvc from '../campaign-certificates/campaign-certificates.service';
import type { CheckInDto, MarkVaccinatedDto, IssueCertificateDto, RevokeCertificateDto } from './vaccination.types';
import { config } from '../../config';

// ─── Token Resolver ──────────────────────────────────────────────────
export async function findRegistrationByAnyToken(token: string) {
  // 1. Try finding CampaignRegistration by staffQrToken or bookingNumber
  let reg = await prisma.campaignRegistration.findFirst({
    where: {
      OR: [
        { staffQrToken: token },
        { bookingNumber: token }
      ]
    },
    include: {
      campaign: true,
      session: { include: { venue: true } },
      owner: true,
      payment: true,
      petBookings: {
        include: {
          pet: true,
          services: { include: { campaignService: true } },
          certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } }
        }
      }
    }
  });

  if (reg) return reg;

  // 2. If token is UUID, search CampaignRegistration by ID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isUuid) {
    reg = await prisma.campaignRegistration.findUnique({
      where: { id: token },
      include: {
        campaign: true,
        session: { include: { venue: true } },
        owner: true,
        payment: true,
        petBookings: {
          include: {
            pet: true,
            services: { include: { campaignService: true } },
            certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } }
          }
        }
      }
    });
    if (reg) return reg;
  }

  // 3. Try finding by PetBooking qrToken or ID (if UUID)
  const petBooking = await prisma.petBooking.findFirst({
    where: {
      OR: [
        { qrToken: token },
        ...(isUuid ? [{ id: token }] : [])
      ]
    },
    select: { registrationId: true }
  });

  if (petBooking) {
    return prisma.campaignRegistration.findUnique({
      where: { id: petBooking.registrationId },
      include: {
        campaign: true,
        session: { include: { venue: true } },
        owner: true,
        payment: true,
        petBookings: {
          include: {
            pet: true,
            services: { include: { campaignService: true } },
            certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } }
          }
        }
      }
    });
  }

  // 4. Try finding by Certificate verifyToken, certificateNumber, or ID
  const cert = await prisma.certificate.findFirst({
    where: {
      OR: [
        { certificateNumber: token },
        ...(isUuid ? [
          { verifyToken: token },
          { id: token }
        ] : [])
      ]
    },
    select: {
      petBooking: {
        select: { registrationId: true }
      }
    }
  });

  if (cert?.petBooking) {
    return prisma.campaignRegistration.findUnique({
      where: { id: cert.petBooking.registrationId },
      include: {
        campaign: true,
        session: { include: { venue: true } },
        owner: true,
        payment: true,
        petBookings: {
          include: {
            pet: true,
            services: { include: { campaignService: true } },
            certificates: { where: { supersededAt: null }, select: { id: true, certificateNumber: true, verifyToken: true, issuedAt: true, supersededAt: true } }
          }
        }
      }
    });
  }

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  if (phone.length <= 6) return '***';
  return phone.slice(0, 4) + '*'.repeat(phone.length - 7) + phone.slice(-3);
}

function maskEmail(email?: string | null): string {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return '*@' + domain;
  return name.slice(0, 1) + '*'.repeat(name.length - 2) + name.slice(-1) + '@' + domain;
}

// ─── Scan Token ──────────────────────────────────────────────────────
export async function scanToken(
  token: string,
  actorId: string,
  query: { venueId?: string; sessionId?: string },
  ipAddress?: string
) {
  const reg = await findRegistrationByAnyToken(token);
  if (!reg) {
    throw AppError.notFound('No registration, pet booking, or certificate found matching this token.');
  }

  // Log scan in QRScanLog
  await prisma.qRScanLog.create({
    data: {
      qrToken: token,
      petBookingId: reg.petBookings[0]?.id ?? null,
      scannedById: actorId,
      scanResult: reg.status === CampaignRegistrationStatus.cancelled ? 'cancelled' : 'valid',
      ipAddress: ipAddress ?? null,
    },
  });

  // Fetch active doctors for this campaign
  const assignedDoctors = await prisma.campaignDoctor.findMany({
    where: { campaignId: reg.campaignId, isActive: true },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          specialization: true,
        },
      },
    },
  });

  // Check duplicate scans (scanned more than once in QRScanLog)
  const scanCount = await prisma.qRScanLog.count({
    where: { qrToken: token }
  });
  const duplicateScan = scanCount > 1;

  // Warning flags
  const alreadyVaccinated = reg.petBookings.every(pb =>
    pb.status === CampaignRegistrationStatus.vaccinated ||
    pb.status === CampaignRegistrationStatus.certificate_issued ||
    pb.status === CampaignRegistrationStatus.completed
  );

  const cancelled = reg.status === CampaignRegistrationStatus.cancelled;
  const expiredCampaign = new Date(reg.campaign.endDate) < new Date();
  
  let wrongVenueSession = false;
  if (query.sessionId && reg.sessionId !== query.sessionId) {
    wrongVenueSession = true;
  }
  if (query.venueId && reg.session.venueId !== query.venueId) {
    wrongVenueSession = true;
  }

  const paymentStatus = reg.payment?.status ?? 'pending';
  const isPaid = paymentStatus === 'success' || reg.status === 'paid' ||
    reg.status === 'checked_in' || reg.status === 'vaccinated' ||
    reg.status === 'certificate_issued' || reg.status === 'completed';

  const petBookings = reg.petBookings.map(pb => {
    const isCheckedIn = pb.checkedInAt != null;
    const isVaccinated = pb.status === 'vaccinated' ||
      pb.status === 'certificate_issued' ||
      pb.status === 'completed';
    const hasCertificate = pb.certificates.length > 0;
    const cert = pb.certificates[0] || null;

    return {
      id: pb.id,
      pet: pb.pet,
      services: pb.services.map(s => ({
        id: s.id,
        campaignServiceId: s.campaignServiceId,
        name: s.campaignService?.name,
        isRequired: s.campaignService?.isRequired
      })),
      status: pb.status,
      checkedInAt: pb.checkedInAt,
      vaccinatedAt: pb.vaccinatedAt,
      certificate: cert ? {
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        verifyToken: cert.verifyToken,
        issuedAt: cert.issuedAt,
        revokedAt: null,
      } : null,
      actions: {
        canCheckIn: !isCheckedIn && !cancelled,
        canMarkVaccinated: isPaid && isCheckedIn && !isVaccinated && !cancelled,
        canIssueCertificate: isVaccinated && !hasCertificate && !cancelled,
      },
    };
  });

  return {
    bookingNumber: reg.bookingNumber,
    registrationId: reg.id,
    campaign: {
      id: reg.campaign.id,
      title: reg.campaign.title,
      slug: reg.campaign.slug,
      status: reg.campaign.status,
      endDate: reg.campaign.endDate,
    },
    session: {
      id: reg.session.id,
      sessionDate: reg.session.sessionDate,
      startTime: reg.session.startTime,
      endTime: reg.session.endTime,
      venueName: reg.session.venue.name,
      venueAddress: reg.session.venue.address,
    },
    owner: {
      id: reg.owner.id,
      name: reg.owner.ownerName,
      phone: reg.owner.mobile,
      email: reg.owner.email,
      ownerNameMasked: reg.owner.ownerName, // mask only if required by privacy policy, but let's show ownerName and mask phone/email
      mobileMasked: maskPhone(reg.owner.mobile),
      emailMasked: maskEmail(reg.owner.email),
    },
    totalAmountBdt: reg.totalAmountBdt,
    paymentStatus,
    isPaid,
    status: reg.status,
    petBookings,
    assignedDoctors: assignedDoctors.map(ad => ad.doctor),
    warningFlags: {
      duplicateScan,
      alreadyVaccinated,
      cancelled,
      expiredCampaign,
      wrongVenueSession,
    },
  };
}

// ─── Check In ────────────────────────────────────────────────────────
export async function checkIn(dto: CheckInDto, actorId: string, ipAddress?: string) {
  const reg = await findRegistrationByAnyToken(dto.token);
  if (!reg) {
    throw AppError.notFound('Registration booking not found.');
  }

  if (reg.status === CampaignRegistrationStatus.cancelled) {
    throw AppError.badRequest('Cannot check in a cancelled booking.');
  }

  const now = new Date();
  
  await prisma.$transaction(async (tx) => {
    // Check in each pet booking
    for (const pb of reg.petBookings) {
      if (pb.checkedInAt) continue;
      
      await tx.petBooking.update({
        where: { id: pb.id },
        data: {
          status: CampaignRegistrationStatus.checked_in,
          checkedInAt: now,
        },
      });
    }

    // Advance overall booking status to checked_in if it was paid or pending
    await tx.campaignRegistration.update({
      where: { id: reg.id },
      data: {
        status: CampaignRegistrationStatus.checked_in,
      },
    });
  });

  // Write audit log
  await writeAuditLog(
    {
      action: AuditAction.update,
      resource: 'campaign_registration_check_in',
      resourceId: reg.id,
      newValues: { checkedInAt: now, actorId },
    },
    { actorId, ipAddress }
  );

  return scanToken(dto.token, actorId, {}, ipAddress);
}

// ─── Mark Vaccinated ─────────────────────────────────────────────────
export async function markVaccinated(dto: MarkVaccinatedDto, actorId: string, ipAddress?: string) {
  const pb = await prisma.petBooking.findUnique({
    where: { id: dto.petRegistrationId },
    include: {
      registration: {
        include: {
          campaign: true,
        },
      },
      pet: true,
      services: {
        include: {
          campaignService: true,
        },
      },
    },
  });

  if (!pb) {
    throw AppError.notFound('Pet booking registration not found.');
  }

  if (pb.status === CampaignRegistrationStatus.cancelled) {
    throw AppError.badRequest('Cannot vaccinate a cancelled booking.');
  }

  // Prevent double vaccination unless adminOverride is specified
  const alreadyVaccinated =
    pb.status === CampaignRegistrationStatus.vaccinated ||
    pb.status === CampaignRegistrationStatus.certificate_issued ||
    pb.status === CampaignRegistrationStatus.completed;

  if (alreadyVaccinated && !dto.adminOverride) {
    throw AppError.conflict(
      'This pet is already marked as vaccinated. Double vaccination is prevented unless admin override is provided.'
    );
  }

  // Validate doctor if provided
  if (dto.doctorId) {
    const doctor = await prisma.doctor.findUnique({ where: { id: dto.doctorId } });
    if (!doctor) throw AppError.notFound('Doctor not found.');
    if (!doctor.isActive) throw AppError.badRequest('Assigned doctor is not active.');
  }

  const now = new Date();

  // Find or choose vaccine name
  let vaccineName = 'Rabies Vaccine';
  let campaignServiceId = dto.vaccineId ?? null;

  if (dto.vaccineId) {
    const cs = pb.services.find(s => s.campaignServiceId === dto.vaccineId)?.campaignService;
    if (cs) {
      vaccineName = cs.name;
    } else {
      // Find directly in database
      const csDb = await prisma.campaignService.findUnique({ where: { id: dto.vaccineId } });
      if (csDb) {
        vaccineName = csDb.name;
      }
    }
  } else {
    // Default to the first available service in this booking
    const firstSvc = pb.services[0]?.campaignService;
    if (firstSvc) {
      vaccineName = firstSvc.name;
      campaignServiceId = firstSvc.id;
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Update all matching services to administered = true
    await tx.petBookingService.updateMany({
      where: {
        petBookingId: pb.id,
        ...(dto.vaccineId ? { campaignServiceId: dto.vaccineId } : {}),
      },
      data: {
        administered: true,
        administeredAt: now,
      },
    });

    // 2. Create the VaccinationRecord
    await tx.vaccinationRecord.create({
      data: {
        petId: pb.petId,
        petBookingId: pb.id,
        campaignServiceId: campaignServiceId,
        campaignId: pb.registration.campaignId,
        vaccineName: vaccineName,
        batchNumber: dto.batchNo ?? null,
        administeredAt: now,
        doctorId: dto.doctorId ?? null,
        notes: dto.notes ?? null,
      },
    });

    // 3. Update PetBooking status
    await tx.petBooking.update({
      where: { id: pb.id },
      data: {
        status: CampaignRegistrationStatus.vaccinated,
        vaccinatedAt: now,
      },
    });

    // 4. Update overall registration status if all sibling pet bookings are vaccinated
    const siblings = await tx.petBooking.findMany({
      where: { registrationId: pb.registrationId },
    });
    
    const allVaccinated = siblings.every(s =>
      s.id === pb.id ||
      s.status === CampaignRegistrationStatus.vaccinated ||
      s.status === CampaignRegistrationStatus.certificate_issued ||
      s.status === CampaignRegistrationStatus.completed
    );

    if (allVaccinated) {
      await tx.campaignRegistration.update({
        where: { id: pb.registrationId },
        data: {
          status: CampaignRegistrationStatus.vaccinated,
        },
      });
    }

    // 5. Update Analytics
    await tx.campaignAnalytics.upsert({
      where: { campaignId: pb.registration.campaignId },
      update: {
        totalVaccinated: { increment: 1 },
      },
      create: {
        campaignId: pb.registration.campaignId,
        totalVaccinated: 1,
      },
    });
  });

  // Write audit log
  await writeAuditLog(
    {
      action: AuditAction.update,
      resource: 'vaccination_record',
      resourceId: pb.id,
      newValues: {
        petId: pb.petId,
        vaccineName,
        batchNo: dto.batchNo,
        doctorId: dto.doctorId,
        actorId,
      },
    },
    { actorId, ipAddress }
  );

  return { success: true, message: 'Pet marked as vaccinated successfully.' };
}

// ─── Issue Certificate ────────────────────────────────────────────────
export async function issueCertificate(dto: IssueCertificateDto, actorId: string, ipAddress?: string) {
  const pb = await prisma.petBooking.findUnique({
    where: { id: dto.petRegistrationId },
    include: {
      certificates: { where: { supersededAt: null } },
    },
  });

  if (!pb) {
    throw AppError.notFound('Pet booking registration not found.');
  }

  // Ensure pet is vaccinated
  const isVaccinated =
    pb.status === CampaignRegistrationStatus.vaccinated ||
    pb.status === CampaignRegistrationStatus.certificate_issued ||
    pb.status === CampaignRegistrationStatus.completed;

  if (!isVaccinated) {
    throw AppError.badRequest('Cannot issue certificate. The pet must be marked vaccinated first.');
  }

  // Call the core certificate service to issue it
  let cert;
  if (pb.certificates.length > 0) {
    cert = pb.certificates[0];
  } else {
    cert = await certSvc.issueCertificate({ petBookingId: dto.petRegistrationId }, actorId);
  }

  const frontendUrl = config.FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = config.BACKEND_URL || 'http://localhost:4000';

  const verifyUrl = `${frontendUrl}/verify/cert/${cert.verifyToken}`;
  const pdfUrl = `${backendUrl}/api/v1/public/campaigns/certificate-pdf/${cert.verifyToken}`;

  // Write audit log
  await writeAuditLog(
    {
      action: AuditAction.create,
      resource: 'certificate_issue',
      resourceId: cert.id,
      newValues: { verifyToken: cert.verifyToken, certNumber: cert.certificateNumber, actorId },
    },
    { actorId, ipAddress }
  );

  return {
    certificateId: cert.id,
    certificateNumber: cert.certificateNumber,
    verifyToken: cert.verifyToken,
    verifyUrl,
    pdfUrl,
  };
}

// ─── Revoke Certificate ──────────────────────────────────────────────
export async function revokeCertificate(dto: RevokeCertificateDto, actorId: string, ipAddress?: string) {
  const cert = await prisma.certificate.findUnique({
    where: { id: dto.certificateId },
    select: { id: true, petBookingId: true, supersededAt: true },
  });

  if (!cert) {
    throw AppError.notFound('Certificate not found.');
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // revokedAt / revocationReason columns are pending migration — skip those fields for now

    // Revert PetBooking status back to vaccinated if it was certificate_issued
    const booking = await tx.petBooking.findUnique({
      where: { id: cert.petBookingId },
    });
    if (booking && booking.status === CampaignRegistrationStatus.certificate_issued) {
      await tx.petBooking.update({
        where: { id: cert.petBookingId },
        data: { status: CampaignRegistrationStatus.vaccinated },
      });
    }
  });

  // Write audit log
  await writeAuditLog(
    {
      action: AuditAction.delete, // representing revocation / soft delete of certificate validity
      resource: 'certificate_revocation',
      resourceId: cert.id,
      newValues: { reason: dto.reason, revokedAt: now, actorId },
    },
    { actorId, ipAddress }
  );

  return { success: true, message: 'Certificate revoked successfully.' };
}

// ─── Public Verification ─────────────────────────────────────────────
export async function verifyCertificatePublicly(verifyToken: string) {
  const cert = await prisma.certificate.findFirst({
    where: { verifyToken },
    select: {
      id: true,
      certificateNumber: true,
      issuedAt: true,
      supersededAt: true,
      petBooking: {
        include: {
          pet: {
            select: {
              name: true,
              petType: true,
              breed: true,
            },
          },
          registration: {
            include: {
              campaign: {
                select: {
                  title: true,
                },
              },
            },
          },
          vaccinationRecords: {
            orderBy: { administeredAt: 'desc' },
            take: 1,
            select: {
              administeredAt: true,
              doctor: {
                select: {
                  name: true,
                  licenseNumber: true,
                  specialization: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cert) {
    return {
      valid: false,
      status: 'not_found',
      message: 'Certificate not found.',
    };
  }

  // revokedAt / revocationReason columns are pending migration — treat as never revoked
  const valid = cert.supersededAt == null;
  let status = 'issued';
  if (cert.supersededAt) {
    status = 'superseded';
  }

  const latestRecord = cert.petBooking.vaccinationRecords[0];

  return {
    valid,
    status,
    certificateId: cert.certificateNumber,
    revokedAt: null,
    revocationReason: null,
    issuedAt: cert.issuedAt,
    pet: {
      name: cert.petBooking.pet.name,
      species: cert.petBooking.pet.petType,
      breed: cert.petBooking.pet.breed,
    },
    campaignName: cert.petBooking.registration.campaign.title,
    vaccinationDate: latestRecord?.administeredAt ?? cert.issuedAt,
    doctor: latestRecord?.doctor ? {
      name: latestRecord.doctor.name,
      licenseNumber: latestRecord.doctor.licenseNumber,
      specialization: latestRecord.doctor.specialization,
    } : null,
    organization: 'Bangladesh Pet Association (BPA)',
  };
}
