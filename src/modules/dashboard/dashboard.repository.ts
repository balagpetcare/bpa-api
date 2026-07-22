import { prisma } from '../../database/prisma';

// ─── Dashboard Summary ────────────────────────────────────────────

export async function getDashboardSummary() {
  const now = new Date();
  
  // start of today 00:00:00 local
  const startOfToday = new Date(now);
  startOfToday.setHours(0,0,0,0);

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfThisMonth.setHours(0,0,0,0);

  const startOfLastMonth = new Date(startOfThisMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

  const endOfLastMonth = new Date(startOfThisMonth);
  endOfLastMonth.setMilliseconds(-1);

  // Revenue snapshot helper
  const getRevenue = async (from: Date, to?: Date) => {
    const wherePayments = { status: 'success', createdAt: { gte: from, ...(to ? { lte: to } : {}) } };
    const whereDonations = { status: 'success', createdAt: { gte: from, ...(to ? { lte: to } : {}) }, paymentId: null };
    
    const [pSum, dSum] = await Promise.all([
      prisma.payment.aggregate({ where: wherePayments as any, _sum: { amount: true } }),
      prisma.donation.aggregate({ where: whereDonations as any, _sum: { amount: true } })
    ]);
    return Number(pSum._sum.amount || 0) + Number(dSum._sum.amount || 0);
  };

  const [
    todayRevenue,
    monthRevenue,
    lastMonthRevenue,
    totalUsers,
    newUsersToday,
    activeMembers,
    newMembersToday,
    pendingMembershipPayments,
    donationsToday,
    donationAmountTodayAggr,
    activeCampaigns,
    campaignRegistrationsToday,
    pendingCampaignPayments,
    petCensusToday,
    unreadContactInquiries,
    unrepliedContactInquiries,
    failedSmsToday,
    pendingSmsQueue,
    failedPaymentsToday,
    pendingManualPayments,
  ] = await Promise.all([
    getRevenue(startOfToday),
    getRevenue(startOfThisMonth),
    getRevenue(startOfLastMonth, endOfLastMonth),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.membership.count({ where: { status: 'active' } }).catch(() => 0),
    prisma.membership.count({ where: { createdAt: { gte: startOfToday } } }).catch(() => 0),
    prisma.communityMembershipPurchase.count({ where: { status: 'pending_payment' } }).catch(() => 0),
    prisma.donation.count({ where: { status: 'success', createdAt: { gte: startOfToday } } }).catch(() => 0),
    prisma.donation.aggregate({ where: { status: 'success', createdAt: { gte: startOfToday } }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: null } })),
    prisma.campaign.count({ where: { status: { in: ['published', 'registration_open'] } } }),
    prisma.campaignRegistration.count({ where: { createdAt: { gte: startOfToday } } }).catch(() => 0),
    prisma.campaignRegistration.count({ where: { status: 'pending_payment' } }).catch(() => 0),
    prisma.petCensusSubmission.count({ where: { submittedAt: { gte: startOfToday } } }).catch(() => 0),
    prisma.contactInquiry.count({ where: { status: 'new' } }),
    prisma.contactInquiry.count({ where: { status: { in: ['new', 'read', 'pending'] as any[] } } }),
    prisma.smsLog.count({ where: { status: 'failed', createdAt: { gte: startOfToday } } }),
    prisma.smsLog.count({ where: { status: 'queued' } }),
    prisma.payment.count({ where: { status: 'failed', createdAt: { gte: startOfToday } } }),
    prisma.donation.count({ where: { status: 'pending_review' } }).catch(() => 0),
  ]);

  const donationAmountToday = Number((donationAmountTodayAggr as any)?._sum?.amount ?? 0);

  let revenueChangePercent = 0;
  if (lastMonthRevenue > 0) {
    revenueChangePercent = ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
  } else if (monthRevenue > 0) {
    revenueChangePercent = 100;
  }

  // Last 7 days dates list
  const datesList: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    datesList.push(d.toISOString().slice(0, 10));
  }
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0,0,0,0);

  // Chart trends queries
  const [
    payments7d,
    donations7d,
    memberships7d,
    regs7d,
    census7d,
    contacts7d,
    paymentStatusGroups,
    activeCampaignsList,
    donationCampaignsList,
    zoneDemandData
  ] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'success', createdAt: { gte: sevenDaysAgo } },
      select: { amount: true, createdAt: true }
    }),
    prisma.donation.findMany({
      where: { status: 'success', createdAt: { gte: sevenDaysAgo }, paymentId: null },
      select: { amount: true, createdAt: true }
    }),
    prisma.communityMembershipPurchase.findMany({
      where: { status: 'paid', createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, tier: { select: { nameEn: true } } }
    }).catch(() => []),
    prisma.campaignRegistration.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true }
    }).catch(() => []),
    prisma.petCensusSubmission.findMany({
      where: { submittedAt: { gte: sevenDaysAgo } },
      select: { submittedAt: true }
    }).catch(() => []),
    prisma.contactInquiry.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true }
    }),
    prisma.payment.groupBy({
      by: ['status'],
      _count: { id: true }
    }),
    prisma.campaign.findMany({
      where: { status: { in: ['published', 'registration_open'] } },
      select: {
        id: true,
        title: true,
        sessions: { select: { capacity: true, bookedCount: true } }
      },
      take: 5
    }),
    prisma.donationCampaign.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, titleEn: true, goalAmount: true, raisedAmount: true },
      take: 5,
      orderBy: { raisedAmount: 'desc' }
    }),
    prisma.communityZone.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            censusSubmissions: true
          }
        }
      },
      orderBy: {
        censusSubmissions: {
          _count: 'desc'
        }
      },
      take: 10
    }).catch(() => [])
  ]);

  // Aggregate 7 days trend data
  const revenueTrendMap = new Map<string, number>();
  const membershipTrendMap = new Map<string, number>();
  const regTrendMap = new Map<string, number>();
  const censusTrendMap = new Map<string, number>();
  const contactTrendMap = new Map<string, number>();

  datesList.forEach(dt => {
    revenueTrendMap.set(dt, 0);
    membershipTrendMap.set(dt, 0);
    regTrendMap.set(dt, 0);
    censusTrendMap.set(dt, 0);
    contactTrendMap.set(dt, 0);
  });

  payments7d.forEach(p => {
    const dt = p.createdAt.toISOString().slice(0, 10);
    if (revenueTrendMap.has(dt)) revenueTrendMap.set(dt, revenueTrendMap.get(dt)! + Number(p.amount));
  });
  donations7d.forEach(d => {
    const dt = d.createdAt.toISOString().slice(0, 10);
    if (revenueTrendMap.has(dt)) revenueTrendMap.set(dt, revenueTrendMap.get(dt)! + Number(d.amount));
  });
  memberships7d.forEach(m => {
    const dt = m.createdAt.toISOString().slice(0, 10);
    if (membershipTrendMap.has(dt)) membershipTrendMap.set(dt, membershipTrendMap.get(dt)! + 1);
  });
  regs7d.forEach(r => {
    const dt = r.createdAt.toISOString().slice(0, 10);
    if (regTrendMap.has(dt)) regTrendMap.set(dt, regTrendMap.get(dt)! + 1);
  });
  census7d.forEach(c => {
    const dt = c.submittedAt.toISOString().slice(0, 10);
    if (censusTrendMap.has(dt)) censusTrendMap.set(dt, censusTrendMap.get(dt)! + 1);
  });
  contacts7d.forEach(c => {
    const dt = c.createdAt.toISOString().slice(0, 10);
    if (contactTrendMap.has(dt)) contactTrendMap.set(dt, contactTrendMap.get(dt)! + 1);
  });

  const last7DaysRevenue = datesList.map(date => ({ date, amount: revenueTrendMap.get(date)! }));
  const last7DaysMemberships = datesList.map(date => ({ date, count: membershipTrendMap.get(date)! }));
  const last7DaysCampaignRegistrations = datesList.map(date => ({ date, count: regTrendMap.get(date)! }));
  const last7DaysPetCensus = datesList.map(date => ({ date, count: censusTrendMap.get(date)! }));
  const last7DaysContacts = datesList.map(date => ({ date, count: contactTrendMap.get(date)! }));

  const paymentStatusBreakdown = paymentStatusGroups.map(g => ({ status: g.status, count: g._count.id }));

  const tierCountMap = new Map<string, number>();
  memberships7d.forEach(m => {
    const tierName = m.tier?.nameEn || 'Standard';
    tierCountMap.set(tierName, (tierCountMap.get(tierName) || 0) + 1);
  });
  const membershipTierBreakdown = Array.from(tierCountMap.entries()).map(([name, count]) => ({ name, count }));

  const donationCampaignProgress = donationCampaignsList.map(c => ({
    id: c.id,
    title: c.titleEn,
    goal: Number(c.goalAmount),
    raised: Number(c.raisedAmount),
    percent: Number(c.goalAmount) > 0 ? (Number(c.raisedAmount) / Number(c.goalAmount)) * 100 : 0
  }));

  const campaignCapacityProgress = activeCampaignsList.map(c => {
    const totalCapacity = c.sessions.reduce((acc, s) => acc + s.capacity, 0);
    const totalBooked = c.sessions.reduce((acc, s) => acc + s.bookedCount, 0);
    return {
      id: c.id,
      title: c.title,
      capacity: totalCapacity,
      booked: totalBooked,
      percent: totalCapacity > 0 ? (totalBooked / totalCapacity) * 100 : 0
    };
  });

  const zoneDemandRanking = zoneDemandData.map((z: any) => ({
    id: z.id,
    name: z.name,
    censusCount: z._count?.censusSubmissions ?? 0
  }));

  // System Health
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const systemHealth = {
    database: dbOk ? 'healthy' : 'error',
    api: 'healthy',
    sms: failedSmsToday > 10 ? 'degraded' : 'healthy',
    email: 'healthy',
    storage: 'healthy',
    payments: failedPaymentsToday > 5 ? 'degraded' : 'healthy'
  };

  return {
    todayRevenue,
    monthRevenue,
    revenueChangePercent,
    totalUsers,
    newUsersToday,
    activeMembers,
    newMembersToday,
    pendingMembershipPayments,
    donationsToday,
    donationAmountToday,
    activeCampaigns,
    campaignRegistrationsToday,
    pendingCampaignPayments,
    petCensusToday,
    unreadContactInquiries,
    unrepliedContactInquiries,
    failedSmsToday,
    pendingSmsQueue,
    failedPaymentsToday,
    pendingManualPayments,
    systemHealth,
    trends: {
      revenue: last7DaysRevenue,
      memberships: last7DaysMemberships,
      campaigns: last7DaysCampaignRegistrations,
      petCensus: last7DaysPetCensus,
      contacts: last7DaysContacts,
      paymentStatuses: paymentStatusBreakdown,
      membershipTiers: membershipTierBreakdown,
      donationCampaigns: donationCampaignProgress,
      campaignCapacities: campaignCapacityProgress,
      zoneDemand: zoneDemandRanking
    }
  };
}

