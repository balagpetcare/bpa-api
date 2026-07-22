import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { requireCentralAuthUser } from "../../middlewares/requireCentralAuthUser";
import { requireLocalUser } from "../../middlewares/requireLocalUser";
import {
  publicReadLimiter,
  publicFormLimiter,
} from "../../middlewares/rateLimiter";
import { validate } from "../../middlewares/validate";
import {
  validateUuid,
  validateUuidWithCode,
} from "../../middlewares/validateUuid";
import { ACTIONS, RESOURCES } from "../../config/constants";
import {
  adminMembershipActivationSchema,
  adminMembershipApplicationReviewSchema,
  adminMembershipStatusSchema,
  cancelMembershipSchema,
  membershipRenewalApplySchema,
  createMembershipApplicationSchema,
  createMembershipBenefitSchema,
  createMembershipCampaignSchema,
  createMembershipDocumentSchema,
  createMembershipFaqSchema,
  createMembershipMediaSchema,
  createMembershipPaymentSchema,
  createMembershipPlanSchema,
  createMembershipReplacementSchema,
  clinicCreatePetSchema,
  clinicLinkCoveredPetSchema,
  clinicMembershipContextQuerySchema,
  clinicMembershipLookupQuerySchema,
  clinicServiceUsageSchema,
  approveMembershipReplacementSchema,
  rejectMembershipReplacementSchema,
  completeMembershipReplacementSchema,
  membershipApplicationListQuerySchema,
  membershipCampaignListQuerySchema,
  membershipChildListQuerySchema,
  membershipCoveredPetListQuerySchema,
  membershipListQuerySchema,
  membershipReplacementListQuerySchema,
  membershipReplacementReviewSchema,
  membershipServiceUsageListQuerySchema,
  membershipUpgradeCreateSchema,
  membershipUpgradeCreateForMembershipSchema,
  membershipUpgradeListQuerySchema,
  membershipUpgradePaymentSchema,
  membershipUpgradeReviewSchema,
  updateMembershipApplicationSchema,
  updateMembershipBenefitSchema,
  updateMembershipCampaignSchema,
  updateMembershipDocumentSchema,
  updateMembershipFaqSchema,
  updateMembershipMediaSchema,
  updateMembershipPlanSchema,
  submitMembershipApplicationSchema,
} from "./membership-campaign.types";
import {
  activateMembershipFromApplicationHandler,
  createAdminBenefitHandler,
  createAdminCampaignHandler,
  createAdminDocumentHandler,
  createAdminFaqHandler,
  createAdminMediaHandler,
  createAdminPlanHandler,
  createMembershipApplicationHandler,
  createMembershipPaymentHandler,
  createMembershipReplacementRequestHandler,
  createMembershipUpgradeHandler,
  clinicCreatePetHandler,
  clinicCreateMembershipReplacementRequestHandler,
  clinicCreateServiceUsageHandler,
  clinicGetMembershipHandler,
  clinicGetMembershipPetsHandler,
  clinicLinkCoveredPetHandler,
  clinicLookupMembershipHandler,
  deleteAdminBenefitHandler,
  deleteAdminCampaignHandler,
  deleteAdminDocumentHandler,
  deleteAdminFaqHandler,
  deleteAdminMediaHandler,
  deleteAdminPlanHandler,
  completeMembershipReplacementHandler,
  getAdminCampaignHandler,
  getAdminCampaignPreviewHandler,
  getAdminApplicationHandler,
  getAdminMembershipHandler,
  getAdminPlanHistoryHandler,
  getAdminUpgradeHandler,
  getAdminMembershipPetReplacementHandler,
  getMembershipReportsHandler,
  getMyMembershipApplicationHandler,
  getMyMembershipHandler,
  getMyMembershipUpgradeHandler,
  getMyMembershipUpgradeOptionsHandler,
  getPublicCampaignHandler,
  listActiveCampaignsHandler,
  listAdminApplicationsHandler,
  listAdminBenefitsHandler,
  listAdminCampaignsHandler,
  listAdminCoveredPetsHandler,
  listAdminDocumentsHandler,
  listAdminFaqsHandler,
  listAdminMediaHandler,
  listAdminMembershipsHandler,
  listAdminMembershipPetReplacementsHandler,
  listAdminPlansHandler,
  listAdminReplacementsHandler,
  listAdminServiceUsageHandler,
  listAdminUpgradesHandler,
  listMyMembershipApplicationsHandler,
  listMyMembershipsHandler,
  listMyMembershipEligiblePetsHandler,
  linkMyMembershipPetHandler,
  unlinkMyMembershipPetHandler,
  getMyMembershipBenefitsHandler,
  getMyMembershipBenefitHistoryHandler,
  cancelMyMembershipHandler,
  getMyMembershipRenewalOptionsHandler,
  applyForMembershipRenewalHandler,
  approveMembershipReplacementHandler,
  createMyMembershipUpgradeHandler,
  createMyMembershipUpgradePaymentHandler,
  rejectMembershipReplacementHandler,
  reviewAdminApplicationHandler,
  reviewAdminReplacementHandler,
  reviewAdminUpgradeHandler,
  submitMembershipApplicationHandler,
  updateAdminBenefitHandler,
  updateAdminCampaignHandler,
  updateAdminDocumentHandler,
  updateAdminFaqHandler,
  updateAdminMediaHandler,
  updateAdminMembershipStatusHandler,
  updateAdminPlanHandler,
  updateMembershipApplicationHandler,
  syncAdminPlansHandler,
} from "./membership-campaign.controller";

