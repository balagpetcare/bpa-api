import { Prisma, DonationCampaignStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';

// ─── Purposes ───────────────────────────────────────────────────

export async function listPurposes(params: { isActive?: boolean } = {}) {
  return prisma.donationPurpose.findMany({
    where: {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findPurposeById(id: string) {
  return prisma.donationPurpose.findUnique({ where: { id } });
}

export async function findPurposeBySlug(slug: string) {
  return prisma.donationPurpose.findUnique({ where: { slug } });
}

export async function createPurpose(data: Prisma.DonationPurposeCreateInput) {
  return prisma.donationPurpose.create({ data });
}

export async function updatePurpose(id: string, data: Prisma.DonationPurposeUpdateInput) {
  return prisma.donationPurpose.update({ where: { id }, data });
}

export async function deletePurpose(id: string) {
  return prisma.donationPurpose.delete({ where: { id } });
}

// ─── Campaigns ──────────────────────────────────────────────────

export async function listCampaigns(params: {
  status?: DonationCampaignStatus;
  showOnDonatePage?: boolean;
} = {}) {
  return prisma.donationCampaign.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.showOnDonatePage !== undefined ? { showOnDonatePage: params.showOnDonatePage } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { purpose: true },
  });
}

export async function findCampaignBySlug(slug: string) {
  return prisma.donationCampaign.findUnique({ where: { slug }, include: { purpose: true } });
}

export async function findCampaignById(id: string) {
  return prisma.donationCampaign.findUnique({ where: { id }, include: { purpose: true } });
}

export async function createCampaign(data: Prisma.DonationCampaignCreateInput) {
  return prisma.donationCampaign.create({ data });
}

export async function updateCampaign(id: string, data: Prisma.DonationCampaignUpdateInput) {
  return prisma.donationCampaign.update({ where: { id }, data });
}

export async function deleteCampaign(id: string) {
  return prisma.donationCampaign.delete({ where: { id } });
}

export async function updateCampaignProgress(campaignId: string, amount: number) {
  return prisma.donationCampaign.update({
    where: { id: campaignId },
    data: { raisedAmount: { increment: amount } },
  });
}

// ─── Donations ──────────────────────────────────────────────────

export async function createDonation(data: Prisma.DonationCreateInput) {
  return prisma.donation.create({ data });
}

export async function updateDonationStatus(id: string, status: PaymentStatus, gatewayTxnId?: string, paidAt?: Date) {
  return prisma.donation.update({
    where: { id },
    data: { 
      status,
      ...(gatewayTxnId ? { gatewayTransactionId: gatewayTxnId } : {}),
      ...(paidAt ? { paidAt } : {}),
    },
  });
}

export async function updateDonation(id: string, data: Prisma.DonationUpdateInput) {
  return prisma.donation.update({ where: { id }, data });
}

export async function updatePaymentForDonation(
  paymentId: string,
  data: Prisma.PaymentUpdateInput,
) {
  return prisma.payment.update({ where: { id: paymentId }, data });
}

export async function findDonationByReference(referenceNo: string) {
  return prisma.donation.findUnique({
    where: { referenceNo },
    include: { payment: true, purpose: true, campaign: true, qrCode: true },
  });
}

export async function findDonationById(id: string) {
  return prisma.donation.findUnique({
    where: { id },
    include: { payment: true, purpose: true, campaign: true, qrCode: true },
  });
}

export async function findDonationByPaymentId(paymentId: string) {
  return prisma.donation.findUnique({ where: { paymentId }, include: { campaign: true, purpose: true } });
}

export async function getDonorWall(limit = 20) {
  return prisma.donation.findMany({
    where: { status: 'success', showOnDonorWall: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      donorName: true,
      amount: true,
      currency: true,
      isAnonymous: true,
      message: true,
      createdAt: true,
      campaign: { select: { titleEn: true, titleBn: true } },
      purpose: { select: { titleEn: true, titleBn: true } },
    },
  });
}

export async function listDonationsAdmin(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const skip = (page - 1) * limit;

  const where: Prisma.DonationWhereInput = {
    ...(params.status ? { status: params.status as any } : {}),
    ...(params.search ? {
      OR: [
        { referenceNo: { contains: params.search, mode: 'insensitive' } },
        { donorName: { contains: params.search, mode: 'insensitive' } },
        { donorEmail: { contains: params.search, mode: 'insensitive' } },
        { donorPhone: { contains: params.search, mode: 'insensitive' } },
      ],
    } : {}),
    ...((params.dateFrom || params.dateTo) ? {
      createdAt: {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo ? { lte: new Date(new Date(params.dateTo).setHours(23, 59, 59, 999)) } : {}),
      },
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.donation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { campaign: true, purpose: true },
    }),
    prisma.donation.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const meta = { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
  return { items, meta };
}

export async function getDonationsForExport() {
  return prisma.donation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { campaign: true, purpose: true },
  });
}

// ─── Impact Stories ─────────────────────────────────────────────

export async function listImpactStories(params: { status?: string; showOnDonationPage?: boolean; campaignId?: string } = {}) {
  return prisma.donationImpactStory.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.showOnDonationPage !== undefined ? { showOnDonationPage: params.showOnDonationPage } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
    },
    orderBy: { sortOrder: 'asc' },
    include: { purpose: true, campaign: true },
  });
}

