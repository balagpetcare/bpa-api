import { AppError } from '../../utils/AppError';
import * as repo from './community-zones.repository';
import type { CreateCommunityZoneDto, UpdateCommunityZoneDto, CommunityZoneListQuery } from './community-zones.types';

export async function createZone(dto: CreateCommunityZoneDto) {
  return repo.createZone(dto);
}

export async function listZones(query: CommunityZoneListQuery) {
  return repo.listZones(query);
}

export async function getDemandRanking() {
  return repo.getDemandRanking();
}

export async function listActiveZonesPublic() {
  const zones = await repo.listActiveZonesPublic();

  // Sort: explicit priorityOrder first (ascending), then by paidMemberCount desc
  const sorted = [...zones].sort((a, b) => {
    const aP = a.priorityOrder ?? Infinity;
    const bP = b.priorityOrder ?? Infinity;
    if (aP !== bP) return aP - bP;
    return b.paidMemberCount - a.paidMemberCount;
  });

  return sorted.map((z, i) => ({ ...z, rank: i + 1 }));
}

export async function getZone(id: string) {
  const zone = await repo.getZoneById(id);
  if (!zone) throw AppError.notFound('Community zone');
  return zone;
}

export async function getZoneBySlug(slug: string) {
  const zone = await repo.getZoneBySlug(slug);
  if (!zone) throw AppError.notFound('Community zone');
  return zone;
}

export async function updateZone(id: string, dto: UpdateCommunityZoneDto) {
  await getZone(id);
  return repo.updateZone(id, dto);
}

export async function deleteZone(id: string) {
  await getZone(id);
  await repo.deleteZone(id);
}