const publicRouter = Router();
const meRouter = Router();
const adminRouter = Router();
const clinicRouter = Router();

/**
 * @openapi
 * /api/v1/membership/campaigns/active:
 *   get:
 *     tags: [Membership Public]
 *     summary: List active BPA membership campaigns
 */
publicRouter.get(
  "/campaigns/active",
  publicReadLimiter,
  listActiveCampaignsHandler,
);
publicRouter.get(
  "/campaigns/:slug",
  publicReadLimiter,
  getPublicCampaignHandler,
);

publicRouter.use(requireCentralAuthUser);
publicRouter.use(requireLocalUser);
publicRouter.post(
  "/applications",
  publicFormLimiter,
  validate(createMembershipApplicationSchema),
  createMembershipApplicationHandler,
);
publicRouter.patch(
  "/applications/:id",
  validateUuid("id"),
  validate(updateMembershipApplicationSchema),
  updateMembershipApplicationHandler,
);
publicRouter.post(
  "/applications/:id/submit",
  validateUuid("id"),
  validate(submitMembershipApplicationSchema),
  submitMembershipApplicationHandler,
);
publicRouter.post(
  "/applications/:id/payment",
  validateUuid("id"),
  validate(createMembershipPaymentSchema),
  createMembershipPaymentHandler,
);
publicRouter.post(
  "/upgrades",
  validate(membershipUpgradeCreateSchema),
  createMembershipUpgradeHandler,
);
publicRouter.post(
  "/memberships/:membershipId/pet-replacements",
  validateUuid("membershipId"),
  validate(createMembershipReplacementSchema),
  createMembershipReplacementRequestHandler,
);

