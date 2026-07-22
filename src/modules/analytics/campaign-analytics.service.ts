import { prisma } from '../../database/prisma';

// ─── Per-campaign summary ─────────────────────────────────────────

export async function getCampaignAnalyticsSummary(campaignId: string) {
  const [analytics, campaign] = await Promise.all([
    prisma.campaignAnalytics.findUnique({ where: { campaignId } }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, title: true, status: true, campaignType: true, startDate: true, endDate: true },
    }),
  ]);
  if (!campaign) throw new Error('Campaign not found');

  const [noShow, cancelled, completed] = await Promise.all([
    prisma.petBooking.count({ where: { registration: { campaignId }, status: 'no_show' } }),
    prisma.petBooking.count({ where: { registration: { campaignId }, status: 'cancelled' } }),
    prisma.petBooking.count({ where: { registration: { campaignId }, status: 'completed' } }),
  ]);

  return {
    campaign,
    counters: analytics ?? {
      totalRegistrations: 0, totalPaid: 0, totalPets: 0, totalVaccinated: 0,
      totalCertificates: 0, totalSmsSent: 0, totalSmsFailed: 0, totalRevenueBdt: 0,
    },
    noShow,
    cancelled,
    completed,
  };
}

// ─── By session ───────────────────────────────────────────────────

export async function getCampaignAnalyticsBySession(campaignId: string) {
  const sessions = await prisma.campaignSession.findMany({
    where: { campaignId },
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      capacity: true,
      bookedCount: true,
      venue: { select: { name: true } },
      _count: { select: { registrations: true, petBookings: true } },
    },
    orderBy: { sessionDate: 'asc' },
  });

  const sessionIds = sessions.map(s => s.id);

  const vaccinatedCounts = await prisma.petBooking.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessionIds }, status: { in: ['vaccinated', 'certificate_issued', 'completed'] } },
    _count: { _all: true },
  });
  const vacMap = new Map(vaccinatedCounts.map(v => [v.sessionId, v._count._all]));

  return sessions.map(s => ({
    ...s,
    vaccinated: vacMap.get(s.id) ?? 0,
  }));
}

// ─── By location (DNCC/DSCC/venue) ───────────────────────────────

export async function getCampaignAnalyticsByLocation(campaignId: string) {
  const sessions = await prisma.campaignSession.findMany({
    where: { campaignId },
    select: {
      id: true,
      venue: {
        select: {
          id: true,
          name: true,
          zone: {
            select: {
              name: true,
              cityCorporation: { select: { id: true, name: true } },
            },
          },
        },
      },
      _count: { select: { petBookings: true } },
    },
  });

  // Group by city corporation (legacy zone-linked venues only; venues created
  // under the new location tree are not zone-scoped)
  const cityMap = new Map<string, { name: string; sessions: number; petBookings: number }>();
  for (const s of sessions) {
    const cc = s.venue.zone?.cityCorporation;
    if (!cc) continue;
    const entry = cityMap.get(cc.id) ?? { name: cc.name, sessions: 0, petBookings: 0 };
    entry.sessions += 1;
    entry.petBookings += s._count.petBookings;
    cityMap.set(cc.id, entry);
  }

  return {
    byCityCorporation: Array.from(cityMap.entries()).map(([id, v]) => ({ id, ...v })),
    byVenue: sessions.map(s => ({
      venueId: s.venue.id,
      venueName: s.venue.name,
      zone: s.venue.zone?.name ?? null,
      cityCorporation: s.venue.zone?.cityCorporation.name ?? null,
      petBookings: s._count.petBookings,
    })),
  };
}

// ─── By doctor ────────────────────────────────────────────────────

export async function getCampaignAnalyticsByDoctor(campaignId: string) {
  const records = await prisma.vaccinationRecord.groupBy({
    by: ['doctorId'],
    where: { campaignId, doctorId: { not: null } },
    _count: { _all: true },
  });

  const doctorIds = records.map(r => r.doctorId!).filter(Boolean);
  const doctors = await prisma.doctor.findMany({
    where: { id: { in: doctorIds } },
    select: { id: true, name: true, specialization: true },
  });
  const doctorMap = new Map(doctors.map(d => [d.id, d]));

  return records.map(r => ({
    doctor: doctorMap.get(r.doctorId!) ?? { id: r.doctorId, name: 'Unknown' },
    vaccinationsAdministered: r._count._all,
  }));
}

// ─── By volunteer ─────────────────────────────────────────────────

