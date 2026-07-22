import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../database/prisma';
import { CampaignRegistrationStatus } from '@prisma/client';
import * as repo from './campaign-registrations.repository';
import * as checkinRepo from '../campaign-checkin/campaign-checkin.repository';
import * as certSvc from '../campaign-certificates/campaign-certificates.service';

const router = Router();

// All scan endpoints require admin/staff authentication
router.use(authenticate);

type AuthedRequest = Request & { user?: { id: string } };

// ─── Helper ───────────────────────────────────────────────────────

function buildScanResponse(reg: NonNullable<Awaited<ReturnType<typeof repo.getRegistrationByStaffQrToken>>>) {
  const paymentStatus = reg.payment?.status ?? 'pending';
  const isPaid = paymentStatus === 'success' || reg.status === 'paid' ||
    reg.status === 'checked_in' || reg.status === 'vaccinated' ||
    reg.status === 'certificate_issued' || reg.status === 'completed';

  const petBookings = reg.petBookings.map(pb => {
    const isCheckedIn = pb.status !== 'pending_payment' && pb.checkedInAt != null;
    const isVaccinated = (pb.status as string) === 'vaccinated' ||
      (pb.status as string) === 'certificate_issued' ||
      (pb.status as string) === 'completed';
    const hasCertificate = pb.certificates.length > 0;

    return {
      id: pb.id,
      pet: pb.pet,
      services: pb.services.map(s => ({ id: s.id, name: s.campaignService?.name, isRequired: s.campaignService?.isRequired })),
      status: pb.status,
      checkedInAt: pb.checkedInAt,
      vaccinatedAt: pb.vaccinatedAt,
      certificate: hasCertificate ? pb.certificates[0] : null,
      actions: {
        canCheckIn: !isCheckedIn,
        canMarkVaccinated: isPaid && !isVaccinated,
        canIssueCertificate: isVaccinated && !hasCertificate,
      },
    };
  });

  const allCheckedIn = petBookings.every(pb => !pb.actions.canCheckIn);
  const allVaccinated = petBookings.every(pb => !pb.actions.canMarkVaccinated && pb.vaccinatedAt != null);
  const allCertIssued = petBookings.every(pb => pb.certificate != null);

  return {
    bookingNumber: reg.bookingNumber,
    status: reg.status,
    campaign: reg.campaign,
    session: reg.session,
    owner: reg.owner,
    totalAmountBdt: reg.totalAmountBdt,
    paymentStatus,
    isPaid,
    petBookings,
    summary: { allCheckedIn, allVaccinated, allCertIssued },
    allowedActions: {
      canReceivePayment: !isPaid,
      canCheckIn: !allCheckedIn,
      canMarkVaccinated: isPaid && !allVaccinated,
      canIssueCertificates: allVaccinated && !allCertIssued,
    },
  };
}

// ─── GET /scan/:token — fetch booking details ─────────────────────

router.get(
  '/scan/:token',
  publicReadLimiter,
  authorize('campaign_checkin', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reg = await repo.getRegistrationByStaffQrToken(req.params.token);
      if (!reg) throw AppError.notFound('Booking not found for this QR token');

      // Log the scan (token prefix only)
      const userId = (req as AuthedRequest).user?.id ?? 'unknown';
      console.log(`[QR Scan] bookingNumber=${reg.bookingNumber} token=${req.params.token.slice(0, 8)}... staff=${userId} ip=${req.ip ?? ''}`);

      // Update lastScannedAt
      await prisma.campaignRegistration.update({
        where: { id: reg.id },
        data: { staffQrIssuedAt: reg.staffQrIssuedAt ?? new Date() }, // keep existing issued, just ensure it's set
      });

      sendSuccess(res, buildScanResponse(reg));
    } catch (err) { next(err); }
  },
);

// ─── POST /scan/:token/check-in — check in all pets ──────────────

router.post(
  '/scan/:token/check-in',
  authorize('campaign_checkin', 'checkin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reg = await repo.getRegistrationByStaffQrToken(req.params.token);
      if (!reg) throw AppError.notFound('Booking');

      // Check in each pet booking that hasn't been checked in yet
      const results = await Promise.allSettled(
        reg.petBookings
          .filter(pb => pb.checkedInAt == null)
          .map(pb => checkinRepo.checkInPetBooking(pb.id)),
      );

      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length === reg.petBookings.length) {
        throw AppError.badRequest('All pets are already checked in.');
      }

      const updated = await repo.getRegistrationByStaffQrToken(req.params.token);
      sendSuccess(res, buildScanResponse(updated!));
    } catch (err) { next(err); }
  },
);

// ─── POST /scan/:token/receive-payment — mark paid at center ─────

