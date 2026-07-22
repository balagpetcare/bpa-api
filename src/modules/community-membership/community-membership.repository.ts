import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { TierListQuery, PurchaseListQuery, UpgradeListQuery } from './community-membership.types';

// ─── Program ────────────────────────────────────────────────────

export async function getProgram() {
  return prisma.communityMembershipProgram.findUnique({ where: { id: 'default' } });
}

export async function getOrCreateDefaultProgram() {
  const existing = await prisma.communityMembershipProgram.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.communityMembershipProgram.create({
    data: {
      id: 'default',
      nameEn: 'BPA Community Care Partner Card Program',
      nameBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রাম',
      slug: 'community-care-partner-card',
      descriptionEn: 'Join BPA Community Care Partner Card Program and get exclusive benefits for your pets.',
      descriptionBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রামে যোগ দিন এবং আপনার পোষা প্রাণীর জন্য এক্সক্লুসিভ সুবিধা পান।',
      cardValidityLabel: '5-Year Card Validity',
      legalDisclaimer: 'BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return. Service discounts and third-party benefits are subject to availability and partner terms. Clinic zone establishment is subject to sufficient member demand and BPA operational planning.',
      isActive: true,
    },
  });
}

export async function upsertProgram(data: Prisma.CommunityMembershipProgramUpdateInput) {
  return prisma.communityMembershipProgram.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data as any },
    update: data,
  });
}

// ─── Tiers ───────────────────────────────────────────────────────

const tierInclude = {
  serviceDiscounts: {
    where: { isActive: true },
    include: {
      service: { select: { id: true, nameEn: true, nameBn: true, basePriceBdt: true, category: true } },
    },
  },
  benefits: {
    include: {
      benefit: true,
    },
  },
} as const;

export async function listTiers(query: TierListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 50);
  const where: Prisma.CommunityMembershipTierWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const [items, total] = await Promise.all([
    prisma.communityMembershipTier.findMany({
      where, skip, take: limit, orderBy: { sortOrder: 'asc' },
      include: tierInclude,
    }),
    prisma.communityMembershipTier.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listTiersPublic() {
  return prisma.communityMembershipTier.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: tierInclude,
  });
}

export async function getTierById(id: string) {
  return prisma.communityMembershipTier.findUnique({ where: { id }, include: tierInclude });
}

export async function getTierBySlug(slug: string) {
  return prisma.communityMembershipTier.findUnique({
    where: { slug: slug as any },
    include: tierInclude,
  });
}

export async function createTier(data: Prisma.CommunityMembershipTierCreateInput) {
  return prisma.communityMembershipTier.create({ data, include: tierInclude });
}

export async function updateTier(id: string, data: Prisma.CommunityMembershipTierUpdateInput) {
  return prisma.communityMembershipTier.update({ where: { id }, data, include: tierInclude });
}

export async function deleteTier(id: string) {
  return prisma.communityMembershipTier.delete({ where: { id } });
}

// ─── Services ────────────────────────────────────────────────────

export async function listServices(includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  return prisma.communityMembershipService.findMany({ where, orderBy: { sortOrder: 'asc' } });
}

export async function getServiceById(id: string) {
  return prisma.communityMembershipService.findUnique({ where: { id } });
}

export async function createService(data: Prisma.CommunityMembershipServiceCreateInput) {
  return prisma.communityMembershipService.create({ data });
}

export async function updateService(id: string, data: Prisma.CommunityMembershipServiceUpdateInput) {
  return prisma.communityMembershipService.update({ where: { id }, data });
}

export async function deleteService(id: string) {
  return prisma.communityMembershipService.delete({ where: { id } });
}

// ─── Discounts ───────────────────────────────────────────────────

export async function listDiscounts(includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  return prisma.communityTierServiceDiscount.findMany({
    where,
    include: { tier: { select: { id: true, nameEn: true, slug: true } }, service: { select: { id: true, nameEn: true, category: true } } },
  });
}

export async function getDiscountById(id: string) {
  return prisma.communityTierServiceDiscount.findUnique({ where: { id } });
}

export async function upsertDiscount(
  data: Prisma.CommunityTierServiceDiscountCreateInput,
  tierId: string,
  serviceId: string,
) {
  return prisma.communityTierServiceDiscount.upsert({
    where: { tierId_serviceId: { tierId, serviceId } },
    create: data,
    update: data,
  });
}