meRouter.use(requireCentralAuthUser);
meRouter.use(requireLocalUser);
meRouter.get("/membership-applications", listMyMembershipApplicationsHandler);
meRouter.get(
  "/membership-applications/:id",
  validateUuid("id"),
  getMyMembershipApplicationHandler,
);
meRouter.get(
  "/memberships",
  validate(membershipListQuerySchema, "query"),
  listMyMembershipsHandler,
);
meRouter.get(
  "/memberships/:membershipId",
  validateUuidWithCode("membershipId", "MEMBERSHIP_INVALID_ID"),
  getMyMembershipHandler,
);
meRouter.get(
  "/memberships/:membershipId/pets",
  validateUuid("membershipId"),
  listMyMembershipEligiblePetsHandler,
);
meRouter.post(
  "/memberships/:membershipId/pets",
  validateUuid("membershipId"),
  validate(clinicLinkCoveredPetSchema),
  linkMyMembershipPetHandler,
);
meRouter.delete(
  "/memberships/:membershipId/pets/:petId",
  validateUuid("membershipId"),
  validateUuid("petId"),
  unlinkMyMembershipPetHandler,
);
meRouter.get(
  "/memberships/:membershipId/benefits",
  validateUuid("membershipId"),
  getMyMembershipBenefitsHandler,
);
meRouter.get(
  "/memberships/:membershipId/benefits/:benefitId/history",
  validateUuid("membershipId"),
  getMyMembershipBenefitHistoryHandler,
);
meRouter.post(
  "/memberships/:membershipId/cancel",
  validateUuid("membershipId"),
  validate(cancelMembershipSchema),
  cancelMyMembershipHandler,
);
meRouter.get(
  "/memberships/:membershipId/renewal-options",
  validateUuid("membershipId"),
  getMyMembershipRenewalOptionsHandler,
);
meRouter.post(
  "/memberships/:membershipId/renewal-apply",
  validateUuid("membershipId"),
  validate(membershipRenewalApplySchema),
  applyForMembershipRenewalHandler,
);
meRouter.get(
  "/memberships/:membershipId/upgrade-options",
  validateUuid("membershipId"),
  getMyMembershipUpgradeOptionsHandler,
);
meRouter.post(
  "/memberships/:membershipId/upgrades",
  validateUuid("membershipId"),
  validate(membershipUpgradeCreateForMembershipSchema),
  createMyMembershipUpgradeHandler,
);
meRouter.get(
  "/membership-upgrades/:upgradeId",
  validateUuid("upgradeId"),
  getMyMembershipUpgradeHandler,
);
meRouter.post(
  "/membership-upgrades/:upgradeId/payment",
  validateUuid("upgradeId"),
  validate(membershipUpgradePaymentSchema),
  createMyMembershipUpgradePaymentHandler,
);

adminRouter.use(authenticate);
adminRouter.get(
  "/campaigns",
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.READ),
  validate(membershipCampaignListQuerySchema, "query"),
  listAdminCampaignsHandler,
);
adminRouter.get(
  "/campaigns/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.READ),
  getAdminCampaignHandler,
);
adminRouter.get(
  "/campaigns/:id/preview",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.READ),
  getAdminCampaignPreviewHandler,
);
adminRouter.post(
  "/campaigns",
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.CREATE),
  validate(createMembershipCampaignSchema),
  createAdminCampaignHandler,
);
adminRouter.post(
  "/campaigns/:id/plans/sync",
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.CREATE),
  syncAdminPlansHandler,
);
adminRouter.put(
  "/campaigns/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.UPDATE),
  validate(updateMembershipCampaignSchema),
  updateAdminCampaignHandler,
);
adminRouter.delete(
  "/campaigns/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_CAMPAIGNS, ACTIONS.DELETE),
  deleteAdminCampaignHandler,
);

adminRouter.get(
  "/plans",
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.READ),
  validate(membershipChildListQuerySchema, "query"),
  listAdminPlansHandler,
);
adminRouter.get(
  "/plans/:id/history",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.READ),
  getAdminPlanHistoryHandler,
);
adminRouter.post(
  "/plans",
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.CREATE),
  validate(createMembershipPlanSchema),
  createAdminPlanHandler,
);
adminRouter.put(
  "/plans/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.UPDATE),
  validate(updateMembershipPlanSchema),
  updateAdminPlanHandler,
);
adminRouter.delete(
  "/plans/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.DELETE),
  deleteAdminPlanHandler,
);

adminRouter.get(
  "/benefits",
  authorize(RESOURCES.MEMBERSHIP_BENEFITS, ACTIONS.READ),
  validate(membershipChildListQuerySchema, "query"),
  listAdminBenefitsHandler,
);
adminRouter.post(
  "/benefits",
  authorize(RESOURCES.MEMBERSHIP_BENEFITS, ACTIONS.CREATE),
  validate(createMembershipBenefitSchema),
  createAdminBenefitHandler,
);
adminRouter.put(
  "/benefits/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_BENEFITS, ACTIONS.UPDATE),
  validate(updateMembershipBenefitSchema),
  updateAdminBenefitHandler,
);
adminRouter.delete(
  "/benefits/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_BENEFITS, ACTIONS.DELETE),
  deleteAdminBenefitHandler,
);