router.post(
  '/scan/:token/receive-payment',
  authorize('campaign_checkin', 'checkin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reg = await repo.getRegistrationByStaffQrToken(req.params.token);
      if (!reg) throw AppError.notFound('Booking');

      const paymentStatus = reg.payment?.status ?? 'pending';
      const isPaid = paymentStatus === 'success' || reg.status === 'paid' ||
        reg.status === 'checked_in' || reg.status === 'vaccinated' ||
        reg.status === 'certificate_issued' || reg.status === 'completed';

      if (isPaid) throw AppError.badRequest('Payment has already been completed.');

      // Settle the registration (mark paid)
      await prisma.$transaction(async (tx) => {
        await tx.campaignRegistration.update({
          where: { id: reg.id },
          data: { status: CampaignRegistrationStatus.paid },
        });
        await tx.petBooking.updateMany({
          where: { registrationId: reg.id },
          data: { status: CampaignRegistrationStatus.paid },
        });
        if (reg.payment) {
          await tx.payment.update({
            where: { id: reg.payment.id },
            data: { status: 'success' },
          });
        }
        // Analytics
        await tx.campaignAnalytics.upsert({
          where: { campaignId: reg.campaignId },
          update: {
            totalRegistrations: { increment: 1 },
            totalPaid: { increment: 1 },
            totalPets: { increment: reg.petBookings.length },
            totalRevenueBdt: { increment: Number(String(reg.totalAmountBdt)) },
          },
          create: {
            campaignId: reg.campaignId,
            totalRegistrations: 1,
            totalPaid: 1,
            totalPets: reg.petBookings.length,
            totalRevenueBdt: Number(String(reg.totalAmountBdt)),
          },
        });
      });

      const updated = await repo.getRegistrationByStaffQrToken(req.params.token);
      sendSuccess(res, buildScanResponse(updated!));
    } catch (err) { next(err); }
  },
);

// ─── POST /scan/:token/mark-vaccinated — mark all pets vaccinated ─

router.post(
  '/scan/:token/mark-vaccinated',
  authorize('campaign_checkin', 'checkin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reg = await repo.getRegistrationByStaffQrToken(req.params.token);
      if (!reg) throw AppError.notFound('Booking');

      const isPaid = reg.payment?.status === 'success' || reg.status === 'paid' ||
        reg.status === 'checked_in' || reg.status === 'vaccinated' ||
        reg.status === 'certificate_issued' || reg.status === 'completed';

      if (!isPaid) {
        throw AppError.badRequest('Payment must be completed before marking vaccination complete.');
      }

      const now = new Date();
      const vaccinationStatuses = [
        CampaignRegistrationStatus.vaccinated,
        CampaignRegistrationStatus.certificate_issued,
        CampaignRegistrationStatus.completed,
      ];

      await prisma.$transaction(async (tx) => {
        for (const pb of reg.petBookings) {
          if ((vaccinationStatuses as string[]).includes(pb.status as string)) continue;

          // Mark all services as administered
          await tx.petBookingService.updateMany({
            where: { petBookingId: pb.id, administered: false },
            data: { administered: true, administeredAt: now },
          });

          // Create vaccination records for each service
          for (const svc of pb.services) {
            if (!svc.campaignService) continue;
            await tx.vaccinationRecord.create({
              data: {
                petId: pb.petId,
                petBookingId: pb.id,
                campaignServiceId: svc.campaignServiceId,
                campaignId: reg.campaignId,
                vaccineName: svc.campaignService.name,
                administeredAt: now,
              },
            }).catch(() => { /* ignore duplicate */ });
          }

          await tx.petBooking.update({
            where: { id: pb.id },
            data: { status: CampaignRegistrationStatus.vaccinated, vaccinatedAt: now },
          });
        }

        await tx.campaignRegistration.update({
          where: { id: reg.id },
          data: { status: CampaignRegistrationStatus.vaccinated },
        });

        await tx.campaignAnalytics.upsert({
          where: { campaignId: reg.campaignId },
          update: {
            totalVaccinated: { increment: reg.petBookings.length },
            totalPets: { increment: 0 },
          },
          create: {
            campaignId: reg.campaignId,
            totalVaccinated: reg.petBookings.length,
          },
        });
      });

      const updated = await repo.getRegistrationByStaffQrToken(req.params.token);
      sendSuccess(res, buildScanResponse(updated!));
    } catch (err) { next(err); }
  },
);

// ─── POST /scan/:token/generate-certificate — issue certs ────────

router.post(
  '/scan/:token/generate-certificate',
  authorize('campaign_certificates', 'issue'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reg = await repo.getRegistrationByStaffQrToken(req.params.token);
      if (!reg) throw AppError.notFound('Booking');

      const userId = (req as AuthedRequest).user?.id;
      if (!userId) throw AppError.badRequest('Authentication required');

      const vaccinatedStatuses = [
        CampaignRegistrationStatus.vaccinated,
        CampaignRegistrationStatus.certificate_issued,
        CampaignRegistrationStatus.completed,
      ];

      const results: Array<{ petBookingId: string; certificate: unknown; error?: string }> = [];

      for (const pb of reg.petBookings) {
        if (!(vaccinatedStatuses as string[]).includes(pb.status as string)) {
          results.push({ petBookingId: pb.id, certificate: null, error: 'Not yet vaccinated' });
          continue;
        }
        if (pb.certificates.length > 0) {
          results.push({ petBookingId: pb.id, certificate: pb.certificates[0], error: undefined });
          continue;
        }
        try {
          const cert = await certSvc.issueCertificate({ petBookingId: pb.id }, userId);
          results.push({ petBookingId: pb.id, certificate: cert });
        } catch (e) {
          results.push({ petBookingId: pb.id, certificate: null, error: e instanceof Error ? e.message : 'Failed' });
        }
      }

      const updated = await repo.getRegistrationByStaffQrToken(req.params.token);
      sendSuccess(res, { booking: buildScanResponse(updated!), certificates: results });
    } catch (err) { next(err); }
  },
);

export default router;