export async function deleteDiscount(id: string) {
  return prisma.communityTierServiceDiscount.delete({ where: { id } });
}

// ─── Benefits ────────────────────────────────────────────────────

export async function listBenefits(includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  return prisma.communityMembershipBenefit.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: { tierMappings: { include: { tier: { select: { id: true, nameEn: true, slug: true } } } } },
  });
}

export async function getBenefitById(id: string) {
  return prisma.communityMembershipBenefit.findUnique({ where: { id }, include: { tierMappings: true } });
}

export async function createBenefit(data: Prisma.CommunityMembershipBenefitCreateInput) {
  return prisma.communityMembershipBenefit.create({ data });
}

export async function updateBenefit(id: string, data: Prisma.CommunityMembershipBenefitUpdateInput) {
  return prisma.communityMembershipBenefit.update({ where: { id }, data });
}

export async function deleteBenefit(id: string) {
  return prisma.communityMembershipBenefit.delete({ where: { id } });
}

export async function setBenefitTierMappings(benefitId: string, tierIds: string[]) {
  await prisma.communityTierBenefitMapping.deleteMany({ where: { benefitId } });
  if (tierIds.length > 0) {
    await prisma.communityTierBenefitMapping.createMany({
      data: tierIds.map((tierId) => ({ tierId, benefitId })),
    });
  }
}

// ─── Purchases ──────────────────────────────────────────────────

const purchaseInclude = {
  tier: { select: { id: true, nameEn: true, nameBn: true, slug: true, cardTheme: true, petLimitMax: true } },
  payment: true,
  card: true,
  upgrades: { include: { fromTier: { select: { id: true, nameEn: true } }, toTier: { select: { id: true, nameEn: true } }, payment: true } },
  preferredZone: { select: { id: true, name: true, slug: true, city: true, district: true } },
} as const;

