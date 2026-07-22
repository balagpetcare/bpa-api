import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { config } from '../../config';
import {
  createFurtailPetVaccination,
  createFurtailPet,
  getFurtailPet,
  getFurtailPetMedicalHistory,
  listFurtailPets,
  updateFurtailPet,
} from './furtail-pets.client';
import type {
  DashboardSummaryResponse,
  DashboardUserSection,
  DashboardMembershipSection,
  DashboardPetsSection,
  DashboardBookingsSection,
  DashboardBookingItem,
  DashboardContributionsSection,
  DashboardContributionItem,
  DashboardCarePartnerCardSection,
  DashboardImpactSection,
  DashboardDocumentItem,
  DashboardNotification,
  DashboardTransparencySection,
  DashboardActivity,
  MeDonationItem,
  MeVaccinationCardItem,
  MePetCensusItem,
  MeEventPassItem,
  MeElectionItem,
  MePetItem,
  CreateMyPetDto,
  UpdateMyPetDto,
  AddMyPetVaccinationDto,
  MePetMedicalHistoryResponse,
  PaginatedListResponse,
} from './me.types';
import type { LocalProfileUpdateDto } from './me.profile.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeProfileCompletion(user: {
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}): number {
  let score = 25; // name always present (required at registration)
  if (user.email) score += 25;
  if (user.phone) score += 25;
  if (user.avatarUrl) score += 25;
  return score;
}

function decimalToNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function frontendUrl(path: string): string {
  return `${config.FRONTEND_URL}${path}`;
}

function emptyDashboardSummary(userId: string): DashboardSummaryResponse {
  return {
    user: {
      id: userId,
      name: 'User',
      email: null,
      phone: null,
      avatarUrl: null,
      memberId: `BPA-${userId.slice(0, 8).toUpperCase()}`,
      role: 'USER',
      status: 'ACTIVE',
      joinedAt: new Date(0),
      profileCompletion: 25,
    },
    membership: null,
    pets: { total: 0, items: [] },
    bookings: { total: 0, upcoming: 0, latest: [] },
    contributions: { totalAmount: 0, totalCount: 0, paidCount: 0, pendingCount: 0, latest: [], byZone: [] },
    carePartnerCard: null,
    impact: { score: 0, vaccinatedPets: 0, supportedAnimals: 0, certificatesIssued: 0, campaignsParticipated: 0, contributionsMade: 0 },
    documents: [],
    notifications: [],
    transparency: {
      totalRaisedBdt: 0,
      totalContributors: 0,
      userContributionShare: 0,
      activeZones: 0,
      totalZones: 0,
      latestReportTitle: null,
      latestReportSlug: null,
      latestReportPublishedAt: null,
    },
    recentActivities: [],
  };
}

// ─── Profile update ─────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('880')) cleaned = '880' + cleaned;
  return cleaned;
}

interface LocationFields {
  divisionId?: string | null;
  districtId?: string | null;
  upazilaId?: string | null;
  unionId?: string | null;
  cityCorporationId?: string | null;
  cityZoneId?: string | null;
  wardId?: string | null;
  addressLine?: string | null;
}

export async function getLocalProfile(
  userId: string,
): Promise<LocationFields> {
  const user = await prisma.user.findFirst({ where: { centralAuthUserId: userId, deletedAt: null } });
  if (!user) throw AppError.notFound('User');

  return {
    divisionId: user.divisionId,
    districtId: user.districtId,
    upazilaId: user.upazilaId,
    unionId: user.unionId,
    cityCorporationId: user.cityCorporationId,
    cityZoneId: user.cityZoneId,
    wardId: user.wardId,
    addressLine: user.addressLine,
  };
}

export async function updateProfile(
  userId: string,
  dto: LocalProfileUpdateDto,
): Promise<LocationFields> {
  const user = await prisma.user.findFirst({ where: { centralAuthUserId: userId, deletedAt: null } });
  if (!user) throw AppError.notFound('User');

  const data: Record<string, unknown> = {};

  // Location FK fields — pass-through (nulls clear the value)
  const LOC_FIELDS = [
    'divisionId', 'districtId', 'upazilaId', 'unionId',
    'cityCorporationId', 'cityZoneId', 'wardId', 'addressLine',
  ] as const;
  for (const f of LOC_FIELDS) {
    if (f in dto) data[f] = (dto as Record<string, unknown>)[f] ?? null;
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });

  return {
    divisionId: updated.divisionId,
    districtId: updated.districtId,
    upazilaId: updated.upazilaId,
    unionId: updated.unionId,
    cityCorporationId: updated.cityCorporationId,
    cityZoneId: updated.cityZoneId,
    wardId: updated.wardId,
    addressLine: updated.addressLine,
  };
}