// ─── Pending Actions ─────────────────────────────────────────────

export async function getPendingActions() {
  const [newInquiries, pendingMfsPayments, pendingCampaignRegs, failedSms] = await Promise.all([
    prisma.contactInquiry.findMany({
      where: { status: 'new' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, subject: true, priority: true, createdAt: true },
    }),
    prisma.communityMembershipPurchase.findMany({
      where: { status: 'pending_payment' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, amountBdt: true, memberName: true, createdAt: true, tier: { select: { nameEn: true } } },
    }).catch(() => [] as any[]),
    prisma.campaignRegistration.findMany({
      where: { status: 'pending_payment' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, bookingNumber: true, createdAt: true, campaign: { select: { title: true } } },
    }).catch(() => [] as any[]),
    prisma.smsLog.findMany({
      where: { status: 'failed', attemptCount: { lt: 3 } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, recipientMasked: true, messageType: true, failureReason: true, createdAt: true },
    }).catch(() => [] as any[]),
  ]);

  return { newInquiries, pendingMfsPayments, pendingCampaignRegs, failedSms };
}

// ─── Recent Activity ─────────────────────────────────────────────

export async function getRecentActivity() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [inquiries, memberships, donations, registrations, census] = await Promise.all([
    prisma.contactInquiry.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, subject: true, status: true, priority: true, createdAt: true },
    }),
    prisma.communityMembershipPurchase.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, status: true, amountBdt: true, memberName: true, createdAt: true, tier: { select: { nameEn: true } } },
    }).catch(() => [] as any[]),
    prisma.donation.findMany({
      where: { createdAt: { gte: since }, status: 'success' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, referenceNo: true, donorName: true, amount: true, createdAt: true },
    }).catch(() => [] as any[]),
    prisma.campaignRegistration.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, bookingNumber: true, status: true, createdAt: true, campaign: { select: { title: true } } },
    }).catch(() => [] as any[]),
    prisma.petCensusSubmission.findMany({
      where: { submittedAt: { gte: since } },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, ownerName: true, status: true, submittedAt: true },
    }).catch(() => [] as any[]),
  ]);

  const feed = [
    ...inquiries.map((i: any) => ({ ...i, _type: 'contact_inquiry' })),
    ...memberships.map((m: any) => ({ ...m, _type: 'membership' })),
    ...donations.map((d: any) => ({ ...d, _type: 'donation' })),
    ...registrations.map((r: any) => ({ ...r, _type: 'campaign_registration' })),
    ...census.map((c: any) => ({ ...c, _type: 'pet_census', createdAt: c.submittedAt })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, 30);

  return { feed };
}