adminRouter.get(
  "/media",
  authorize(RESOURCES.MEMBERSHIP_MEDIA, ACTIONS.READ),
  validate(membershipChildListQuerySchema, "query"),
  listAdminMediaHandler,
);
adminRouter.post(
  "/media",
  authorize(RESOURCES.MEMBERSHIP_MEDIA, ACTIONS.CREATE),
  validate(createMembershipMediaSchema),
  createAdminMediaHandler,
);
adminRouter.put(
  "/media/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_MEDIA, ACTIONS.UPDATE),
  validate(updateMembershipMediaSchema),
  updateAdminMediaHandler,
);
adminRouter.delete(
  "/media/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_MEDIA, ACTIONS.DELETE),
  deleteAdminMediaHandler,
);

adminRouter.get(
  "/documents",
  authorize(RESOURCES.MEMBERSHIP_DOCUMENTS, ACTIONS.READ),
  validate(membershipChildListQuerySchema, "query"),
  listAdminDocumentsHandler,
);
adminRouter.post(
  "/documents",
  authorize(RESOURCES.MEMBERSHIP_DOCUMENTS, ACTIONS.CREATE),
  validate(createMembershipDocumentSchema),
  createAdminDocumentHandler,
);
adminRouter.put(
  "/documents/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_DOCUMENTS, ACTIONS.UPDATE),
  validate(updateMembershipDocumentSchema),
  updateAdminDocumentHandler,
);
adminRouter.delete(
  "/documents/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_DOCUMENTS, ACTIONS.DELETE),
  deleteAdminDocumentHandler,
);

adminRouter.get(
  "/faqs",
  authorize(RESOURCES.MEMBERSHIP_FAQS, ACTIONS.READ),
  validate(membershipChildListQuerySchema, "query"),
  listAdminFaqsHandler,
);
adminRouter.post(
  "/faqs",
  authorize(RESOURCES.MEMBERSHIP_FAQS, ACTIONS.CREATE),
  validate(createMembershipFaqSchema),
  createAdminFaqHandler,
);
adminRouter.put(
  "/faqs/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_FAQS, ACTIONS.UPDATE),
  validate(updateMembershipFaqSchema),
  updateAdminFaqHandler,
);
adminRouter.delete(
  "/faqs/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_FAQS, ACTIONS.DELETE),
  deleteAdminFaqHandler,
);

adminRouter.get(
  "/applications",
  authorize(RESOURCES.MEMBERSHIP_APPLICATIONS, ACTIONS.READ),
  validate(membershipApplicationListQuerySchema, "query"),
  listAdminApplicationsHandler,
);
adminRouter.get(
  "/applications/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_APPLICATIONS, ACTIONS.READ),
  getAdminApplicationHandler,
);
adminRouter.post(
  "/applications/:id/review",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_APPLICATIONS, ACTIONS.UPDATE),
  validate(adminMembershipApplicationReviewSchema),
  reviewAdminApplicationHandler,
);
adminRouter.post(
  "/applications/:id/activate",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.UPDATE),
  validate(adminMembershipActivationSchema),
  activateMembershipFromApplicationHandler,
);

adminRouter.get(
  "/memberships",
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.READ),
  validate(membershipListQuerySchema, "query"),
  listAdminMembershipsHandler,
);
adminRouter.get(
  "/memberships/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.READ),
  getAdminMembershipHandler,
);
adminRouter.patch(
  "/memberships/:id/status",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.UPDATE),
  validate(adminMembershipStatusSchema),
  updateAdminMembershipStatusHandler,
);
adminRouter.get(
  "/covered-pets",
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.READ),
  validate(membershipCoveredPetListQuerySchema, "query"),
  listAdminCoveredPetsHandler,
);
adminRouter.get(
  "/service-usage",
  authorize(RESOURCES.MEMBERSHIP_MEMBERSHIPS, ACTIONS.READ),
  validate(membershipServiceUsageListQuerySchema, "query"),
  listAdminServiceUsageHandler,
);

