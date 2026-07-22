/**
 * Seed Bangladesh master location data.
 *
 * Order:
 *   1. nuhil/bangladesh-geocode  → Division / District / Upazila / Union
 *   2. custom city-corporations.json → CityCorporation / CityZone / Ward
 *
 * Idempotent: safe to run multiple times without creating duplicates.
 * Usage:  npm run seed:locations
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { PrismaClient, LocationType } from '@prisma/client';
import { importBangladeshGeocode } from './import-bangladesh-geocode';

const prisma = new PrismaClient();

// ── Types for city-corporations.json ──────────────────────────────────────────

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
  divisionName: string;
  isVerified: boolean;
  wardCount?: number;
  zones: ZoneEntry[];
  _note?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function findDistrictId(districtName: string): Promise<string | null> {
  const normalised = districtName.toLowerCase().trim();
  const found = await prisma.location.findFirst({
    where: {
      type: LocationType.DISTRICT,
      OR: [
        { nameEn: { equals: districtName, mode: 'insensitive' } },
        { slug: normalised },
        { slug: slugify(districtName) },
      ],
    },
    select: { id: true },
  });
  return found?.id ?? null;
}

async function upsertByCode(data: {
  code: string;
  type: LocationType;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  parentId: string | null;
  isVerified?: boolean;
}): Promise<string> {
  const source = 'bpa/custom';

  const existing = await prisma.location.findFirst({
    where: { source, sourceId: data.code, type: data.type },
    select: { id: true },
  });

  if (existing) {
    await prisma.location.update({
      where: { id: existing.id },
      data: {
        nameEn: data.nameEn,
        nameBn: data.nameBn,
        parentId: data.parentId,
        isVerified: data.isVerified ?? true,
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }

  const created = await prisma.location.create({
    data: {
      source,
      sourceId: data.code,
      type: data.type,
      nameEn: data.nameEn,
      nameBn: data.nameBn,
      slug: data.slug,
      code: data.code,
      parentId: data.parentId,
      isActive: true,
      isVerified: data.isVerified ?? true,
    },
    select: { id: true },
  });
  return created.id;
}

// ── Seed City Corporations ─────────────────────────────────────────────────────

async function seedCityCorporations(): Promise<void> {
  console.log('[City Corps] Seeding city corporations…');
  const jsonPath = path.join(__dirname, 'city-corporations.json');
  const corps: CityCorpEntry[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  let corpCount = 0;
  let zoneCount = 0;
  let wardCount = 0;

  for (const corp of corps) {
    // Find parent district
    const districtId = await findDistrictId(corp.districtName);
    if (!districtId) {
      console.warn(`  ! Could not find district "${corp.districtName}" — skipping ${corp.nameEn}`);
      continue;
    }

    // Upsert city corporation
    const corpId = await upsertByCode({
      code: corp.code,
      type: LocationType.CITY_CORPORATION,
      nameEn: corp.nameEn,
      nameBn: corp.nameBn,
      slug: slugify(corp.nameEn),
      parentId: districtId,
      isVerified: corp.isVerified,
    });
    corpCount++;

    // Seed zones and their wards
    for (const zone of corp.zones) {
      const zoneId = await upsertByCode({
        code: zone.code,
        type: LocationType.CITY_ZONE,
        nameEn: zone.nameEn,
        nameBn: zone.nameBn,
        slug: slugify(zone.nameEn),
        parentId: corpId,
        isVerified: corp.isVerified,
      });
      zoneCount++;

      for (const ward of zone.wards) {
        const wardCode = `${zone.code}-W${ward.number}`;
        await upsertByCode({
          code: wardCode,
          type: LocationType.WARD,
          nameEn: ward.nameEn,
          nameBn: ward.nameBn,
          slug: slugify(`${corp.code} ward ${ward.number}`),
          parentId: zoneId,
          isVerified: corp.isVerified,
        });
        wardCount++;
      }
    }

    // If no zones defined but wardCount given, seed wards directly under corp
    if (corp.zones.length === 0 && corp.wardCount) {
      for (let n = 1; n <= corp.wardCount; n++) {
        const wardCode = `${corp.code}-W${n}`;
        await upsertByCode({
          code: wardCode,
          type: LocationType.WARD,
          nameEn: `Ward ${n}`,
          nameBn: `ওয়ার্ড ${n}`,
          slug: slugify(`${corp.code} ward ${n}`),
          parentId: corpId,
          isVerified: corp.isVerified,
        });
        wardCount++;
      }
    }
  }

  console.log(`[City Corps] ✓ ${corpCount} corporations, ${zoneCount} zones, ${wardCount} wards\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== BPA Location Seed ===\n');

  // Step 1: Bangladesh geocode (Division → District → Upazila → Union)
  await importBangladeshGeocode();

  // Step 2: Custom city corporation data
  await seedCityCorporations();

  // Verification summary
  const counts = await prisma.location.groupBy({
    by: ['type'],
    _count: { _all: true },
  });

  console.log('── Verification ────────────────────────────────');
  counts
    .sort((a, b) => a.type.localeCompare(b.type))
    .forEach((r) => console.log(`  ${r.type.padEnd(20)} ${r._count._all}`));
  console.log('────────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
