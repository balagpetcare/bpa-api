import { Request, Response, NextFunction } from "express";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/response";
import { auditContextFromRequest } from "../../utils/audit";
import * as svc from "./membership-campaign.service";
import type { MembershipListQuery } from "./membership-campaign.types";

export async function listActiveCampaignsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { campaigns, serverTime } = await svc.listActiveCampaignSummaries();
    sendSuccess(res, { campaigns }, 200, {
      serverTime,
      timezone: "Asia/Dhaka",
    });
  } catch (err) {
    next(err);
  }
}

export async function getPublicCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getPublicCampaign(req.params.slug));
  } catch (err) {
    next(err);
  }
}

export async function createMembershipApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipApplication(
        req.user.sub,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateMembershipApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateMembershipApplication(
        req.user.sub,
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function submitMembershipApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.submitMembershipApplication(
        req.user.sub,
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMembershipPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipApplicationPayment(
        req.user.sub,
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyMembershipApplicationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listMyMembershipApplications(
      req.user.sub,
    );
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMyMembershipApplication(req.user.sub, req.params.id),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyMembershipsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listMyMemberships(req.user.sub, req.query as unknown as MembershipListQuery);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMyMembership(req.user.sub, req.params.membershipId),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipUpgradeOptionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMembershipUpgradeOptions(
        req.user.sub,
        req.params.membershipId,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyMembershipUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipUpgrade(
        req.user.sub,
        { membershipId: req.params.membershipId, ...req.body },
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMyMembershipUpgradePaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipUpgradePayment(
        req.user.sub,
        req.params.upgradeId,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMyMembershipUpgrade(req.user.sub, req.params.upgradeId),
    );
  } catch (err) {
    next(err);
  }
}

export async function listMyMembershipEligiblePetsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.listMyMembershipEligiblePets(
        req.user.sub,
        req.params.membershipId,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function linkMyMembershipPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.linkMyMembershipPet(
        req.user.sub,
        req.params.membershipId,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function unlinkMyMembershipPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.unlinkMyMembershipPet(
      req.user.sub,
      req.params.membershipId,
      req.params.petId,
      auditContextFromRequest(req),
    );
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipBenefitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMyMembershipBenefits(req.user.sub, req.params.membershipId),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipBenefitHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMyMembershipBenefitHistory(
        req.user.sub,
        req.params.membershipId,
        req.params.benefitId,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function cancelMyMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.cancelMyMembership(
        req.user.sub,
        req.params.membershipId,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdminCampaignsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminCampaigns(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminPlansHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminPlans(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminPlanHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminPlanHistory(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function listAdminBenefitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminBenefits(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminMedia(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminDocuments(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminFaqsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminFaqs(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminCampaign(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function getAdminCampaignPreviewHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminCampaignPreview(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function createAdminCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminCampaign(
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminCampaign(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminCampaignHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminCampaign(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function createAdminPlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminPlan(req.body, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminPlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminPlan(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminPlanHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminPlan(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function createAdminBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminBenefit(req.body, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminBenefit(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminBenefit(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function createAdminMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminMedia(req.body, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminMedia(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminMedia(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function createAdminDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminDocument(req.body, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminDocument(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminDocument(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function createAdminFaqHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createAdminFaq(req.body, auditContextFromRequest(req)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminFaqHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminFaq(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminFaqHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await svc.deleteAdminFaq(req.params.id, auditContextFromRequest(req));
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function listAdminApplicationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminApplications(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminApplication(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function reviewAdminApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.reviewAdminApplication(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function activateMembershipFromApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.activateMembershipFromApplication(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdminMembershipsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminMemberships(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminMembership(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function updateAdminMembershipStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.updateAdminMembershipStatus(
        req.params.id,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdminReplacementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminReplacements(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminCoveredPetsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminCoveredPets(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function listAdminServiceUsageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminServiceUsage(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function reviewAdminReplacementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.reviewAdminReplacement(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMembershipUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipUpgrade(
        req.user.sub,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdminUpgradesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminUpgrades(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminUpgrade(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function reviewAdminUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.reviewAdminUpgrade(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function getMembershipReportsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getMembershipReports());
  } catch (err) {
    next(err);
  }
}

export async function clinicLookupMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.lookupClinicMembership(
        req.query as never,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicGetMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getClinicMembership(
        req.params.membershipId,
        req.query as never,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicGetMembershipPetsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getClinicMembershipPets(
        req.params.membershipId,
        req.query as never,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicCreatePetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createClinicPetForMembershipOwner(
        req.params.membershipId,
        req.body,
        req.query as never,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicLinkCoveredPetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.linkClinicCoveredPet(
        req.params.membershipId,
        req.body,
        req.query as never,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicCreateServiceUsageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createClinicServiceUsage(
        req.params.membershipId,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function createMembershipReplacementRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipReplacementRequest(
        req.params.membershipId,
        req.body,
        { userId: req.user.sub },
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function clinicCreateMembershipReplacementRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.createMembershipReplacementRequest(
        req.params.membershipId,
        req.body,
        { staffId: req.user.sub },
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdminMembershipPetReplacementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { items, meta } = await svc.listAdminReplacements(req.query as never);
    sendSuccess(res, items, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAdminMembershipPetReplacementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(res, await svc.getAdminReplacement(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function approveMembershipReplacementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.approveMembershipReplacement(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function rejectMembershipReplacementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.rejectMembershipReplacement(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function completeMembershipReplacementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.completeMembershipReplacement(
        req.params.id,
        req.body,
        req.user.sub,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function syncAdminPlansHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await svc.syncAdminPlans(
      req.params.id,
      (req as any).auditContext,
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function getMyMembershipRenewalOptionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendSuccess(
      res,
      await svc.getMembershipRenewalOptions(
        req.user.sub,
        req.params.membershipId,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function applyForMembershipRenewalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    sendCreated(
      res,
      await svc.applyForRenewal(
        req.user.sub,
        req.params.membershipId,
        req.body,
        auditContextFromRequest(req),
      ),
    );
  } catch (err) {
    next(err);
  }
}
