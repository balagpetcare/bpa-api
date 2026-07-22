import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateCommunityZoneDto, UpdateCommunityZoneDto, CommunityZoneListQuery } from './community-zones.types';

const zoneInclude = {
  coverImage: { select: { id: true, url: true, altText: true } },
} as const;

export async function createZone(dto: CreateCommunityZoneDto) {
  return prisma.communityZone.create({
    data: {
      name: dto.name,
      nameBn: dto.nameBn,
      slug: dto.slug,
      description: dto.description,
      city: dto.city,
      district: dto.district,
      division: dto.division,
      targetContributors: dto.targetContributors,
      targetAmountBdt: dto.targetAmountBdt,
      targetMembers: dto.targetMembers,
      clinicAddress: dto.clinicAddress,
      clinicPhone: dto.clinicPhone,
      mapEmbedUrl: dto.mapEmbedUrl,
      latitude: dto.latitude,
      longitude: dto.longitude,
      coverImageId: dto.coverImageId,
      sortOrder: dto.sortOrder,
      priorityOrder: dto.priorityOrder,
      status: dto.status,
      clinicStatus: dto.clinicStatus,
      isActive: dto.isActive,
      publicVisible: dto.publicVisible,
      expectedLaunchNote: dto.expectedLaunchNote,
    },
    include: zoneInclude,
  });
}

export async function listZones(query: CommunityZoneListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.CommunityZoneWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.communityZone.findMany({ where, skip, take: limit, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: zoneInclude }),
    prisma.communityZone.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

// Returns all zone fields (preserving backward compat) plus new clinic phase fields
// and computed paidMemberCount / totalPurchaseCount for zone card display.
export async function listActiveZonesPublic() {
  const zones = await prisma.communityZone.findMany({
    where: { isActive: true, status: 'active', publicVisible: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      coverImage: { select: { id: true, url: true, altText: true } },
      _count: { select: { membershipPurchases: true } },
      membershipPurchases: {
        where: { status: 'paid' },
        select: { id: true },
      },
    },
  });

  return zones.map((z) => {
    const { membershipPurchases, _count, ...zoneData } = z;
    return {
      ...zoneData,
      paidMemberCount: membershipPurchases.length,
      totalPurchaseCount: _count.membershipPurchases,
    };
  });
}

export async function getZoneById(id: string) {
  return prisma.communityZone.findUnique({ where: { id }, include: zoneInclude });
}

export async function getZoneBySlug(slug: string) {
  return prisma.communityZone.findUnique({ where: { slug }, include: zoneInclude });
}

export async function getDemandRanking() {
  const zones = await prisma.communityZone.findMany({
    include: {
      _count: {
        select: {
          cards: { where: { status: 'active' } },
          membershipPurchases: { where: { status: 'paid' } }, 
          contributions: true,
        },
      },
      contributions: {
        select: { status: true, amountBdt: true, createdAt: true },
      },
      membershipPurchases: {
        select: { status: true, amountBdt: true, createdAt: true },
      },
    },
  });

  const ranked = zones.map((z: any) => {
    // Both legacy cards and new active memberships count as active cards
    const activeCards = (z._count?.cards || 0) + (z._count?.membershipPurchases || 0);
    
    const paidPurchases = 
      (z.contributions || []).filter((c: any) => c.status === 'paid').length +
      (z.membershipPurchases || []).filter((c: any) => c.status === 'paid').length;
      
    const pendingPurchases = 
      (z.contributions || []).filter((c: any) => c.status === 'pending_payment').length +
      (z.membershipPurchases || []).filter((c: any) => c.status === 'pending_payment').length;
      
    const revenueAmount = 
      (z.contributions || []).filter((c: any) => c.status === 'paid').reduce((acc: number, c: any) => acc + Number(c.amountBdt), 0) +
      (z.membershipPurchases || []).filter((c: any) => c.status === 'paid').reduce((acc: number, c: any) => acc + Number(c.amountBdt), 0);

    const dates = [
      ...(z.contributions || []).map((c: any) => c.createdAt.getTime()),
      ...(z.membershipPurchases || []).map((m: any) => m.createdAt.getTime()),
    ];
    const lastPurchaseDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    // priorityScore = activeCards * 10 + paidPurchases * 5 + pendingPurchases * 1
    const priorityScore = activeCards * 10 + paidPurchases * 5 + pendingPurchases * 1;

    return {
      id: z.id,
      name: z.name,
      slug: z.slug,
      clinicStatus: z.clinicStatus,
      targetMembers: z.targetMembers || 1000,
      activeCards,
      paidPurchases,
      pendingPurchases,
      revenueAmount,
      priorityScore,
      lastPurchaseDate,
      publicVisible: z.publicVisible,
      priorityOrder: z.priorityOrder,
      description: z.description,
    };
  });

  // Sort by priorityScore desc
  return ranked.sort((a, b) => b.priorityScore - a.priorityScore);
}

export async function updateZone(id: string, dto: UpdateCommunityZoneDto) {
  const data: Prisma.CommunityZoneUpdateInput = { ...dto };
  return prisma.communityZone.update({ where: { id }, data, include: zoneInclude });
}

export async function deleteZone(id: string) {
  return prisma.communityZone.delete({ where: { id } });
}