// ─── System Health ────────────────────────────────────────────────

export async function getSystemHealth() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [smsQueued, smsFailed, smsSent, emailQueued, emailFailed, paymentsFailed, dbOk] = await Promise.all([
    prisma.smsLog.count({ where: { status: 'queued', createdAt: { gte: since24h } } }),
    prisma.smsLog.count({ where: { status: 'failed', createdAt: { gte: since24h } } }),
    prisma.smsLog.count({ where: { status: 'sent',   createdAt: { gte: since24h } } }),
    prisma.emailLog.count({ where: { status: 'queued', createdAt: { gte: since24h } } }),
    prisma.emailLog.count({ where: { status: 'failed', createdAt: { gte: since24h } } }),
    prisma.payment.count({ where: { status: 'failed', createdAt: { gte: since24h } } }),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  return {
    database: dbOk ? 'healthy' : 'error',
    sms:      { queued: smsQueued, failed: smsFailed, sent: smsSent,  status: smsFailed > 10 ? 'degraded' : 'healthy' },
    email:    { queued: emailQueued, failed: emailFailed,              status: emailFailed > 5  ? 'degraded' : 'healthy' },
    payments: { failedLast24h: paymentsFailed,                         status: paymentsFailed > 5 ? 'degraded' : 'healthy' },
    checkedAt: new Date().toISOString(),
  };
}
