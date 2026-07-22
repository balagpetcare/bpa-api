import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../database/prisma';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as svc from './community-membership.service';
import * as repo from './community-membership.repository';
import { isEPSConfigured } from '../../services/eps.service';
import { config } from '../../config';
import type {
  CreateTierDto, CreateServiceDto,
  CreateDiscountDto, CreateBenefitDto, UpdateBenefitDto,
  InitiatePurchaseDto, UpgradeQuoteDto, UpgradeRequestDto,
  CreateDocumentDto, UpdateDocumentDto,
  LookupMembershipDto, SubmitUpgradeTransactionDto, SubmitPurchaseTransactionDto,
} from './community-membership.types';

// ─── Dashboard ───────────────────────────────────────────────────

export async function getDashboardHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.getDashboardStats()); }
  catch (err) { next(err); }
}

// ─── Program ─────────────────────────────────────────────────────

export async function getProgramHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const program = await repo.getOrCreateDefaultProgram();
    sendSuccess(res, program);
  }
  catch (err) { next(err); }
}

export async function updateProgramHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.upsertProgram(req.body);
    auditUpdate('community_membership_program', 'default', {}, req.body, auditContextFromRequest(req));
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

// ─── Public Overview ─────────────────────────────────────────────

export async function getPublicOverviewHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.getPublicOverview()); }
  catch (err) { next(err); }
}

// ─── Public Settings (program metadata + computed offer state) ────

export async function getPublicSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const program = await repo.getOrCreateDefaultProgram();
    const now = new Date();
    let isOfferActive = false;
    let offerRemainingSeconds = 0;

    if (program?.offerStartAt && program?.offerEndAt) {
      if (now >= new Date(program.offerStartAt) && now <= new Date(program.offerEndAt)) {
        isOfferActive = true;
        offerRemainingSeconds = Math.max(0, Math.floor((new Date(program.offerEndAt).getTime() - now.getTime()) / 1000));
      }
    }

    sendSuccess(res, {
      ...program,
      isOfferActive,
      offerRemainingSeconds,
      launchOfferEnabled: isOfferActive,
      programActive: program?.isActive ?? true,
      paymentMode: (isEPSConfigured() && config.EPS_ENABLED === 'true' && config.PAYMENT_CHANNEL_MODE !== 'MANUAL') ? 'eps' : 'manual',
    });
  } catch (err) { next(err); }
}

// ─── Public Benefits ──────────────────────────────────────────────

export async function listPublicBenefitsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listBenefits(false)); }
  catch (err) { next(err); }
}

// ─── Tiers ───────────────────────────────────────────────────────

export async function listTiersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.listTiers(req.query as any);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function listPublicTiersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.listTiers(req.query as any);
    const items = result.items.map((tier: any) => ({
      ...tier,
      benefits: (tier.benefits ?? []).map((b: any) => ({
        ...(b.benefit ?? b),
      })),
    }));
    sendSuccess(res, items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tier = await repo.getTierById(req.params.id);
    if (!tier) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, tier);
  } catch (err) { next(err); }
}

export async function getTierBySlugHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tier = await repo.getTierBySlug(req.params.slug);
    if (!tier) { sendSuccess(res, null, 404); return; }
    // Map benefits flat for public API — nested { benefit: { titleEn } } → { titleEn }
    const mapped = {
      ...tier,
      benefits: (tier.benefits ?? []).map((b: any) => ({
        ...(b.benefit ?? b),
      })),
    };
    sendSuccess(res, mapped);
  } catch (err) { next(err); }
}

export async function createTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateTierDto;
    const tier = await repo.createTier({
      nameEn: dto.nameEn, nameBn: dto.nameBn, slug: dto.slug as any,
      launchPriceBdt: dto.launchPriceBdt, regularPriceBdt: dto.regularPriceBdt,
      petLimitMin: dto.petLimitMin, petLimitMax: dto.petLimitMax, validityMonths: dto.validityMonths,
      badgeTextEn: dto.badgeTextEn ?? null, badgeTextBn: dto.badgeTextBn ?? null,
      shortDescEn: dto.shortDescEn ?? null, shortDescBn: dto.shortDescBn ?? null,
      fullDescEn: dto.fullDescEn ?? null, fullDescBn: dto.fullDescBn ?? null,
      cardTheme: dto.cardTheme ?? 'primary', isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0,
    });
    auditCreate('community_membership_tiers', tier.id, {}, auditContextFromRequest(req));
    sendCreated(res, tier);
  } catch (err) { next(err); }
}

export async function updateTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.updateTier(req.params.id, req.body);
    auditUpdate('community_membership_tiers', req.params.id, {}, req.body, auditContextFromRequest(req));
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function deleteTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const old = await repo.getTierById(req.params.id);
    await repo.deleteTier(req.params.id);
    if (old) auditDelete('community_membership_tiers', req.params.id, old, auditContextFromRequest(req));
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
}

