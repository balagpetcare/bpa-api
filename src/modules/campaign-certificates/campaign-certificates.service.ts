import { randomUUID } from 'crypto';
import { CampaignRegistrationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { sendCampaignSms } from '../../services/campaign-sms.service';
import { renderCertificateHtml } from './certificate-html';
import * as repo from './campaign-certificates.repository';
import type { IssueCertificateDto, CertificateListQuery } from './campaign-certificates.types';

// ─── Issue ────────────────────────────────────────────────────────

export async function issueCertificate(dto: IssueCertificateDto, issuedById: string) {
  const petBooking = await prisma.petBooking.findUnique({
    where: { id: dto.petBookingId },
    include: {
      services: { include: { campaignService: { select: { isRequired: true } } } },
      registration: { select: { id: true, campaignId: true, ownerId: true } },
      pet: { include: { owner: { select: { mobile: true } } } },
      certificates: { where: { supersededAt: null } },
    },
  });

  if (!petBooking) throw AppError.notFound('PetBooking');

  if (petBooking.certificates.length > 0) {
    throw AppError.badRequest('Certificate already issued for this booking. Use reissue endpoint.');
  }

  const allowedStatuses: CampaignRegistrationStatus[] = [
    CampaignRegistrationStatus.vaccinated,
    CampaignRegistrationStatus.certificate_issued,
  ];
  if (!allowedStatuses.includes(petBooking.status as CampaignRegistrationStatus)) {
    throw AppError.badRequest(`Cannot issue certificate for booking with status: ${petBooking.status}`);
  }

  const allRequiredAdministered = petBooking.services
    .filter(s => s.campaignService.isRequired)
    .every(s => s.administered);
  if (!allRequiredAdministered) {
    throw AppError.badRequest('Not all required services have been administered.');
  }

  return prisma.$transaction(async (tx) => {
    const certNumber = await repo.generateCertificateNumber();
    const verifyToken = randomUUID();

    const cert = await tx.certificate.create({
      data: {
        certificateNumber: certNumber,
        petBookingId: dto.petBookingId,
        verifyToken,
        issuedById,
        issuedAt: new Date(),
      },
      include: repo.certificateInclude,
    });

    // Advance PetBooking to certificate_issued
    await tx.petBooking.update({
      where: { id: dto.petBookingId },
      data: { status: CampaignRegistrationStatus.certificate_issued },
    });

    // Advance registration if all pet bookings are certificate_issued or beyond
    const siblings = await tx.petBooking.findMany({
      where: { registrationId: petBooking.registrationId },
    });
    const doneStatuses: CampaignRegistrationStatus[] = [
      CampaignRegistrationStatus.certificate_issued,
      CampaignRegistrationStatus.completed,
    ];
    const allDone = siblings.every(
      pb => pb.id === dto.petBookingId || doneStatuses.includes(pb.status as CampaignRegistrationStatus),
    );
    if (allDone) {
      await tx.campaignRegistration.update({
        where: { id: petBooking.registrationId },
        data: { status: CampaignRegistrationStatus.certificate_issued },
      });
    }

    // Increment analytics
    await tx.campaignAnalytics.upsert({
      where: { campaignId: petBooking.registration.campaignId },
      update: { totalCertificates: { increment: 1 } },
      create: { campaignId: petBooking.registration.campaignId, totalCertificates: 1 },
    });

    // SMS notification (fire-and-forget, with analytics counter)
    const mobile = petBooking.pet.owner?.mobile;
    const verifyUrl = `${process.env.FRONTEND_URL ?? 'https://bpa.org.bd'}/verify/certificate/${verifyToken}`;
    if (mobile) {
      sendCampaignSms({
        to: mobile,
        message: `BPA: Your pet ${petBooking.pet.name}'s vaccination certificate is ready. Cert No: ${certNumber}. Verify at: ${verifyUrl}`,
        campaignId: petBooking.registration.campaignId,
      });
    }

    return cert;
  });
}

// ─── Reissue ──────────────────────────────────────────────────────

export async function reissueCertificate(petBookingId: string, issuedById: string) {
  const existing = await repo.findCertificateByPetBookingId(petBookingId);
  if (!existing) throw AppError.notFound('Certificate');
  if (existing.supersededAt) throw AppError.badRequest('Certificate is already superseded.');

  return prisma.$transaction(async (tx) => {
    // Supersede the old certificate (kept for history)
    await tx.certificate.update({
      where: { id: existing.id },
      data: { supersededAt: new Date() },
    });

    const certNumber = await repo.generateCertificateNumber();
    const verifyToken = randomUUID();

    const cert = await tx.certificate.create({
      data: {
        certificateNumber: certNumber,
        petBookingId,
        verifyToken,
        issuedById,
        issuedAt: new Date(),
      },
      include: repo.certificateInclude,
    });

    // SMS notification (fire-and-forget, with analytics counter)
    const mobile = cert.petBooking.pet.owner?.mobile;
    const verifyUrl = `${process.env.FRONTEND_URL ?? 'https://bpa.org.bd'}/verify/certificate/${verifyToken}`;
    if (mobile) {
      sendCampaignSms({
        to: mobile,
        message: `BPA: A replacement vaccination certificate has been issued for ${cert.petBooking.pet.name}. Cert No: ${certNumber}. Verify at: ${verifyUrl}`,
        campaignId: cert.petBooking.registration.campaignId,
      });
    }

    return cert;
  });
}

// ─── Get / Search ─────────────────────────────────────────────────

export async function getCertificateByPetBooking(petBookingId: string) {
  const cert = await repo.findCertificateByPetBookingId(petBookingId);
  if (!cert) throw AppError.notFound('Certificate');
  return cert;
}

export async function listCertificates(query: CertificateListQuery) {
  return repo.listCertificates(query);
}

// ─── Public Verification ─────────────────────────────────────────

export async function verifyByToken(verifyToken: string) {
  const cert = await repo.findCertificateByVerifyToken(verifyToken);
  if (!cert) return { valid: false, message: 'Certificate not found.' };
  if (cert.supersededAt) return { valid: false, superseded: true, message: 'This certificate has been superseded.', certificate: cert };
  return { valid: true, certificate: cert };
}

export async function verifyByCertNumber(certNumber: string) {
  const cert = await repo.findCertificateByCertNumber(certNumber);
  if (!cert) return { valid: false, message: 'Certificate not found.' };
  if (cert.supersededAt) return { valid: false, superseded: true, message: 'This certificate has been superseded.', certificate: cert };
  return { valid: true, certificate: cert };
}

// ─── HTML output ─────────────────────────────────────────────────

export async function getCertificateHtml(verifyToken: string): Promise<string> {
  const cert = await repo.findCertificateByVerifyToken(verifyToken);
  if (!cert) throw AppError.notFound('Certificate');
  return renderCertificateHtml(cert);
}

// ─── PDF output (print-to-PDF via browser) ───────────────────────

export async function getCertificatePdfHtml(verifyToken: string): Promise<{ html: string; filename: string }> {
  const cert = await repo.findCertificateByVerifyToken(verifyToken);
  if (!cert) throw AppError.notFound('Certificate');
  const baseHtml = renderCertificateHtml(cert);
  // Inject auto-print script before </body>
  const printScript = `<script>window.addEventListener('load',function(){window.print();});</script>`;
  const html = baseHtml.replace('</body>', `${printScript}</body>`);
  const filename = `BPA-Certificate-${cert.certificateNumber}.pdf`;
  return { html, filename };
}
