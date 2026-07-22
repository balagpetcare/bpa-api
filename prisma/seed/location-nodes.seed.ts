/**
 * Seed the unified location_nodes table.
 *
 * Canonical tree:
 *   Division -> District -> Upazila -> Union
 *   District -> City Corporation -> City Zone -> Ward
 *
 * Data sources:
 *   - nuhil/bangladesh-geocode for Bangladesh divisions, districts, upazilas,
 *     and unions.
 *   - scripts/location-data/city-corporations.json for DNCC/DSCC zones and wards.
 *
 * Idempotent: every imported row is keyed by stable source/sourceId.
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient, LocationType } from '@prisma/client';
import { importBangladeshGeocode } from '../../scripts/location-data/import-bangladesh-geocode';

const CITY_SOURCE = 'bpa/custom';
const OLD_MIRROR_SOURCE = 'seed/location-nodes';

interface WardEntry {
  number: number;
  nameEn: string;
  nameBn: string;
  area?: string;
}

interface ZoneEntry {
  nameEn: string;
  nameBn: string;
  code: string;
  wards: WardEntry[];
}

interface CityCorpEntry {
  nameEn: string;
  nameBn: string;
  code: string;
  districtName: string;
  isVerified: boolean;
  zones: ZoneEntry[];
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function upsertBySource(
  prisma: PrismaClient,
  data: {
    source: string;
    sourceId: string;
    type: LocationType;
    nameEn: string;
    nameBn?: string | null;
    code?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    isVerified?: boolean;
  },
): Promise<string> {
  const existing = await prisma.location.findFirst({
    where: { source: data.source, sourceId: data.sourceId, type: data.type },
    select: { id: true },
  });

  const payload = {
    type: data.type,
    nameEn: data.nameEn,
    nameBn: data.nameBn ?? null,
    slug: slugify(data.nameEn),
    code: data.code ?? null,
    source: data.source,
    sourceId: data.sourceId,
    parentId: data.parentId ?? null,
    sortOrder: data.sortOrder ?? 0,
    isActive: true,
    isVerified: data.isVerified ?? true,
  };

  if (existing) {
    const row = await prisma.location.update({
      where: { id: existing.id },
      data: payload,
      select: { id: true },
    });
    return row.id;
  }

  const row = await prisma.location.create({
    data: payload,
    select: { id: true },
  });
  return row.id;
}

async function findDistrictId(prisma: PrismaClient, districtName: string): Promise<string | null> {
  const slug = slugify(districtName);
  const found = await prisma.location.findFirst({
    where: {
      type: LocationType.DISTRICT,
      isActive: true,
      OR: [
        { nameEn: { equals: districtName, mode: 'insensitive' } },
        { slug },
      ],
    },
    select: { id: true },
  });
  return found?.id ?? null;
}

async function seedDhakaCityWards(prisma: PrismaClient): Promise<{
  cityCorporations: number;
  zones: number;
  wards: number;
}> {
  const jsonPath = path.join(__dirname, '../../scripts/location-data/city-corporations.json');
  const allCorps = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as CityCorpEntry[];
  const dhakaCorps = allCorps.filter((corp) => corp.code === 'DNCC' || corp.code === 'DSCC');

  let cityCorporations = 0;
  let zones = 0;
  let wards = 0;

  for (const corp of dhakaCorps) {
    const districtId = await findDistrictId(prisma, corp.districtName);
    if (!districtId) {
      console.warn(`  ! Could not find district "${corp.districtName}" - skipping ${corp.code}`);
      continue;
    }

    const corpId = await upsertBySource(prisma, {
      source: CITY_SOURCE,
      sourceId: corp.code,
      type: LocationType.CITY_CORPORATION,
      nameEn: corp.nameEn,
      nameBn: corp.nameBn,
      code: corp.code,
      parentId: districtId,
      isVerified: corp.isVerified,
    });
    cityCorporations++;

    for (const [zoneIndex, zone] of corp.zones.entries()) {
      const zoneId = await upsertBySource(prisma, {
        source: CITY_SOURCE,
        sourceId: zone.code,
        type: LocationType.CITY_ZONE,
        nameEn: zone.nameEn,
        nameBn: zone.nameBn,
        code: zone.code,
        parentId: corpId,
        sortOrder: zoneIndex + 1,
        isVerified: corp.isVerified,
      });
      zones++;

      for (const ward of zone.wards) {
        const wardCode = `${zone.code}-W${ward.number}`;
        await upsertBySource(prisma, {
          source: CITY_SOURCE,
          sourceId: wardCode,
          type: LocationType.WARD,
          nameEn: ward.area ? `${ward.nameEn} - ${ward.area}` : ward.nameEn,
          nameBn: ward.nameBn,
          code: wardCode,
          parentId: zoneId,
          sortOrder: ward.number,
          isVerified: corp.isVerified,
        });
        wards++;
      }
    }
  }

  return { cityCorporations, zones, wards };
}

async function deactivateOldFlatMirror(prisma: PrismaClient): Promise<number> {
  const result = await prisma.location.updateMany({
    where: { source: OLD_MIRROR_SOURCE, isActive: true },
    data: { isActive: false },
  });
  return result.count;
}

async function activeCount(prisma: PrismaClient, type: LocationType): Promise<number> {
  return prisma.location.count({ where: { type, isActive: true } });
}

export async function seedLocationNodes(prisma: PrismaClient) {
  const geocode = await importBangladeshGeocode(prisma);
  const dhakaCity = await seedDhakaCityWards(prisma);
  const deactivatedLegacyNodes = await deactivateOldFlatMirror(prisma);

  return {
    divisions: await activeCount(prisma, LocationType.DIVISION),
    districts: await activeCount(prisma, LocationType.DISTRICT),
    upazilas: await activeCount(prisma, LocationType.UPAZILA),
    unions: await activeCount(prisma, LocationType.UNION),
    cityCorporations: await activeCount(prisma, LocationType.CITY_CORPORATION),
    zones: await activeCount(prisma, LocationType.CITY_ZONE),
    wards: await activeCount(prisma, LocationType.WARD),
    imported: {
      ...geocode,
      cityCorporations: dhakaCity.cityCorporations,
      zones: dhakaCity.zones,
      wards: dhakaCity.wards,
    },
    deactivatedLegacyNodes,
  };
}