export async function createImpactStory(data: Prisma.DonationImpactStoryCreateInput) {
  return prisma.donationImpactStory.create({ data });
}

export async function updateImpactStory(id: string, data: Prisma.DonationImpactStoryUpdateInput) {
  return prisma.donationImpactStory.update({ where: { id }, data });
}

export async function deleteImpactStory(id: string) {
  return prisma.donationImpactStory.delete({ where: { id } });
}

// ─── QR Codes ───────────────────────────────────────────────────

export async function listQrCodes() {
  return prisma.donationQrCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { purpose: true, campaign: true },
  });
}

export async function findQrCodeBySlug(slug: string) {
  return prisma.donationQrCode.findUnique({ where: { slug } });
}

export async function createQrCode(data: Prisma.DonationQrCodeCreateInput) {
  return prisma.donationQrCode.create({ data });
}

export async function updateQrCode(id: string, data: Prisma.DonationQrCodeUpdateInput) {
  return prisma.donationQrCode.update({ where: { id }, data });
}

export async function deleteQrCode(id: string) {
  return prisma.donationQrCode.delete({ where: { id } });
}

export async function incrementQrScanCount(id: string) {
  return prisma.donationQrCode.update({
    where: { id },
    data: { scanCount: { increment: 1 } },
  });
}

// ─── Transparency Reports ───────────────────────────────────────

export async function listTransparencyReports(params: { status?: string } = {}) {
  return prisma.donationTransparencyReport.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { reportMonth: 'desc' },
  });
}

export async function createTransparencyReport(data: Prisma.DonationTransparencyReportCreateInput) {
  return prisma.donationTransparencyReport.create({ data });
}

export async function updateTransparencyReport(id: string, data: Prisma.DonationTransparencyReportUpdateInput) {
  return prisma.donationTransparencyReport.update({ where: { id }, data });
}

export async function deleteTransparencyReport(id: string) {
  return prisma.donationTransparencyReport.delete({ where: { id } });
}

// ─── Settings ───────────────────────────────────────────────────

export async function getDonationPageSettings() {
  let settings = await prisma.donationPageSetting.findFirst({
    where: { isActive: true },
  });

  if (!settings) {
    settings = await prisma.donationPageSetting.create({
      data: {
        heroTitleEn: 'Support Bangladesh Pet Association',
        isActive: true,
      },
    });
  }

  return settings;
}

export async function getDonationImpactCounters() {
  const [successfulDonations, totalRaisedAggregate, donorCount] = await Promise.all([
    prisma.donation.count({ where: { status: 'success' } }),
    prisma.donation.aggregate({ where: { status: 'success' }, _sum: { amount: true } }),
    prisma.donation.count({
      where: {
        status: 'success',
        isAnonymous: false,
      },
    }),
  ]);

  return {
    successfulDonations,
    totalRaised: Number(totalRaisedAggregate._sum.amount || 0),
    donorCount,
  };
}