export async function getCampaignAnalyticsByVolunteer(campaignId: string) {
  const logs = await prisma.qRScanLog.groupBy({
    by: ['scannedById'],
    where: { petBooking: { registration: { campaignId } } },
    _count: { _all: true },
  });

  const userIds = logs.map(l => l.scannedById);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return logs.map(l => ({
    volunteer: userMap.get(l.scannedById) ?? { id: l.scannedById, name: 'Unknown' },
    scansPerformed: l._count._all,
  }));
}

// ─── Vaccination KPIs ─────────────────────────────────────────────

export async function getCampaignVaccinationKpis(campaignId: string) {
  const [byVaccine, totalRecords] = await Promise.all([
    prisma.vaccinationRecord.groupBy({
      by: ['vaccineName'],
      where: { campaignId },
      _count: { _all: true },
    }),
    prisma.vaccinationRecord.count({ where: { campaignId } }),
  ]);

  return {
    totalVaccinationsAdministered: totalRecords,
    byVaccine: byVaccine.map(v => ({ vaccine: v.vaccineName, count: v._count._all })),
  };
}

// ─── SMS KPIs ─────────────────────────────────────────────────────

export async function getCampaignSmsKpis(campaignId: string) {
  const analytics = await prisma.campaignAnalytics.findUnique({ where: { campaignId } });
  return {
    totalSmsSent: analytics?.totalSmsSent ?? 0,
    totalSmsFailed: analytics?.totalSmsFailed ?? 0,
  };
}

// ─── Revenue KPIs ─────────────────────────────────────────────────

export async function getCampaignRevenueKpis(campaignId: string) {
  const [analytics, bySession] = await Promise.all([
    prisma.campaignAnalytics.findUnique({ where: { campaignId } }),
    prisma.campaignRegistration.groupBy({
      by: ['sessionId'],
      where: { campaignId, status: { notIn: ['pending_payment', 'cancelled'] } },
      _sum: { totalAmountBdt: true },
      _count: { _all: true },
    }),
  ]);

  const sessionIds = bySession.map(s => s.sessionId);
  const sessions = await prisma.campaignSession.findMany({
    where: { id: { in: sessionIds } },
    select: { id: true, sessionDate: true, venue: { select: { name: true } } },
  });
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  return {
    totalRevenueBdt: analytics?.totalRevenueBdt ?? 0,
    bySession: bySession.map(s => ({
      session: sessionMap.get(s.sessionId),
      revenue: s._sum.totalAmountBdt ?? 0,
      paidRegistrations: s._count._all,
    })),
  };
}

// ─── Registrations over time ──────────────────────────────────────

export async function getCampaignRegistrationsOverTime(campaignId: string) {
  const registrations = await prisma.campaignRegistration.findMany({
    where: { campaignId },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by date
  const byDate = new Map<string, { date: string; total: number; paid: number }>();
  for (const r of registrations) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const entry = byDate.get(date) ?? { date, total: 0, paid: 0 };
    entry.total += 1;
    if (!['pending_payment', 'cancelled'].includes(r.status)) entry.paid += 1;
    byDate.set(date, entry);
  }

  return Array.from(byDate.values());
}

// ─── Global dashboard ─────────────────────────────────────────────

export async function getGlobalCampaignAnalytics() {
  const [
    totalCampaigns,
    activeCampaigns,
    analytics,
    recentCampaigns,
  ] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: { in: ['published', 'registration_open', 'registration_closed'] } } }),
    prisma.campaignAnalytics.aggregate({
      _sum: {
        totalRegistrations: true,
        totalPaid: true,
        totalPets: true,
        totalVaccinated: true,
        totalCertificates: true,
        totalRevenueBdt: true,
      },
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        analytics: {
          select: { totalRegistrations: true, totalPaid: true, totalVaccinated: true, totalRevenueBdt: true },
        },
      },
    }),
  ]);

  return {
    totalCampaigns,
    activeCampaigns,
    totals: analytics._sum,
    recentCampaigns,
  };
}

// ─── QR Scan Logs ─────────────────────────────────────────────────

export async function getQrScanLogs(params: {
  campaignId?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const skip = (page - 1) * limit;

  const where = params.campaignId
    ? { petBooking: { registration: { campaignId: params.campaignId } } }
    : {};

  const [items, total] = await Promise.all([
    prisma.qRScanLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        scannedBy: { select: { id: true, name: true } },
        petBooking: {
          select: {
            id: true,
            status: true,
            pet: { select: { name: true, petType: true } },
          },
        },
      },
    }),
    prisma.qRScanLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return { items, meta: { total, page, limit, totalPages } };
}
