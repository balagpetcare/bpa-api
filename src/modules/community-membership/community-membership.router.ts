import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicFormLimiter, publicReadLimiter, membershipLookupLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createTierSchema, updateTierSchema, tierListQuerySchema,
  createServiceSchema, updateServiceSchema,
  createDiscountSchema,
  createBenefitSchema, updateBenefitSchema,
  initiatePublicPurchaseSchema, purchaseListQuerySchema,
  upgradeQuoteSchema, upgradeRequestSchema, upgradeListQuerySchema,
  createDocumentSchema, updateDocumentSchema,
  verifyCardQuerySchema,
  lookupMembershipSchema, submitUpgradeTransactionSchema, submitPurchaseTransactionSchema,
} from './community-membership.types';
import {
  getDashboardHandler,
  getProgramHandler, updateProgramHandler,
  getPublicOverviewHandler, getPublicSettingsHandler, listPublicBenefitsHandler,
  listTiersHandler, getTierHandler, getTierBySlugHandler, listPublicTiersHandler,
  createTierHandler, updateTierHandler, deleteTierHandler,
  listServicesHandler, createServiceHandler, updateServiceHandler, deleteServiceHandler,
  listDiscountsHandler, upsertDiscountHandler, deleteDiscountHandler,
  listBenefitsHandler, getBenefitHandler, createBenefitHandler, updateBenefitHandler, deleteBenefitHandler,
  initiatePurchaseHandler, listPurchasesHandler, getPurchaseHandler, updatePurchaseStatusHandler,
  adminSettlePurchaseHandler, adminRejectPurchaseHandler,
  getCardByPurchaseHandler, regenerateCardPdfHandler,
  verifyCardHandler,
  lookupMembershipHandler,
  getUpgradeQuoteHandler, requestUpgradeHandler, submitUpgradeTransactionHandler,
  listUpgradesHandler, getUpgradeHandler, adminSettleUpgradeHandler,
  listDocumentsHandler, getDocumentHandler, createDocumentHandler, updateDocumentHandler, deleteDocumentHandler,
  downloadPdfByTokenHandler, getPurchaseStatusHandler, submitTransactionHandler,
  getZoneDemandHandler, getMembershipStatusHandler, downloadReceiptPdfHandler,
  downloadCardPdfHandler, downloadGuidePdfHandler, downloadWelcomePackPdfHandler,
} from './community-membership.controller';
import { updateProgramSchema } from './community-membership.types';

// ─── Admin Router ───────────────────────────────────────────────

const adminRouter = Router();
adminRouter.use(authenticate);

// Dashboard
adminRouter.get('/dashboard', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DASHBOARD, ACTIONS.READ), getDashboardHandler);

// Program settings
adminRouter.get('/program', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PROGRAM, ACTIONS.READ), getProgramHandler);
adminRouter.put('/program', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PROGRAM, ACTIONS.UPDATE), validate(updateProgramSchema), updateProgramHandler);

// Tiers
adminRouter.get('/tiers', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_TIERS, ACTIONS.READ), validate(tierListQuerySchema, 'query'), listTiersHandler);
adminRouter.get('/tiers/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_TIERS, ACTIONS.READ), getTierHandler);
adminRouter.post('/tiers', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_TIERS, ACTIONS.CREATE), validate(createTierSchema), createTierHandler);
adminRouter.put('/tiers/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_TIERS, ACTIONS.UPDATE), validate(updateTierSchema), updateTierHandler);
adminRouter.delete('/tiers/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_TIERS, ACTIONS.DELETE), deleteTierHandler);

// Services
adminRouter.get('/services', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_SERVICES, ACTIONS.READ), listServicesHandler);
adminRouter.post('/services', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_SERVICES, ACTIONS.CREATE), validate(createServiceSchema), createServiceHandler);
adminRouter.put('/services/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_SERVICES, ACTIONS.UPDATE), validate(updateServiceSchema), updateServiceHandler);
adminRouter.delete('/services/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_SERVICES, ACTIONS.DELETE), deleteServiceHandler);

// Discounts
adminRouter.get('/discounts', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DISCOUNTS, ACTIONS.READ), listDiscountsHandler);
adminRouter.post('/discounts', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DISCOUNTS, ACTIONS.CREATE), validate(createDiscountSchema), upsertDiscountHandler);
adminRouter.delete('/discounts/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DISCOUNTS, ACTIONS.DELETE), deleteDiscountHandler);

// Benefits
adminRouter.get('/benefits', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_BENEFITS, ACTIONS.READ), listBenefitsHandler);
adminRouter.get('/benefits/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_BENEFITS, ACTIONS.READ), getBenefitHandler);
adminRouter.post('/benefits', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_BENEFITS, ACTIONS.CREATE), validate(createBenefitSchema), createBenefitHandler);
adminRouter.put('/benefits/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_BENEFITS, ACTIONS.UPDATE), validate(updateBenefitSchema), updateBenefitHandler);
adminRouter.delete('/benefits/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_BENEFITS, ACTIONS.DELETE), deleteBenefitHandler);

// Purchases
adminRouter.get('/purchases', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.READ), validate(purchaseListQuerySchema, 'query'), listPurchasesHandler);
adminRouter.get('/purchases/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.READ), getPurchaseHandler);
adminRouter.put('/purchases/:id/status', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.UPDATE), updatePurchaseStatusHandler);
adminRouter.post('/purchases/:id/settle', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.UPDATE), adminSettlePurchaseHandler);
adminRouter.post('/purchases/:id/reject', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.UPDATE), adminRejectPurchaseHandler);
adminRouter.get('/purchases/:id/card', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.READ), getCardByPurchaseHandler);
adminRouter.post('/purchases/:id/regenerate-pdf', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_PURCHASES, ACTIONS.UPDATE), regenerateCardPdfHandler);