export async function listPurchases(query: PurchaseListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CommunityMembershipPurchaseWhereInput = {};
  if (query.status) where.status = query.status as any;
  if (query.tierId) where.tierId = query.tierId;
  if (query.search) {
    where.OR = [
      { memberName: { contains: query.search, mode: 'insensitive' } },
      { memberMobile: { contains: query.search } },
      { card: { cardNumber: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.communityMembershipPurchase.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: purchaseInclude,
    }),
    prisma.communityMembershipPurchase.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPurchaseById(id: string) {
  return prisma.communityMembershipPurchase.findUnique({ where: { id }, include: purchaseInclude });
}

export async function getPurchaseByPaymentId(paymentId: string) {
  return prisma.communityMembershipPurchase.findUnique({ where: { paymentId }, include: purchaseInclude });
}

export async function createPurchase(data: Prisma.CommunityMembershipPurchaseCreateInput) {
  return prisma.communityMembershipPurchase.create({ data, include: purchaseInclude });
}

export async function updatePurchase(id: string, data: Prisma.CommunityMembershipPurchaseUpdateInput) {
  return prisma.communityMembershipPurchase.update({ where: { id }, data, include: purchaseInclude });
}

// ─── Cards ───────────────────────────────────────────────────────

export async function generateCardNumber(): Promise<string> {
  const year = new Date().getFullYear().toString();
  const prefix = `CMP-${year}-`;
  const last = await prisma.communityMembershipCard.findFirst({
    where: { cardNumber: { startsWith: prefix } },
    orderBy: { cardNumber: 'desc' },
  });
  const seq = last ? parseInt(last.cardNumber.slice(-6), 10) + 1 : 1;
  return `${prefix}${seq.toString().padStart(6, '0')}`;
}

export async function createCard(data: Prisma.CommunityMembershipCardCreateInput) {
  return prisma.communityMembershipCard.create({ data });
}

export async function getCardByPurchaseId(purchaseId: string) {
  return prisma.communityMembershipCard.findUnique({ where: { purchaseId } });
}

// Fields safe to return from purchase for public lookup — no email, address, notes, paymentId
const LOOKUP_PURCHASE_SELECT = {
  id: true,
  memberName: true,
  amountBdt: true,
  petLimit: true,
  startsAt: true,
  purchasedAt: true,
  status: true,
  tier: { select: { id: true, nameEn: true, nameBn: true, slug: true, petLimitMax: true } },
} as const;

/** Normalise a BD mobile to last 10 digits (strips country code, spaces, +) */
function normaliseMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Strip leading 880 (country code)
  const stripped = digits.startsWith('880') ? digits.slice(3) : digits;
  // Strip leading 0
  return stripped.startsWith('0') ? stripped.slice(1) : stripped;
}

export async function getCardByQrToken(qrToken: string) {
  return prisma.communityMembershipCard.findUnique({
    where: { qrToken },
    select: {
      id: true, cardNumber: true, qrToken: true, status: true,
      issuedAt: true, expiresAt: true,
      purchase: { select: LOOKUP_PURCHASE_SELECT },
    },
  });
}

export async function getCardByCardNumberAndMobile(cardNumber: string, mobile: string) {
  const normalised = normaliseMobile(mobile);
  // Match stored mobile (which may be 01xxxxxxxxx or +8801xxxxxxxxx) against last 10 digits
  return prisma.communityMembershipCard.findFirst({
    where: {
      cardNumber: { equals: cardNumber.trim().toUpperCase(), mode: 'insensitive' },
      purchase: {
        OR: [
          { memberMobile: { endsWith: normalised } },
          { memberMobile: { endsWith: `0${normalised}` } },
        ],
      },
    },
    select: {
      id: true, cardNumber: true, qrToken: true, status: true,
      issuedAt: true, expiresAt: true,
      purchase: { select: LOOKUP_PURCHASE_SELECT },
    },
  });
}

export async function updateCard(id: string, data: Prisma.CommunityMembershipCardUpdateInput) {
  return prisma.communityMembershipCard.update({ where: { id }, data });
}

export async function getCardByDownloadToken(token: string) {
  return prisma.communityMembershipCard.findFirst({
    where: { downloadToken: token },
    include: { purchase: { include: { tier: true } } },
  });
}

// ─── Verification Logs ──────────────────────────────────────────

export async function logCardVerification(data: {
  cardId: string; qrToken: string; scanResult: string; ipAddress?: string; userAgent?: string;
}) {
  return prisma.communityMembershipCardVerificationLog.create({ data: data as any });
}

// ─── Upgrades ──────────────────────────────────────────────────

export async function listUpgrades(query: UpgradeListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CommunityMembershipUpgradeWhereInput = {};
  if (query.status) where.status = query.status as any;
  const [items, total] = await Promise.all([
    prisma.communityMembershipUpgrade.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: {
        purchase: { select: { id: true, memberName: true, memberMobile: true } },
        fromTier: { select: { id: true, nameEn: true, nameBn: true } },
        toTier: { select: { id: true, nameEn: true, nameBn: true } },
        payment: true,
      },
    }),
    prisma.communityMembershipUpgrade.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function createUpgrade(data: Prisma.CommunityMembershipUpgradeCreateInput) {
  return prisma.communityMembershipUpgrade.create({ data });
}

export async function getPendingUpgradeByPurchaseId(purchaseId: string) {
  return prisma.communityMembershipUpgrade.findFirst({
    where: { purchaseId, status: 'pending_payment' as any },
    include: {
      toTier: { select: { nameEn: true, nameBn: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUpgradeByPurchaseAndTier(purchaseId: string, toTierId: string) {
  return prisma.communityMembershipUpgrade.findFirst({
    where: { purchaseId, toTierId, status: { in: ['pending_payment', 'paid'] as any } },
  });
}

export async function getUpgradeByPaymentId(paymentId: string) {
  return prisma.communityMembershipUpgrade.findUnique({ where: { paymentId } });
}

export async function getUpgradeById(id: string) {
  return prisma.communityMembershipUpgrade.findUnique({
    where: { id },
    include: {
      purchase: { select: { id: true, memberName: true, memberMobile: true, memberEmail: true, petLimit: true } },
      fromTier: { select: { id: true, nameEn: true, nameBn: true } },
      toTier: { select: { id: true, nameEn: true, nameBn: true, petLimitMax: true, validityMonths: true } },
      payment: true,
    },
  });
}

export async function updateUpgrade(id: string, data: Prisma.CommunityMembershipUpgradeUpdateInput) {
  return prisma.communityMembershipUpgrade.update({ where: { id }, data });
}

// ─── Documents ──────────────────────────────────────────────────

export async function listDocuments() {
  return prisma.communityMembershipDocument.findMany({
    where: { isActive: true },
    orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
  });
}

export async function getActiveDocument(documentType: string) {
  return prisma.communityMembershipDocument.findFirst({
    where: { documentType, isActive: true },
    orderBy: { version: 'desc' },
  });
}

export async function getDocumentById(id: string) {
  return prisma.communityMembershipDocument.findUnique({ where: { id } });
}

export async function createDocument(data: Prisma.CommunityMembershipDocumentCreateInput) {
  return prisma.communityMembershipDocument.create({ data });
}

export async function updateDocument(id: string, data: Prisma.CommunityMembershipDocumentUpdateInput) {
  return prisma.communityMembershipDocument.update({ where: { id }, data });
}

export async function deleteDocument(id: string) {
  return prisma.communityMembershipDocument.delete({ where: { id } });
}

// ─── Dashboard Stats ────────────────────────────────────────────

export async function getDashboardStats() {
  const [
    totalMembers,
    totalRevenue,
    activeCards,
    pendingPayments,
    pendingUpgrades,
    program,
    zoneDemand,
  ] = await Promise.all([
    prisma.communityMembershipPurchase.count({ where: { status: 'paid' } }),
    prisma.communityMembershipPurchase.aggregate({
      where: { status: 'paid' },
      _sum: { amountBdt: true },
    }),
    prisma.communityMembershipCard.count({ where: { status: 'active' } }),
    prisma.communityMembershipPurchase.count({ where: { status: 'pending_payment' } }),
    prisma.communityMembershipUpgrade.count({ where: { status: 'pending_payment' } }),
    getProgram(),
    getZoneDemandStats(),
  ]);

  return {
    totalMembers,
    totalRevenue: totalRevenue._sum.amountBdt ?? 0,
    activeCards,
    pendingPayments,
    pendingUpgrades,
    offerActive: program
      ? (program.offerStartAt && program.offerEndAt
        ? new Date() >= program.offerStartAt && new Date() <= program.offerEndAt
        : false)
      : false,
    zoneDemand,
  };
}

export async function getZoneDemandStats() {
  const zones = await prisma.communityZone.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      city: true,
      district: true,
      status: true,
      clinicStatus: true,
      targetMembers: true,
      priorityOrder: true,
      _count: { select: { membershipPurchases: true } },
      membershipPurchases: {
        where: { status: 'paid' },
        select: {
          id: true,
          amountBdt: true,
          card: { select: { status: true } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const withScores = zones.map((z) => {
    const paidPurchases = z.membershipPurchases.length;
    const pendingPurchases = z._count.membershipPurchases - paidPurchases;
    const activeCards = z.membershipPurchases.filter((p) => p.card?.status === 'active').length;
    const totalRevenueBdt = z.membershipPurchases.reduce((sum, p) => sum + Number(p.amountBdt), 0);
    // Active card holders weighted highest: each active card = 3, each paid purchase = 2, each pending = 1
    const demandScore = activeCards * 3 + paidPurchases * 2 + pendingPurchases;
    const progressPercent = z.targetMembers && z.targetMembers > 0
      ? Math.min(100, Math.round((paidPurchases / z.targetMembers) * 100))
      : null;
    return {
      id: z.id,
      name: z.name,
      nameBn: z.nameBn,
      slug: z.slug,
      city: z.city,
      district: z.district,
      status: z.status,
      clinicStatus: z.clinicStatus,
      targetMembers: z.targetMembers,
      priorityOrder: z.priorityOrder,
      paidPurchases,
      totalPurchases: z._count.membershipPurchases,
      activeCards,
      totalRevenueBdt,
      demandScore,
      progressPercent,
    };
  });

  // Rank by active card holders first, then paid purchases, then total (pending included)
  withScores.sort((a, b) =>
    b.activeCards - a.activeCards ||
    b.paidPurchases - a.paidPurchases ||
    b.totalPurchases - a.totalPurchases,
  );

  return withScores.map((z, i) => ({ ...z, rank: i + 1 }));
}
