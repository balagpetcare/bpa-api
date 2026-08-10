import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ROLES } from '../config/constants';
import { prisma } from '../database/prisma';

function isGlobalSpayOperator(roles: string[]): boolean {
  return roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.ADMIN) || roles.includes('SUPER_ADMIN') || roles.includes('GLOBAL_SUPER_ADMIN');
}

export async function resolveAuthorizedSpayClinicBranchIds(userId: string, roles: string[]): Promise<string[] | null> {
  if (isGlobalSpayOperator(roles)) {
    return null;
  }

  const memberships = await prisma.spayClinicStaff.findMany({
    where: { userId, isActive: true },
    select: { clinicBranchId: true },
  });

  return [...new Set(memberships.map((membership) => membership.clinicBranchId))];
}

/**
 * Row-level authorization scope for clinic-side spay/neuter endpoints —
 * modeled on requireCampaignAccess (campaignAccess.ts). This is a SECOND,
 * independent layer on top of the `spay_*:*` permission-string check done
 * by authorize(): a caller can hold `spay_bookings:update` and still be
 * rejected here if they aren't staff of the SPECIFIC clinic the target
 * booking belongs to. super_admin/admin bypass (central roles operate
 * across all clinics by design).
 *
 * Resolves the target clinic branch from, in order: req.params.clinicBranchId,
 * or by looking up req.params.bookingId's SpayBooking.clinicBranchId.
 */
export function requireSpayClinicAccess() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roles, sub: userId } = req.user;

      if (isGlobalSpayOperator(roles)) {
        return next();
      }

      let clinicBranchId = req.params.clinicBranchId;
      if (!clinicBranchId && req.params.bookingId) {
        const booking = await prisma.spayBooking.findUnique({
          where: { id: req.params.bookingId },
          select: { clinicBranchId: true },
        });
        if (!booking) return next(AppError.notFound('Booking'));
        clinicBranchId = booking.clinicBranchId;
      }
      if (!clinicBranchId) return next(AppError.badRequest('Clinic branch could not be determined for this request'));

      const staff = await prisma.spayClinicStaff.findFirst({
        where: { clinicBranchId, userId, isActive: true },
      });
      if (!staff) return next(AppError.forbidden('You are not assigned as staff at this clinic', 'SPAY_NOT_CLINIC_STAFF'));

      (req as Request & { spayClinicStaff?: typeof staff }).spayClinicStaff = staff;
      next();
    } catch (err) {
      next(err);
    }
  };
}