adminRouter.get(
  "/replacements",
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.READ),
  validate(membershipReplacementListQuerySchema, "query"),
  listAdminReplacementsHandler,
);
adminRouter.post(
  "/replacements/:id/review",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.UPDATE),
  validate(membershipReplacementReviewSchema),
  reviewAdminReplacementHandler,
);
adminRouter.get(
  "/membership-pet-replacements",
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.READ),
  validate(membershipReplacementListQuerySchema, "query"),
  listAdminMembershipPetReplacementsHandler,
);
adminRouter.get(
  "/membership-pet-replacements/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.READ),
  getAdminMembershipPetReplacementHandler,
);
adminRouter.post(
  "/membership-pet-replacements/:id/approve",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.UPDATE),
  validate(approveMembershipReplacementSchema),
  approveMembershipReplacementHandler,
);
adminRouter.post(
  "/membership-pet-replacements/:id/reject",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.UPDATE),
  validate(rejectMembershipReplacementSchema),
  rejectMembershipReplacementHandler,
);
adminRouter.post(
  "/membership-pet-replacements/:id/complete",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENTS, ACTIONS.UPDATE),
  validate(completeMembershipReplacementSchema),
  completeMembershipReplacementHandler,
);

adminRouter.get(
  "/upgrades",
  authorize(RESOURCES.MEMBERSHIP_UPGRADES, ACTIONS.READ),
  validate(membershipUpgradeListQuerySchema, "query"),
  listAdminUpgradesHandler,
);
adminRouter.get(
  "/upgrades/:id",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_UPGRADES, ACTIONS.READ),
  getAdminUpgradeHandler,
);
adminRouter.post(
  "/upgrades/:id/review",
  validateUuid("id"),
  authorize(RESOURCES.MEMBERSHIP_UPGRADES, ACTIONS.UPDATE),
  validate(membershipUpgradeReviewSchema),
  reviewAdminUpgradeHandler,
);

adminRouter.get(
  "/reports",
  authorize(RESOURCES.MEMBERSHIP_REPORTS, ACTIONS.READ),
  getMembershipReportsHandler,
);

clinicRouter.use(authenticate);
clinicRouter.get(
  "/lookup",
  authorize(RESOURCES.MEMBERSHIP_LOOKUP, ACTIONS.READ),
  validate(clinicMembershipLookupQuerySchema, "query"),
  clinicLookupMembershipHandler,
);
clinicRouter.get(
  "/:membershipId",
  validateUuid("membershipId"),
  authorize(RESOURCES.MEMBERSHIP_LOOKUP, ACTIONS.READ),
  validate(clinicMembershipContextQuerySchema, "query"),
  clinicGetMembershipHandler,
);
clinicRouter.get(
  "/:membershipId/pets",
  validateUuid("membershipId"),
  authorize(RESOURCES.MEMBERSHIP_LOOKUP, ACTIONS.READ),
  validate(clinicMembershipContextQuerySchema, "query"),
  clinicGetMembershipPetsHandler,
);
clinicRouter.post(
  "/:membershipId/pets",
  validateUuid("membershipId"),
  authorize(RESOURCES.PETS, ACTIONS.CREATE),
  validate(clinicMembershipContextQuerySchema, "query"),
  validate(clinicCreatePetSchema),
  clinicCreatePetHandler,
);
clinicRouter.post(
  "/:membershipId/covered-pets",
  validateUuid("membershipId"),
  authorize(RESOURCES.MEMBERSHIP_PET_LINK, ACTIONS.CREATE),
  validate(clinicMembershipContextQuerySchema, "query"),
  validate(clinicLinkCoveredPetSchema),
  clinicLinkCoveredPetHandler,
);
clinicRouter.post(
  "/:membershipId/service-usage",
  validateUuid("membershipId"),
  authorize(RESOURCES.MEMBERSHIP_SERVICE_PROVIDE, ACTIONS.CREATE),
  validate(clinicServiceUsageSchema),
  clinicCreateServiceUsageHandler,
);
clinicRouter.post(
  "/:membershipId/pet-replacements",
  validateUuid("membershipId"),
  authorize(RESOURCES.MEMBERSHIP_REPLACEMENT_REQUEST, ACTIONS.CREATE),
  validate(createMembershipReplacementSchema),
  clinicCreateMembershipReplacementRequestHandler,
);

export {
  publicRouter as membershipCampaignPublicRouter,
  meRouter as membershipCampaignMeRouter,
  adminRouter as membershipCampaignAdminRouter,
  clinicRouter as membershipCampaignClinicRouter,
};