// ─── Services ────────────────────────────────────────────────────

export async function listServicesHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listServices(true)); }
  catch (err) { next(err); }
}

export async function createServiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateServiceDto;
    const sv = await repo.createService({
      nameEn: dto.nameEn, nameBn: dto.nameBn, category: dto.category as any,
      basePriceBdt: dto.basePriceBdt, descriptionEn: dto.descriptionEn ?? null, descriptionBn: dto.descriptionBn ?? null,
      isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0,
    });
    auditCreate('community_membership_services', sv.id, {}, auditContextFromRequest(req));
    sendCreated(res, sv);
  } catch (err) { next(err); }
}

export async function updateServiceHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.updateService(req.params.id, req.body)); }
  catch (err) { next(err); }
}

export async function deleteServiceHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteService(req.params.id); sendSuccess(res, { deleted: true }); }
  catch (err) { next(err); }
}

// ─── Discounts ───────────────────────────────────────────────────

export async function listDiscountsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listDiscounts(true)); }
  catch (err) { next(err); }
}

export async function upsertDiscountHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateDiscountDto;
    const discount = await repo.upsertDiscount({
      discountType: dto.discountType as any, discountValue: dto.discountValue,
      minDiscount: dto.minDiscount ?? null, maxDiscount: dto.maxDiscount ?? null,
      isActive: dto.isActive ?? true, tier: { connect: { id: dto.tierId } },
      service: { connect: { id: dto.serviceId } },
    }, dto.tierId, dto.serviceId);
    sendCreated(res, discount);
  } catch (err) { next(err); }
}

export async function deleteDiscountHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteDiscount(req.params.id); sendSuccess(res, { deleted: true }); }
  catch (err) { next(err); }
}

// ─── Benefits ────────────────────────────────────────────────────

export async function listBenefitsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listBenefits(true)); }
  catch (err) { next(err); }
}

export async function getBenefitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const b = await repo.getBenefitById(req.params.id);
    if (!b) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, b);
  } catch (err) { next(err); }
}

export async function createBenefitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateBenefitDto;
    const { tierIds, ...benefitData } = dto;
    const benefit = await repo.createBenefit({
      titleEn: benefitData.titleEn, titleBn: benefitData.titleBn,
      descriptionEn: benefitData.descriptionEn ?? null, descriptionBn: benefitData.descriptionBn ?? null,
      icon: benefitData.icon ?? null, sortOrder: benefitData.sortOrder ?? 0,
      isActive: benefitData.isActive ?? true,
    });
    if (tierIds && tierIds.length > 0) await repo.setBenefitTierMappings(benefit.id, tierIds);
    auditCreate('community_membership_benefits', benefit.id, {}, auditContextFromRequest(req));
    sendCreated(res, benefit);
  } catch (err) { next(err); }
}

export async function updateBenefitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as UpdateBenefitDto;
    const { tierIds, ...benefitData } = dto;
    const benefit = await repo.updateBenefit(req.params.id, benefitData);
    if (tierIds !== undefined) await repo.setBenefitTierMappings(req.params.id, tierIds);
    sendSuccess(res, benefit);
  } catch (err) { next(err); }
}

export async function deleteBenefitHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteBenefit(req.params.id); sendSuccess(res, { deleted: true }); }
  catch (err) { next(err); }
}

// ─── Purchase ────────────────────────────────────────────────────

export async function initiatePurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;
    sendCreated(res, await svc.initiatePurchase(req.body as InitiatePurchaseDto, ip));
  } catch (err) { next(err); }
}

export async function listPurchasesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.listPurchases(req.query as any);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getPurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await repo.getPurchaseById(req.params.id);
    if (!purchase) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, purchase);
  } catch (err) { next(err); }
}

export async function updatePurchaseStatusHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.adminUpdatePurchaseStatus(req.params.id, req.body.status)); }
  catch (err) { next(err); }
}

export async function adminSettlePurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.adminSettlePurchase(req.params.id, req.body.note)); }
  catch (err) { next(err); }
}

export async function adminRejectPurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.adminRejectPurchase(req.params.id, req.body.reason)); }
  catch (err) { next(err); }
}

// ─── Card ────────────────────────────────────────────────────────

export async function getCardByPurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const card = await repo.getCardByPurchaseId(req.params.id);
    if (!card) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, card);
  } catch (err) { next(err); }
}

export async function regenerateCardPdfHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.regenerateCardPdf(req.params.id)); }
  catch (err) { next(err); }
}

// ─── Card Verification (Public) ──────────────────────────────────

export async function verifyCardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as any;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;
    sendSuccess(res, await svc.verifyCard(query, ip, req.headers['user-agent']));
  } catch (err) { next(err); }
}