// Upgrades
adminRouter.get('/upgrades', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_UPGRADES, ACTIONS.READ), validate(upgradeListQuerySchema, 'query'), listUpgradesHandler);
adminRouter.get('/upgrades/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_UPGRADES, ACTIONS.READ), getUpgradeHandler);
adminRouter.post('/upgrades/:id/settle', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_UPGRADES, ACTIONS.UPDATE), adminSettleUpgradeHandler);

// Documents
adminRouter.get('/documents', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DOCUMENTS, ACTIONS.READ), listDocumentsHandler);
adminRouter.get('/documents/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DOCUMENTS, ACTIONS.READ), getDocumentHandler);
adminRouter.post('/documents', authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DOCUMENTS, ACTIONS.CREATE), validate(createDocumentSchema), createDocumentHandler);
adminRouter.put('/documents/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DOCUMENTS, ACTIONS.UPDATE), validate(updateDocumentSchema), updateDocumentHandler);
adminRouter.delete('/documents/:id', validateUuid('id'), authorize(RESOURCES.COMMUNITY_MEMBERSHIP_DOCUMENTS, ACTIONS.DELETE), deleteDocumentHandler);

// ─── Public Router ────────────────────────────────────────────────

const publicRouter = Router();

publicRouter.get('/overview', publicReadLimiter, getPublicOverviewHandler);
publicRouter.get('/settings', publicReadLimiter, getPublicSettingsHandler);
publicRouter.get('/benefits', publicReadLimiter, listPublicBenefitsHandler);
publicRouter.get('/zone-demand', publicReadLimiter, getZoneDemandHandler);
publicRouter.get('/tiers', publicReadLimiter, listPublicTiersHandler);
publicRouter.get('/tiers/:slug', publicReadLimiter, getTierBySlugHandler);
publicRouter.get('/services', publicReadLimiter, listServicesHandler);
publicRouter.post('/purchase', publicFormLimiter, validate(initiatePublicPurchaseSchema), initiatePurchaseHandler);
publicRouter.get('/verify', publicReadLimiter, validate(verifyCardQuerySchema, 'query'), verifyCardHandler);
publicRouter.post('/lookup', membershipLookupLimiter, validate(lookupMembershipSchema), lookupMembershipHandler);
publicRouter.post('/upgrade/quote', publicFormLimiter, validate(upgradeQuoteSchema), getUpgradeQuoteHandler);
publicRouter.post('/upgrade/request', publicFormLimiter, validate(upgradeRequestSchema), requestUpgradeHandler);
publicRouter.post('/upgrade/submit-transaction', publicFormLimiter, validate(submitUpgradeTransactionSchema), submitUpgradeTransactionHandler);
publicRouter.get('/download/:token', downloadPdfByTokenHandler);
publicRouter.get('/purchase/:id/status', getPurchaseStatusHandler);
publicRouter.post('/purchase/submit-transaction', publicFormLimiter, validate(submitPurchaseTransactionSchema), submitTransactionHandler);

// Public membership status & PDFs
publicRouter.get('/memberships/:reference', getMembershipStatusHandler);
publicRouter.get('/memberships/:reference/receipt.pdf', downloadReceiptPdfHandler);
publicRouter.get('/memberships/:reference/card.pdf', downloadCardPdfHandler);
publicRouter.get('/memberships/:reference/guide.pdf', downloadGuidePdfHandler);
publicRouter.get('/memberships/:reference/welcome-pack.pdf', downloadWelcomePackPdfHandler);

export { adminRouter as communityMembershipAdminRouter, publicRouter as communityMembershipPublicRouter };