// ─── Main aggregation ────────────────────────────────────────────────────────

export async function getDashboardSummary(userId: string): Promise<DashboardSummaryResponse> {
  // 1. Load the BPA-local user mapped from Central Auth.
  const user = await prisma.user.findFirst({
    where: { centralAuthUserId: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      status: true,
      createdAt: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!user) return emptyDashboardSummary(userId);
  const localUser = user;

  // 2. Parallel data fetch — everything scoped to this user
  const [
    petOwners,
    careContributions,
    communityMembership,
    transparencyData,
    zoneStats,
    latestReport,
  ] = await Promise.all([
    // Pets via PetOwner (userId FK exists)
    prisma.petOwner.findMany({
      where: { userId: localUser.id },
      select: {
        id: true,
        pets: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            petType: true,
            gender: true,
            breed: true,
            approxAge: true,
            isActive: true,
            vaccinationRecords: {
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        registrations: {
          select: {
            id: true,
            bookingNumber: true,
            status: true,
            totalAmountBdt: true,
            createdAt: true,
            updatedAt: true,
            campaign: { select: { title: true, slug: true } },
            session: { select: { sessionDate: true } },
            payment: { select: { status: true } },
            petBookings: {
              select: {
                id: true,
                petId: true,
                status: true,
                certificates: {
                  select: {
                    id: true,
                    certificateNumber: true,
                    verifyToken: true,
                    issuedAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    }),

    // Care contributions — match by email OR phone (no userId FK on this table)
    user.email || user.phone
      ? prisma.careContribution.findMany({
          where: {
            OR: [
              ...(user.email ? [{ contributorEmail: user.email }] : []),
              ...(user.phone ? [{ contributorMobile: user.phone }] : []),
            ],
          },
          select: {
            id: true,
            contributionNumber: true,
            amountBdt: true,
            status: true,
            createdAt: true,
            plan: { select: { title: true } },
            zone: { select: { name: true, slug: true } },
            card: {
              select: {
                id: true,
                cardNumber: true,
                qrToken: true,
                status: true,
                issuedAt: true,
                expiresAt: true,
                zone: { select: { name: true, slug: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),

    // Community membership purchase — match by email OR phone
    user.email || user.phone
      ? prisma.communityMembershipPurchase.findFirst({
          where: {
            status: { in: ['paid', 'pending_payment'] },
            OR: [
              ...(user.email ? [{ memberEmail: user.email }] : []),
              ...(user.phone ? [{ memberMobile: user.phone }] : []),
            ],
          },
          select: {
            id: true,
            amountBdt: true,
            status: true,
            startsAt: true,
            expiresAt: true,
            purchasedAt: true,
            petLimit: true,
            preferredZone: { select: { name: true } },
            tier: {
              select: {
                id: true,
                nameEn: true,
                slug: true,
                validityMonths: true,
              },
            },
            card: {
              select: {
                id: true,
                cardNumber: true,
                qrToken: true,
                status: true,
                issuedAt: true,
                expiresAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve(null),

    // Transparency aggregate — total collected across all reports
    prisma.transparencyReport.aggregate({
      where: { status: 'published' },
      _sum: { totalCollectedBdt: true },
      _count: { id: true },
    }),

    // Community zone aggregate — active zones
    prisma.communityZone.aggregate({
      where: { isActive: true },
      _count: { id: true },
    }),

    // Latest published transparency report
    prisma.transparencyReport.findFirst({
      where: { status: 'published' },
      select: { title: true, slug: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
    }),
  ]);

  // 3. Flatten data structures ──────────────────────────────────────────────

  const allPets = petOwners.flatMap((o) => o.pets);
  const allRegistrations = petOwners.flatMap((o) => o.registrations);

  // Build booking items
  const bookingItems: DashboardBookingItem[] = allRegistrations.map((reg) => {
    const cert = reg.petBookings.find((pb) => pb.certificates.length > 0)?.certificates[0];
    return {
      id: reg.id,
      bookingNumber: reg.bookingNumber,
      campaignTitle: reg.campaign.title,
      campaignSlug: reg.campaign.slug,
      sessionDate: reg.session.sessionDate.toISOString().split('T')[0],
      petCount: reg.petBookings.length,
      status: reg.status,
      paymentStatus: reg.payment?.status ?? null,
      totalAmountBdt: decimalToNumber(reg.totalAmountBdt),
      hasCertificate: !!cert,
      certificateNumber: cert?.certificateNumber ?? null,
      verifyToken: cert?.verifyToken ?? null,
      createdAt: reg.createdAt,
    };
  });

  const upcomingCount = bookingItems.filter((b) =>
    ['pending_payment', 'paid', 'checked_in'].includes(b.status),
  ).length;

  // 4. Build contribution items ─────────────────────────────────────────────

  const contribItems: DashboardContributionItem[] = careContributions.map((c) => ({
    id: c.id,
    contributionNumber: c.contributionNumber,
    amountBdt: decimalToNumber(c.amountBdt),
    status: c.status,
    planTitle: c.plan.title,
    zoneName: c.zone.name,
    zoneSlug: c.zone.slug,
    createdAt: c.createdAt,
  }));

  const paidContribs = careContributions.filter((c) => c.status === 'paid');
  const totalContribAmount = paidContribs.reduce(
    (sum, c) => sum + decimalToNumber(c.amountBdt),
    0,
  );

  // Group by zone
  const zoneMap = new Map<string, { zoneName: string; amount: number; count: number }>();
  for (const c of paidContribs) {
    const existing = zoneMap.get(c.zone.slug);
    if (existing) {
      existing.amount += decimalToNumber(c.amountBdt);
      existing.count += 1;
    } else {
      zoneMap.set(c.zone.slug, {
        zoneName: c.zone.name,
        amount: decimalToNumber(c.amountBdt),
        count: 1,
      });
    }
  }

  // 5. Care Partner Card ────────────────────────────────────────────────────

  const activeCard = careContributions.find((c) => c.card?.status === 'active')?.card
    ?? careContributions.find((c) => c.card)?.card
    ?? null;

  let carePartnerCard: DashboardCarePartnerCardSection | null = null;
  if (activeCard) {
    carePartnerCard = {
      cardId: activeCard.id,
      cardNumber: activeCard.cardNumber,
      status: activeCard.status,
      qrToken: activeCard.qrToken,
      verifyUrl: frontendUrl(`/verify/care-card/${activeCard.qrToken}`),
      issuedAt: activeCard.issuedAt?.toISOString() ?? null,
      expiresAt: activeCard.expiresAt?.toISOString().split('T')[0] ?? null,
      zone: activeCard.zone.name,
      zoneSlug: activeCard.zone.slug,
    };
  }

  // 6. Community Membership ─────────────────────────────────────────────────

  let membershipSection: DashboardMembershipSection | null = null;
  if (communityMembership) {
    const memCard = communityMembership.card;
    membershipSection = {
      purchaseId: communityMembership.id,
      tierName: communityMembership.tier.nameEn,
      tierSlug: communityMembership.tier.slug,
      status: communityMembership.status,
      amountBdt: decimalToNumber(communityMembership.amountBdt),
      startedAt: communityMembership.startsAt?.toISOString().split('T')[0] ?? null,
      expiresAt: communityMembership.expiresAt?.toISOString().split('T')[0] ?? null,
      renewalDate: communityMembership.expiresAt?.toISOString().split('T')[0] ?? null,
      canUpgrade: communityMembership.status === 'paid',
      petLimit: communityMembership.petLimit,
      cardNumber: memCard?.cardNumber ?? null,
      cardStatus: memCard?.status ?? null,
      cardQrToken: memCard?.qrToken ?? null,
      verifyUrl: memCard ? frontendUrl(`/verify/membership-card/${memCard.qrToken}`) : null,
      preferredZone: communityMembership.preferredZone?.name ?? null,
    };
  }

  // 7. Impact score ─────────────────────────────────────────────────────────

  const vaccinatedPets = allPets.filter((p) => p.vaccinationRecords.length > 0).length;
  const allCertificates = allRegistrations.flatMap((r) =>
    r.petBookings.flatMap((pb) => pb.certificates),
  );
  const uniqueCampaigns = new Set(allRegistrations.map((r) => r.campaign.slug)).size;

  // Simple scoring: 100 pts per campaign, 50 per cert, 50 per paid contrib, 25 per pet
  const impactScore =
    uniqueCampaigns * 100 +
    allCertificates.length * 50 +
    paidContribs.length * 50 +
    allPets.length * 25;

  const impact: DashboardImpactSection = {
    score: impactScore,
    vaccinatedPets,
    supportedAnimals: vaccinatedPets,
    certificatesIssued: allCertificates.length,
    campaignsParticipated: uniqueCampaigns,
    contributionsMade: paidContribs.length,
  };

  // 8. Documents list ───────────────────────────────────────────────────────

  const documents: DashboardDocumentItem[] = [];

  // Membership card
  if (communityMembership?.card) {
    const mc = communityMembership.card;
    documents.push({
      id: mc.id,
      type: 'membership_card',
      title: `${communityMembership.tier.nameEn} Membership Card`,
      reference: mc.cardNumber,
      issuedAt: mc.issuedAt?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0],
      downloadUrl: null,
      verifyUrl: frontendUrl(`/verify/membership-card/${mc.qrToken}`),
    });
  }

  // Vaccination certificates
  for (const reg of allRegistrations) {
    for (const pb of reg.petBookings) {
      for (const cert of pb.certificates) {
        documents.push({
          id: cert.id,
          type: 'vaccination_certificate',
          title: `Vaccination Certificate – ${reg.campaign.title}`,
          reference: cert.certificateNumber,
          issuedAt: cert.issuedAt.toISOString().split('T')[0],
          downloadUrl: null,
          verifyUrl: frontendUrl(`/verify/cert/${cert.verifyToken}`),
        });
      }
    }
  }

  // Care partner card
  if (activeCard) {
    documents.push({
      id: activeCard.id,
      type: 'care_partner_card',
      title: 'Care Partner Card',
      reference: activeCard.cardNumber,
      issuedAt: activeCard.issuedAt?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0],
      downloadUrl: null,
      verifyUrl: frontendUrl(`/verify/care-card/${activeCard.qrToken}`),
    });
  }

  // 9. Notifications ────────────────────────────────────────────────────────

  const notifications: DashboardNotification[] = [];

  // Membership expiry warning (within 60 days)
  if (membershipSection?.expiresAt) {
    const daysLeft = Math.ceil(
      (new Date(membershipSection.expiresAt).getTime() - Date.now()) / 86400000,
    );
    if (daysLeft <= 60 && daysLeft > 0) {
      notifications.push({
        id: 'notif-membership-renewal',
        type: 'membership_renewal',
        title: 'Membership Renewal Due Soon',
        message: `Your ${membershipSection.tierName} membership expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew to keep your benefits.`,
        priority: daysLeft <= 14 ? 'high' : 'medium',
        actionUrl: frontendUrl('/community-pet-care/contribute'),
      });
    } else if (daysLeft <= 0) {
      notifications.push({
        id: 'notif-membership-expired',
        type: 'membership_renewal',
        title: 'Membership Expired',
        message: 'Your membership has expired. Renew now to restore access to Care Partner benefits.',
        priority: 'high',
        actionUrl: frontendUrl('/community-pet-care/contribute'),
      });
    }
  }

  // Pending payments
  const pendingBookings = bookingItems.filter((b) => b.status === 'pending_payment');
  for (const b of pendingBookings.slice(0, 2)) {
    notifications.push({
      id: `notif-payment-${b.id}`,
      type: 'payment_pending',
      title: 'Payment Pending',
      message: `Payment for campaign booking ${b.bookingNumber} is still pending.`,
      priority: 'high',
      actionUrl: frontendUrl(`/campaigns/${b.campaignSlug}/booking/${b.bookingNumber}`),
    });
  }

  // Certificates ready
  for (const b of bookingItems.filter((bk) => bk.hasCertificate).slice(0, 2)) {
    notifications.push({
      id: `notif-cert-${b.id}`,
      type: 'certificate_ready',
      title: 'Certificate Available',
      message: `Vaccination certificate for booking ${b.bookingNumber} is ready.`,
      priority: 'low',
      actionUrl: frontendUrl(`/campaigns/${b.campaignSlug}/booking/${b.bookingNumber}`),
    });
  }

  // 10. Transparency section ────────────────────────────────────────────────

  const totalRaisedBdt = decimalToNumber(transparencyData._sum.totalCollectedBdt);
  const totalZones = await prisma.communityZone.count();

  const userTotalContrib = totalContribAmount;
  const userContribShare =
    totalRaisedBdt > 0 ? Math.round((userTotalContrib / totalRaisedBdt) * 10000) / 100 : 0;

  const transparency: DashboardTransparencySection = {
    totalRaisedBdt,
    totalContributors: 0, // aggregate not tracked per report
    userContributionShare: userContribShare,
    activeZones: zoneStats._count.id,
    totalZones,
    latestReportTitle: latestReport?.title ?? null,
    latestReportSlug: latestReport?.slug ?? null,
    latestReportPublishedAt: latestReport?.publishedAt?.toISOString() ?? null,
  };

  // 11. Recent activity timeline ────────────────────────────────────────────

  const activities: DashboardActivity[] = [];

  // Campaign registrations
  for (const reg of allRegistrations.slice(0, 5)) {
    activities.push({
      id: `act-reg-${reg.id}`,
      type: 'campaign_registered',
      title: 'Campaign Registration',
      description: `Registered for ${reg.campaign.title}`,
      referenceNumber: reg.bookingNumber,
      occurredAt: reg.createdAt,
    });

    if (reg.payment?.status === 'success') {
      activities.push({
        id: `act-pay-${reg.id}`,
        type: 'payment_verified',
        title: 'Payment Verified',
        description: `Payment confirmed for ${reg.campaign.title}`,
        referenceNumber: reg.bookingNumber,
        occurredAt: reg.updatedAt,
      });
    }

    for (const pb of reg.petBookings) {
      for (const cert of pb.certificates) {
        activities.push({
          id: `act-cert-${cert.id}`,
          type: 'certificate_issued',
          title: 'Vaccination Certificate Issued',
          description: `Certificate issued for ${reg.campaign.title}`,
          referenceNumber: cert.certificateNumber,
          occurredAt: cert.issuedAt,
        });
      }
    }
  }

  // Care contributions
  for (const c of careContributions.slice(0, 3)) {
    activities.push({
      id: `act-contrib-${c.id}`,
      type: c.status === 'paid' ? 'donation_made' : 'payment_submitted',
      title: c.status === 'paid' ? 'Contribution Confirmed' : 'Contribution Submitted',
      description: `Care Partner contribution of ৳${decimalToNumber(c.amountBdt).toLocaleString('en-IN')} for ${c.zone.name}`,
      referenceNumber: c.contributionNumber,
      occurredAt: c.createdAt,
    });
  }

  // Membership purchase
  if (communityMembership) {
    activities.push({
      id: `act-membership-${communityMembership.id}`,
      type: 'membership_purchased',
      title: 'Membership Purchased',
      description: `${communityMembership.tier.nameEn} membership activated`,
      referenceNumber: null,
      occurredAt: communityMembership.purchasedAt ?? new Date(),
    });
  }

  // Sort activities by most recent first
  activities.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  // 12. Build final user section ────────────────────────────────────────────

  const userSection: DashboardUserSection = {
    id: localUser.id,
    name: localUser.name,
    email: localUser.email,
    phone: localUser.phone,
    avatarUrl: localUser.avatarUrl,
    memberId: `BPA-${localUser.id.slice(0, 8).toUpperCase()}`,
    role: localUser.role,
    status: localUser.status,
    joinedAt: localUser.createdAt,
    profileCompletion: computeProfileCompletion(localUser),
  };

  const petsSection: DashboardPetsSection = {
    total: allPets.length,
    items: allPets.slice(0, 10).map((p) => ({
      id: p.id,
      name: p.name,
      petType: p.petType,
      gender: p.gender,
      breed: p.breed,
      approxAge: p.approxAge,
      isActive: p.isActive,
    })),
  };

  const bookingsSection: DashboardBookingsSection = {
    total: bookingItems.length,
    upcoming: upcomingCount,
    latest: bookingItems.slice(0, 5),
  };

  const contributionsSection: DashboardContributionsSection = {
    totalAmount: totalContribAmount,
    totalCount: careContributions.length,
    paidCount: paidContribs.length,
    pendingCount: careContributions.filter((c) => c.status === 'pending_payment').length,
    latest: contribItems.slice(0, 5),
    byZone: Array.from(zoneMap.values()),
  };

  return {
    user: userSection,
    membership: membershipSection,
    pets: petsSection,
    bookings: bookingsSection,
    contributions: contributionsSection,
    carePartnerCard,
    impact,
    documents: documents.slice(0, 20),
    notifications: notifications.slice(0, 10),
    transparency,
    recentActivities: activities.slice(0, 12),
  };
}

async function resolveUserIdentity(userId: string) {
  const user = await prisma.user.findFirst({
    where: { centralAuthUserId: userId, deletedAt: null },
    select: { id: true, email: true, phone: true },
  });
  return user;
}

function titleCasePetType(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Other';
}

function approxAgeToDateOfBirth(age?: number): string | undefined {
  if (age === undefined || age === null) return undefined;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, 0, 1)).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function summarizeMedical(pet: any): string | null {
  const parts = [
    typeof pet?.healthDisorders === 'string' ? pet.healthDisorders.trim() : '',
    typeof pet?.notes === 'string' ? pet.notes.trim() : '',
  ].filter((value) => value.length > 0);
  return parts.length === 0 ? null : parts.join(' | ');
}

function summarizeVaccination(pet: any): string | null {
  const summary = pet?.vaccinationSummary;
  if (!summary || typeof summary !== 'object') return null;
  const total = Number(summary.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const nextDue = toIsoOrNull(summary.nextDueDate);
  if (nextDue) {
    return `${total} vaccination record(s) | next due ${nextDue.split('T')[0]}`;
  }
  return `${total} vaccination record(s)`;
}

function normalizeAllergies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function mapVaccinationHistoryItem(item: any) {
  return {
    id: String(item.id),
    vaccineTypeId: item.vaccineTypeId ?? null,
    vaccineName: item.vaccineName ?? 'Vaccination',
    administeredAt: toIsoOrNull(item.administeredAt) || new Date(0).toISOString(),
    nextDueDate: toIsoOrNull(item.nextDueDate),
    status: item.status ?? null,
    verificationState: item.verificationState ?? null,
    batchNumber: item.batchNumber ?? null,
    manufacturer: item.manufacturer ?? null,
    vetClinic: item.vetClinic ?? null,
    notes: item.notes ?? null,
  };
}

function mapFurtailPetToMePetItem(pet: any): MePetItem {
  const petTypeName = String(
    pet?.animalType?.name ||
    pet?.animalTypeNameSnapshot ||
    pet?.petType ||
    'other',
  ).toLowerCase();

  return {
    id: String(pet.id),
    furtailPetId: Number(pet.id),
    uniquePetId: pet.uniquePetId ?? null,
    name: pet.name,
    petType: petTypeName,
    breed: pet?.breed?.name || pet?.breedNameSnapshot || pet?.customBreedText || null,
    gender: String(pet.sex || 'UNKNOWN').toLowerCase(),
    approxAge: pet.approxAgeYears ?? null,
    dateOfBirth: toIsoOrNull(pet.dateOfBirth),
    isDateOfBirthEstimated: false,
    isActive: !!pet.isActive,
    color: pet?.color?.name || pet?.colorNameSnapshot || pet?.customColorText || null,
    profileImageUrl: pet?.profilePic?.url ?? pet?.profileImageUrl ?? null,
    latestWeightKg: pet.latestWeightKg ?? null,
    microchipNumber: pet.microchipNumber ?? null,
    isNeuteredOrSpayed:
      typeof pet?.isNeutered === 'boolean' ? pet.isNeutered : null,
    medicalSummary: summarizeMedical(pet),
    vaccinationSummary: summarizeVaccination(pet),
    slug: pet.slug ?? null,
    isPublicProfileVisible: pet?.publicProfile?.isPublicProfileEnabled ?? null,
    followerCount: pet?.publicProfile?.followersCount ?? null,
    likeCount: pet?.publicProfile?.likesCount ?? null,
    createdAt: toIsoOrNull(pet.createdAt),
    updatedAt: toIsoOrNull(pet.updatedAt),
    vaccinationHistory: Array.isArray(pet.vaccinationHistory)
      ? pet.vaccinationHistory.map(mapVaccinationHistoryItem)
      : [],
  };
}

function buildFurtailPetPayload(dto: CreateMyPetDto | UpdateMyPetDto) {
  return {
    name: dto.name,
    petType: dto.petType ? titleCasePetType(String(dto.petType)) : undefined,
    sex: dto.gender ? String(dto.gender).toUpperCase() : undefined,
    dateOfBirth: dto.dateOfBirth ?? approxAgeToDateOfBirth(dto.approxAge),
    customBreedText: dto.breed,
    customColorText: dto.color,
    microchipNumber: dto.microchipNumber,
    isNeutered: dto.isNeuteredOrSpayed,
    healthDisorders: dto.healthDisorders,
    notes: dto.medicalSummary,
    allergies: normalizeAllergies(dto.allergies),
    healthCard: dto.healthCard,
    weightKg: dto.weightKg,
    historicalVaccinations: dto.historicalVaccinations?.map((item) => ({
      vaccineTypeId: item.vaccineTypeId,
      vaccineName: item.vaccineName,
      administeredAt: item.administeredAt,
      nextDueDate: item.nextDueDate,
      batchNumber: item.batchNumber,
      manufacturer: item.manufacturer,
      vetClinic: item.vetClinic,
      notes: item.notes,
      idempotencyKey: item.idempotencyKey,
    })),
  };
}

function assertFurtailToken(token?: string): string {
  if (!token) throw AppError.unauthorized('No token provided for Furtail integration');
  return token;
}

// ─── Saved pets (logged-in booking flow) ────────────────────────────────────
//
// PetOwner has no direct Central Auth link (see schema.prisma) — the chain
// is `req.user.sub` -> `User.centralAuthUserId` -> `User.id` ->
// `PetOwner.userId`. Unlike the read-only resolveUserIdentity() above, pet
// creation needs a local User + PetOwner row to exist, so these two are
// get-or-created here rather than returning empty on a miss. This never
// touches Central Auth — it only mirrors the already-authenticated identity
// into BPA's own User/PetOwner tables, exactly like the guest booking flow
// already does for mobile-only users (see pets-public.router.ts).
async function resolveOrCreatePetOwner(localUser: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}) {
  const existing = await prisma.petOwner.findFirst({ where: { userId: localUser.id } });
  if (existing) return existing;

  return prisma.petOwner.create({
    data: {
      userId: localUser.id,
      ownerName: localUser.name,
      // PetOwner.mobile is required but a logged-in user's phone may not be
      // on file yet — a placeholder is safe because this owner row is only
      // used to hold the user's saved Pet records; campaign registration
      // matches/creates its own (guest) PetOwner by the mobile number
      // entered in the Owner Info step, independent of this one.
      mobile: localUser.phone || `app-${localUser.id.slice(0, 12)}`,
      email: localUser.email,
      isGuest: false,
    },
  });
}

function toMePetItem(pet: {
  id: string;
  name: string;
  petType: string;
  gender: string;
  breed: string | null;
  approxAge: number | null;
  isActive: boolean;
  vaccinationRecords: {
    id?: string;
    vaccineTypeId?: number | null;
    vaccineName: string;
    administeredAt: Date;
    nextDueDate: Date | null;
  }[];
}): MePetItem {
  return {
    id: pet.id,
    furtailPetId: 0,
    name: pet.name,
    petType: pet.petType,
    breed: pet.breed,
    gender: pet.gender,
    approxAge: pet.approxAge,
    isActive: pet.isActive,
    vaccinationHistory: pet.vaccinationRecords.map((v) => ({
      id: v.id ?? '',
      vaccineTypeId: v.vaccineTypeId ?? null,
      vaccineName: v.vaccineName,
      administeredAt: v.administeredAt.toISOString(),
      nextDueDate: v.nextDueDate ? v.nextDueDate.toISOString() : null,
    })),
  };
}

void resolveOrCreatePetOwner;
void toMePetItem;

export async function listMyPets(_userId: string, token?: string): Promise<MePetItem[]> {
  const pets = await listFurtailPets(assertFurtailToken(token));
  return pets.map(mapFurtailPetToMePetItem);
}

export async function createMyPet(
  authUser: {
    sub: string;
    email?: string | null;
    token?: string;
    idempotencyKey?: string;
    requestId?: string;
  },
  dto: CreateMyPetDto,
): Promise<MePetItem> {
  const headers: Record<string, string> = {};
  if (authUser.idempotencyKey) headers['Idempotency-Key'] = authUser.idempotencyKey;
  if (authUser.requestId) headers['X-Request-Id'] = authUser.requestId;
  const pet = await createFurtailPet(
    assertFurtailToken(authUser.token),
    buildFurtailPetPayload(dto),
    Object.keys(headers).length === 0 ? undefined : headers,
  );
  return mapFurtailPetToMePetItem(pet);
}

export async function getMyPet(
  _userId: string,
  petId: string,
  token?: string,
): Promise<MePetItem> {
  const pet = await getFurtailPet(assertFurtailToken(token), petId);
  return mapFurtailPetToMePetItem(pet);
}

export async function updateMyPet(
  _userId: string,
  petId: string,
  token: string | undefined,
  dto: UpdateMyPetDto,
): Promise<MePetItem> {
  const pet = await updateFurtailPet(assertFurtailToken(token), petId, buildFurtailPetPayload(dto));
  return mapFurtailPetToMePetItem(pet);
}

export async function addMyPetVaccination(
  _userId: string,
  petId: string,
  token: string | undefined,
  dto: AddMyPetVaccinationDto,
): Promise<ReturnType<typeof mapVaccinationHistoryItem>> {
  const vaccination = await createFurtailPetVaccination(assertFurtailToken(token), petId, dto);
  return mapVaccinationHistoryItem(vaccination);
}

export async function getMyPetMedicalHistory(
  _userId: string,
  petId: string,
  token?: string,
): Promise<MePetMedicalHistoryResponse> {
  const data = await getFurtailPetMedicalHistory(assertFurtailToken(token), petId);
  return {
    pet: mapFurtailPetToMePetItem(data.pet),
    profile: {
      allergies: Array.isArray(data.profile?.allergies) ? data.profile.allergies : [],
      bloodType: data.profile?.bloodType ?? null,
      foodHabits: data.profile?.foodHabits ?? null,
      healthDisorders: data.profile?.healthDisorders ?? null,
      notes: data.profile?.notes ?? null,
      healthCard: data.profile?.healthCard && typeof data.profile.healthCard === 'object'
        ? data.profile.healthCard
        : {},
    },
    vaccinations: Array.isArray(data.vaccinations) ? data.vaccinations.map(mapVaccinationHistoryItem) : [],
    medicalHistory: Array.isArray(data.medicalHistory)
      ? data.medicalHistory.map((item: any) => ({
          id: String(item.id),
          condition: item.condition,
          treatment: item.treatment ?? null,
          doctorName: item.doctorName ?? null,
          clinicName: item.clinicName ?? null,
          visitDate: toIsoOrNull(item.visitDate) || new Date(0).toISOString(),
          followUpDate: toIsoOrNull(item.followUpDate),
          createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
        }))
      : [],
    dewormingHistory: Array.isArray(data.dewormingHistory)
      ? data.dewormingHistory.map((item: any) => ({
          id: String(item.id),
          medicationName: item.medicationName,
          dosage: item.dosage ?? null,
          weightAtTime: item.weightAtTime ?? null,
          administeredAt: toIsoOrNull(item.administeredAt) || new Date(0).toISOString(),
          nextDueDate: toIsoOrNull(item.nextDueDate),
          notes: item.notes ?? null,
          createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
        }))
      : [],
    weightHistory: Array.isArray(data.weightHistory)
      ? data.weightHistory.map((item: any) => ({
          id: String(item.id),
          weightKg: Number(item.weightKg),
          notes: item.notes ?? null,
          recordedAt: toIsoOrNull(item.recordedAt) || new Date(0).toISOString(),
          createdAt: toIsoOrNull(item.createdAt) || new Date(0).toISOString(),
        }))
      : [],
  };
}

export async function listMyDonations(
  userId: string,
  query: { page?: unknown; limit?: unknown },
): Promise<PaginatedListResponse<MeDonationItem> & { meta: ReturnType<typeof buildPaginationMeta> }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 20);
  const user = await resolveUserIdentity(userId);
  if (!user) return { items: [], total: 0, meta: buildPaginationMeta(0, page, limit) };
  const where = {
    OR: [
      { userId: user.id },
      ...(user.email ? [{ donorEmail: user.email }] : []),
      ...(user.phone ? [{ donorPhone: user.phone }] : []),
    ],
  };
  const [total, donations] = await Promise.all([
    prisma.donation.count({ where }),
    prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        referenceNo: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    items: donations.map((d) => ({
      id: d.id,
      referenceNo: d.referenceNo,
      amount: decimalToNumber(d.amount),
      currency: d.currency,
      status: d.status,
      created_at: d.createdAt.toISOString(),
      receipt_url: null,
    })),
    total,
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function listMyVaccinationCards(userId: string): Promise<MeVaccinationCardItem[]> {
  const user = await resolveUserIdentity(userId);
  if (!user) return [];
  const bookings = await prisma.petBooking.findMany({
    where: { registration: { owner: { userId: user.id } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      pet: { select: { name: true } },
      vaccinatedAt: true,
      certificates: { orderBy: { createdAt: 'desc' }, take: 1, select: { verifyToken: true } },
      registration: { select: { status: true } },
    },
  });
  return bookings.map((b) => ({
    id: b.id,
    petName: b.pet.name,
    qrCode: b.certificates[0]?.verifyToken ?? b.id,
    status: b.registration.status,
    lastVaccinationDate: b.vaccinatedAt?.toISOString() ?? null,
  }));
}

export async function listMyPetCensusEntries(
  userId: string,
  query: { page?: unknown; limit?: unknown },
): Promise<PaginatedListResponse<MePetCensusItem> & { meta: ReturnType<typeof buildPaginationMeta> }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 20);
  const user = await resolveUserIdentity(userId);
  if (!user) return { items: [], total: 0, meta: buildPaginationMeta(0, page, limit) };
  const where = { userId: user.id };
  const [total, submissions] = await Promise.all([
    prisma.petCensusSubmission.count({ where }),
    prisma.petCensusSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, petName: true, petType: true, vaccinationStatus: true },
    }),
  ]);
  return {
    items: submissions.map((s) => ({
      id: s.id,
      pet_name: s.petName ?? `Submission ${s.id.slice(0, 8)}`,
      species: s.petType ?? 'unknown',
      registration_status: s.vaccinationStatus ?? 'pending',
    })),
    total,
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function listMyEventPasses(
  userId: string,
  query: { page?: unknown; limit?: unknown },
): Promise<PaginatedListResponse<MeEventPassItem> & { meta: ReturnType<typeof buildPaginationMeta> }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 20);
  const user = await resolveUserIdentity(userId);
  if (!user) return { items: [], total: 0, meta: buildPaginationMeta(0, page, limit) };
  const where = {
    OR: [
      { userId: user.id },
      ...(user.email ? [{ email: user.email }] : []),
      ...(user.phone ? [{ phone: normalizePhone(user.phone) }] : []),
    ],
  };
  const [total, registrations] = await Promise.all([
    prisma.eventRegistration.count({ where }),
    prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        status: true,
        createdAt: true,
        event: { select: { title: true, startsAt: true } },
      },
    }),
  ]);
  return {
    items: registrations.map((r) => ({
      id: r.id,
      event_name: r.event.title,
      qr_code: r.id,
      status: r.status,
      event_date: r.event.startsAt.toISOString(),
    })),
    total,
    meta: buildPaginationMeta(total, page, limit),
  };
}

export async function listMyElections(userId: string): Promise<MeElectionItem[]> {
  const user = await resolveUserIdentity(userId);
  if (!user) return [];
  return [];
}