// ─── Membership Lookup ───────────────────────────────────────────

export async function lookupMembershipHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.lookupMembership(req.body as LookupMembershipDto)); }
  catch (err) { next(err); }
}

// ─── Upgrade ─────────────────────────────────────────────────────

export async function submitUpgradeTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.submitUpgradeTransaction(req.body as SubmitUpgradeTransactionDto)); }
  catch (err) { next(err); }
}

export async function getUpgradeQuoteHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.getUpgradeQuote(req.body as UpgradeQuoteDto)); }
  catch (err) { next(err); }
}

export async function requestUpgradeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress;
    sendCreated(res, await svc.requestUpgrade(req.body as UpgradeRequestDto, ip));
  } catch (err) { next(err); }
}

export async function listUpgradesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await repo.listUpgrades(req.query as any);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getUpgradeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const upgrade = await repo.getUpgradeById(req.params.id);
    if (!upgrade) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, upgrade);
  } catch (err) { next(err); }
}

export async function adminSettleUpgradeHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.adminSettleUpgrade(req.params.id, req.body.note)); }
  catch (err) { next(err); }
}

// ─── Documents ───────────────────────────────────────────────────

export async function listDocumentsHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.listDocuments()); }
  catch (err) { next(err); }
}

export async function getDocumentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await repo.getDocumentById(req.params.id);
    if (!doc) { sendSuccess(res, null, 404); return; }
    sendSuccess(res, doc);
  } catch (err) { next(err); }
}

export async function createDocumentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as CreateDocumentDto;
    const doc = await repo.createDocument({
      documentType: dto.documentType, titleEn: dto.titleEn, titleBn: dto.titleBn,
      contentEn: dto.contentEn ?? null, contentBn: dto.contentBn ?? null, isActive: dto.isActive ?? true,
    });
    auditCreate('community_membership_documents', doc.id, {}, auditContextFromRequest(req));
    sendCreated(res, doc);
  } catch (err) { next(err); }
}

export async function updateDocumentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = req.body as UpdateDocumentDto;
    const existing = await repo.getDocumentById(req.params.id);
    if (!existing) throw AppError.notFound('Document');
    const data: any = { ...dto };
    if (dto.contentEn !== undefined || dto.contentBn !== undefined) data.version = existing.version + 1;
    sendSuccess(res, await repo.updateDocument(req.params.id, data));
  } catch (err) { next(err); }
}

export async function deleteDocumentHandler(req: Request, res: Response, next: NextFunction) {
  try { await repo.deleteDocument(req.params.id); sendSuccess(res, { deleted: true }); }
  catch (err) { next(err); }
}

// ─── PDF Download ────────────────────────────────────────────────

export async function downloadPdfByTokenHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const card = await repo.getCardByDownloadToken(req.params.token);
    if (!card || !card.pdfDocumentKey) { sendSuccess(res, null, 404); return; }
    const { downloadFromStorage } = await import('../../storage/storage.service');
    const pdfBuffer = await downloadFromStorage(card.pdfDocumentKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="membership-card-${card.cardNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
}

// ─── Public Purchase Status ─────────────────────────────────────

export async function getPurchaseStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await repo.getPurchaseById(req.params.id);
    if (!purchase) { sendSuccess(res, null, 404); return; }
    const [pendingUpgrade] = await Promise.all([
      repo.getPendingUpgradeByPurchaseId(purchase.id),
    ]);
    const maskedName = purchase.memberName.length > 2
      ? purchase.memberName[0] + '*'.repeat(purchase.memberName.length - 2) + purchase.memberName[purchase.memberName.length - 1]
      : purchase.memberName;
    sendSuccess(res, {
      id: purchase.id,
      status: purchase.status,
      memberName: maskedName,
      tierName: purchase.tier?.nameEn,
      tierNameBn: purchase.tier?.nameBn,
      amountBdt: Number(purchase.amountBdt),
      petLimit: purchase.petLimit,
      startsAt: purchase.startsAt,
      expiresAt: purchase.expiresAt,
      purchasedAt: purchase.purchasedAt,
      card: purchase.card ? {
        cardNumber: purchase.card.cardNumber,
        status: purchase.card.status,
        qrToken: purchase.card.qrToken,
        pdfDocumentKey: purchase.card.pdfDocumentKey ? true : false,
        downloadToken: purchase.card.downloadToken,
      } : null,
      pendingUpgrade: pendingUpgrade ? {
        upgradeId: pendingUpgrade.id,
        toTierName: pendingUpgrade.toTier.nameEn,
        toTierNameBn: pendingUpgrade.toTier.nameBn,
        upgradeAmount: Number(pendingUpgrade.upgradeAmountBdt),
      } : null,
      preferredZone: purchase.preferredZone ? {
        id: purchase.preferredZone.id,
        name: purchase.preferredZone.name,
        slug: purchase.preferredZone.slug,
        city: purchase.preferredZone.city,
        district: purchase.preferredZone.district,
      } : null,
    });
  } catch (err) { next(err); }
}

