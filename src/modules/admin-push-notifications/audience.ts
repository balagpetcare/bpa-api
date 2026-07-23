import { prisma } from '../../database/prisma';

export type AudienceFilter = {
  locationIds?: string[];
  petTypes?: string[];
  campaignId?: string;
  membershipTierIds?: string[];
  language?: 'en' | 'bn';
  platform?: 'android' | 'ios' | 'web';
  minAppVersion?: string;
};

function intersect(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  return sets.reduce((acc, s) => new Set([...acc].filter((id) => s.has(id))));
}

/**
 * Resolves an audience filter down to a concrete list of active, non-deleted
 * user ids. Each specified filter dimension narrows the result (AND
 * semantics across dimensions); omitted dimensions are skipped rather than
 * excluding everyone. Used for both the live recipient estimate and the
 * actual send — the two must use the same logic so the estimate is honest.
 */
export async function resolveAudienceUserIds(
  audienceType: 'all_users' | 'segment',
  filter: AudienceFilter | null | undefined,
): Promise<string[]> {
  const baseUsers = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });
  let result = new Set(baseUsers.map((u) => u.id));

  if (audienceType === 'all_users' || !filter) {
    return [...result];
  }

  const dimensionSets: Set<string>[] = [];

  if (filter.locationIds?.length) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { divisionId: { in: filter.locationIds } },
          { districtId: { in: filter.locationIds } },
          { upazilaId: { in: filter.locationIds } },
          { unionId: { in: filter.locationIds } },
          { cityCorporationId: { in: filter.locationIds } },
          { cityZoneId: { in: filter.locationIds } },
          { wardId: { in: filter.locationIds } },
        ],
      },
      select: { id: true },
    });
    dimensionSets.push(new Set(users.map((u) => u.id)));
  }

  if (filter.petTypes?.length) {
    const pets = await prisma.pet.findMany({
      where: { petType: { in: filter.petTypes as any }, isActive: true },
      select: { ownerId: true },
    });
    dimensionSets.push(new Set(pets.map((p) => p.ownerId)));
  }

  if (filter.campaignId) {
    const registrations = await prisma.campaignRegistration.findMany({
      where: { campaignId: filter.campaignId, status: { notIn: ['cancelled', 'pending_payment'] } },
      select: { owner: { select: { userId: true } } },
    });
    dimensionSets.push(new Set(registrations.map((r) => r.owner.userId).filter((v): v is string => !!v)));
  }

  if (filter.membershipTierIds?.length) {
    const memberships = await prisma.membership.findMany({
      where: { planId: { in: filter.membershipTierIds }, status: 'active' },
      select: { userId: true },
    });
    dimensionSets.push(new Set(memberships.map((m) => m.userId).filter((v): v is string => !!v)));
  }

  if (filter.language) {
    const preferences = await prisma.notificationPreference.findMany({
      where: { language: filter.language },
      select: { userId: true },
    });
    // Users with no preference row default to 'en' — include them only for
    // the 'en' filter so an explicit 'bn' filter doesn't pull in everyone.
    if (filter.language === 'en') {
      const withPref = new Set(preferences.map((p) => p.userId));
      const withoutPrefUsers = await prisma.user.findMany({
        where: { notificationPreference: { is: null } },
        select: { id: true },
      });
      dimensionSets.push(new Set([...withPref, ...withoutPrefUsers.map((u) => u.id)]));
    } else {
      dimensionSets.push(new Set(preferences.map((p) => p.userId)));
    }
  }

  if (filter.platform || filter.minAppVersion) {
    const devices = await prisma.deviceInstallation.findMany({
      where: {
        isActive: true,
        ...(filter.platform ? { platform: filter.platform } : {}),
      },
      select: { userId: true, appVersion: true },
    });
    const filtered = filter.minAppVersion
      ? devices.filter((d) => !d.appVersion || compareVersions(d.appVersion, filter.minAppVersion!) >= 0)
      : devices;
    dimensionSets.push(new Set(filtered.map((d) => d.userId)));
  }

  if (dimensionSets.length > 0) {
    result = intersect([result, ...dimensionSets]);
  }

  return [...result];
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
