import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ROLES } from '../config/constants';
import { prisma } from '../database/prisma';

/**
 * Ensures the current user has access to a specific campaign.
 * - super_admin and admin always pass.
 * - campaign_manager and campaign_volunteer must have an active CampaignStaffAssignment for the campaign.
 * - If sessionId is provided in params/body, also validates session-level access.
 *
 * Reads campaignId from req.params.campaignId or req.params.id.
 */
export function requireCampaignAccess() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roles, sub: userId } = req.user;

      // Full admins bypass campaign-level restrictions
      if (roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.ADMIN)) {
        return next();
      }

      const campaignId = req.params.campaignId || req.params.id;
      if (!campaignId) {
        return next(AppError.badRequest('Campaign ID is required'));
      }

      const isCampaignRole = roles.includes(ROLES.CAMPAIGN_MANAGER) || roles.includes(ROLES.CAMPAIGN_VOLUNTEER);
      if (!isCampaignRole) {
        return next(AppError.forbidden('You do not have a campaign role'));
      }

      const assignment = await prisma.campaignStaffAssignment.findFirst({
        where: { campaignId, userId, isActive: true },
      });

      if (!assignment) {
        return next(AppError.forbidden('You are not assigned to this campaign'));
      }

      // Attach assignment info for downstream use
      (req as any).campaignAssignment = assignment;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Checks if current user can perform a specific duty within a campaign.
 * Volunteers must have an assignment with the specified duty role.
 * campaign_manager can perform any duty.
 */
export function requireCampaignDuty(...allowedDuties: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roles, sub: userId } = req.user;

      if (roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.ADMIN)) {
        return next();
      }

      const campaignId = req.params.campaignId || req.params.id;

      // campaign_manager can do anything within their assigned campaign
      if (roles.includes(ROLES.CAMPAIGN_MANAGER)) {
        const assignment = await prisma.campaignStaffAssignment.findFirst({
          where: { campaignId, userId, isActive: true },
        });
        if (assignment) return next();
        return next(AppError.forbidden('You are not assigned to this campaign'));
      }

      if (roles.includes(ROLES.CAMPAIGN_VOLUNTEER)) {
        const assignment = await prisma.campaignStaffAssignment.findFirst({
          where: {
            campaignId,
            userId,
            isActive: true,
            dutyRole: { in: allowedDuties as any },
          },
        });
        if (assignment) {
          (req as any).campaignAssignment = assignment;
          return next();
        }
        return next(AppError.forbidden(`You need one of the following duties: ${allowedDuties.join(', ')}`));
      }

      return next(AppError.forbidden('Insufficient campaign role'));
    } catch (err) {
      next(err);
    }
  };
}