export async function updateDonationPageSettings(id: string, data: Prisma.DonationPageSettingUpdateInput) {
  return prisma.donationPageSetting.update({ where: { id }, data });
}

// ─── Dashboard Stats ────────────────────────────────────────────

export async function getDashboardStats() {
  const [
    totalDonations,
    successfulDonations,
    totalRaisedAggregate,
    activeCampaigns,
  ] = await Promise.all([
    prisma.donation.count(),
    prisma.donation.count({ where: { status: 'success' } }),
    prisma.donation.aggregate({ where: { status: 'success' }, _sum: { amount: true } }),
    prisma.donationCampaign.count({ where: { status: 'ACTIVE' } }),
  ]);

  const totalRaised = Number(totalRaisedAggregate._sum.amount || 0);

  // Time calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Amounts by status
  const [
    pendingAmountAggr,
    completedAmountAggr,
    failedAmountAggr,
    refundedAmountAggr,
    todayRaisedAggr,
    weekRaisedAggr,
    monthRaisedAggr,
    pendingDonationsCount,
    failedDonationsCount,
    qrDonationsCount,
  ] = await Promise.all([
    prisma.donation.aggregate({
      where: { status: { in: ['pending', 'pending_review'] } },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: 'success' },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: { in: ['failed', 'cancelled'] } },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: 'refunded' },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: 'success', createdAt: { gte: todayStart } },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: 'success', createdAt: { gte: weekStart } },
      _sum: { amount: true }
    }),
    prisma.donation.aggregate({
      where: { status: 'success', createdAt: { gte: monthStart } },
      _sum: { amount: true }
    }),
    prisma.donation.count({
      where: { status: { in: ['pending', 'pending_review'] } }
    }),
    prisma.donation.count({
      where: { status: { in: ['failed', 'cancelled'] } }
    }),
    prisma.donation.count({
      where: {
        OR: [
          { qrCodeId: { not: null } },
          { source: { mode: 'insensitive', contains: 'qr' } }
        ]
      }
    }),
  ]);

  // Unique donors
  const uniqueDonorsList = await prisma.donation.findMany({
    where: { status: 'success' },
    select: { donorEmail: true },
    distinct: ['donorEmail']
  });
  const donorCount = uniqueDonorsList.length;

  // Recurring donors count (more than 1 successful donation)
  const recurringDonorsAggr = await prisma.donation.groupBy({
    by: ['donorEmail'],
    where: { status: 'success', donorEmail: { not: null } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } }
  });
  const recurringDonorCount = recurringDonorsAggr.length;

  // Breakdown by Purpose
  const purposeGroups = await prisma.donation.groupBy({
    by: ['purposeId'],
    where: { status: 'success' },
    _sum: { amount: true },
    _count: { id: true }
  });
  const purposesList = await prisma.donationPurpose.findMany({
    select: { id: true, titleEn: true }
  });
  const purposeMap = new Map(purposesList.map(p => [p.id, p.titleEn]));
  const purposeBreakdown = purposeGroups.map(g => ({
    titleEn: g.purposeId ? (purposeMap.get(g.purposeId) || 'General') : 'General',
    total: Number(g._sum.amount || 0),
    count: g._count.id
  }));

  // Breakdown by Campaign
  const campaignGroups = await prisma.donation.groupBy({
    by: ['campaignId'],
    where: { status: 'success' },
    _sum: { amount: true },
    _count: { id: true }
  });
  const campaignsList = await prisma.donationCampaign.findMany({
    select: { id: true, titleEn: true }
  });
  const campaignMap = new Map(campaignsList.map(c => [c.id, c.titleEn]));
  const campaignBreakdown = campaignGroups.map(g => ({
    titleEn: g.campaignId ? (campaignMap.get(g.campaignId) || 'Direct') : 'Direct/General',
    total: Number(g._sum.amount || 0),
    count: g._count.id
  }));

  // Breakdown by Country
  const countryGroups = await prisma.donation.groupBy({
    by: ['donorCountry'],
    where: { status: 'success' },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });
  const countryBreakdown = countryGroups.map(g => ({
    country: g.donorCountry || 'Bangladesh',
    count: g._count.id
  }));

  // Status breakdown
  const statusGroups = await prisma.donation.groupBy({
    by: ['status'],
    _count: { id: true },
    _sum: { amount: true }
  });
  const donationStatusBreakdown = statusGroups.map(g => ({
    status: g.status,
    count: g._count.id,
    amount: Number(g._sum.amount || 0)
  }));

  // Payment method breakdown
  const sourceGroups = await prisma.donation.groupBy({
    by: ['source'],
    where: { status: 'success' },
    _count: { id: true },
    _sum: { amount: true }
  });
  const paymentMethodBreakdown = sourceGroups.map(g => ({
    method: g.source || 'Online/EPS',
    count: g._count.id,
    amount: Number(g._sum.amount || 0)
  }));

  // Monthly trend for last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const monthlyDonations = await prisma.donation.findMany({
    where: {
      status: 'success',
      createdAt: { gte: sixMonthsAgo }
    },
    select: {
      amount: true,
      createdAt: true
    }
  });

  const monthsList: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    monthsList.push(`${year}-${month}`);
  }

  const trendMap = new Map<string, { total: number; count: number }>();
  monthsList.forEach(m => trendMap.set(m, { total: 0, count: 0 }));

  monthlyDonations.forEach(d => {
    const year = d.createdAt.getFullYear();
    const month = String(d.createdAt.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    if (trendMap.has(key)) {
      const current = trendMap.get(key)!;
      current.total += Number(d.amount);
      current.count += 1;
    }
  });

  const monthlyTrend = monthsList.map(m => {
    const [year, month] = m.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return {
      month: label,
      total: trendMap.get(m)!.total,
      count: trendMap.get(m)!.count
    };
  });

  // Recent donations
  const recentDonations = await prisma.donation.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      campaign: { select: { titleEn: true } },
      purpose: { select: { titleEn: true } }
    }
  });

  // Transparency / Impact Summary
  const [impactStoriesCount, transparencyReportsCount, transparencyAgg] = await Promise.all([
    prisma.donationImpactStory.count(),
    prisma.donationTransparencyReport.count(),
    prisma.donationTransparencyReport.aggregate({
      _sum: { totalReceived: true, totalUsed: true }
    })
  ]);

  const transparencySummary = {
    impactStoriesCount,
    transparencyReportsCount,
    totalReceived: Number(transparencyAgg._sum.totalReceived || 0),
    totalUsed: Number(transparencyAgg._sum.totalUsed || 0)
  };

  return {
    totalDonations,
    successfulDonations,
    totalRaised,
    activeCampaigns,
    todayRaised: Number(todayRaisedAggr._sum.amount || 0),
    monthRaised: Number(monthRaisedAggr._sum.amount || 0),
    thisWeekAmount: Number(weekRaisedAggr._sum.amount || 0),
    pendingDonations: pendingDonationsCount,
    failedDonations: failedDonationsCount,
    qrDonations: qrDonationsCount,
    pendingAmount: Number(pendingAmountAggr._sum.amount || 0),
    completedAmount: Number(completedAmountAggr._sum.amount || 0),
    failedAmount: Number(failedAmountAggr._sum.amount || 0),
    refundedAmount: Number(refundedAmountAggr._sum.amount || 0),
    donorCount,
    recurringDonorCount,
    averageDonationAmount: successfulDonations > 0 ? (totalRaised / successfulDonations) : 0,
    purposeBreakdown,
    campaignBreakdown,
    countryBreakdown,
    donationStatusBreakdown,
    paymentMethodBreakdown,
    monthlyTrend,
    recentDonations,
    transparencySummary
  };
}