// ─── Public Zone Demand ─────────────────────────────────────────

export async function getZoneDemandHandler(_req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await repo.getZoneDemandStats()); }
  catch (err) { next(err); }
}

// ─── Public Submit Transaction (manual mode) ────────────────────

export async function submitTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try { sendSuccess(res, await svc.submitPurchaseTransaction(req.body as SubmitPurchaseTransactionDto)); }
  catch (err) { next(err); }
}

export async function getMembershipStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await svc.getMembershipStatus(req.params.reference);
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
}

export async function downloadReceiptPdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const purchase = await prisma.communityMembershipPurchase.findFirst({
      where: {
        OR: [
          ...(isUuid(reference) ? [{ id: reference }] : []),
          { payment: { merchantTxnId: reference } },
          { payment: { gatewayRef: reference } },
          { payment: { epsTxnId: reference } },
        ]
      },
      include: {
        tier: true,
        payment: true,
        card: true,
        preferredZone: true,
      }
    });

    if (!purchase) {
      throw AppError.notFound('Membership purchase');
    }

    if (purchase.status !== 'paid' || !purchase.card) {
      throw AppError.forbidden('Only paid memberships with issued cards can download receipts. Please contact support.', 'MEMBERSHIP_UNPAID');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="BPA-membership-receipt-${purchase.id}.pdf"`);

    const { streamMembershipReceiptPdf } = await import('../memberships/membership-receipt.pdf');
    await streamMembershipReceiptPdf(purchase, res);
  } catch (err) {
    next(err);
  }
}

export async function downloadCardPdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const purchase = await prisma.communityMembershipPurchase.findFirst({
      where: {
        OR: [
          ...(isUuid(reference) ? [{ id: reference }] : []),
          { payment: { merchantTxnId: reference } },
          { payment: { gatewayRef: reference } },
          { payment: { epsTxnId: reference } },
        ]
      },
      include: {
        tier: true,
        payment: true,
        card: true,
        preferredZone: true,
      }
    });

    if (!purchase) {
      throw AppError.notFound('Membership purchase');
    }

    if (purchase.status !== 'paid' || !purchase.card) {
      throw AppError.forbidden('Only paid memberships with issued cards can download the digital card. Please contact support.', 'MEMBERSHIP_UNPAID');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="BPA-community-care-card-${purchase.card.cardNumber}.pdf"`);

    const { streamMembershipCardPdf } = await import('../memberships/membership-card.pdf');
    await streamMembershipCardPdf(purchase, res);
  } catch (err) {
    next(err);
  }
}

export async function downloadGuidePdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const purchase = await prisma.communityMembershipPurchase.findFirst({
      where: {
        OR: [
          ...(isUuid(reference) ? [{ id: reference }] : []),
          { payment: { merchantTxnId: reference } },
          { payment: { gatewayRef: reference } },
          { payment: { epsTxnId: reference } },
        ]
      },
      include: {
        tier: true,
        payment: true,
        card: true,
        preferredZone: true,
      }
    });

    if (!purchase) {
      throw AppError.notFound('Membership purchase');
    }

    if (purchase.status !== 'paid') {
      throw AppError.forbidden('Only paid memberships can download the membership guide. Please contact support.', 'MEMBERSHIP_UNPAID');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="BPA-membership-guide-${purchase.id}.pdf"`);

    const { streamMembershipGuidePdf } = await import('../memberships/membership-guide.pdf');
    await streamMembershipGuidePdf(purchase, res);
  } catch (err) {
    next(err);
  }
}

export async function downloadWelcomePackPdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const purchase = await prisma.communityMembershipPurchase.findFirst({
      where: {
        OR: [
          ...(isUuid(reference) ? [{ id: reference }] : []),
          { payment: { merchantTxnId: reference } },
          { payment: { gatewayRef: reference } },
          { payment: { epsTxnId: reference } },
        ]
      },
      include: {
        tier: true,
        payment: true,
        card: true,
        preferredZone: true,
      }
    });

    if (!purchase) {
      throw AppError.notFound('Membership purchase');
    }

    if (purchase.status !== 'paid' || !purchase.card) {
      throw AppError.forbidden('Only paid memberships with issued cards can download the welcome pack. Please contact support.', 'MEMBERSHIP_UNPAID');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="BPA-welcome-pack-${purchase.id}.pdf"`);

    const { streamMembershipWelcomePackPdf } = await import('../memberships/membership-welcome-pack.pdf');
    await streamMembershipWelcomePackPdf(purchase, res);
  } catch (err) {
    next(err);
  }
}
