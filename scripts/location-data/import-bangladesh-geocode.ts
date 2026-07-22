/**
 * Import Bangladesh administrative location data from nuhil/bangladesh-geocode.
 * Sources: https://github.com/nuhil/bangladesh-geocode
 *
 * Re-run safe: uses upsert by (source, sourceId) — never creates duplicates.
 * Works with native fetch (Node 18+) — no extra HTTP dependency required.
 */

import 'dotenv/config';
import { PrismaClient, LocationType } from '@prisma/client';

const cliPrisma = new PrismaClient();

const SOURCE = 'nuhil/bangladesh-geocode';
const BASE_RAW = 'https://raw.githubusercontent.com/nuhil/bangladesh-geocode/master';

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function fetchRows<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const json: unknown = await res.json();

  if (!Array.isArray(json)) return [];

  // New format (PHPMyAdmin JSON export): [{type:"header",...},{type:"table","data":[...]},...]
  // Detect by checking if first element has a "type" string key (not a data row).
  const first = json[0];
  if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).type === 'string') {
    const table = (json as Array<Record<string, unknown>>).find((e) => e.type === 'table');
    if (table && Array.isArray(table.data)) return table.data as T[];
    return [];
  }

  // Old format: direct array of row objects
  return json as T[];
}

// ── Upsert one location node ───────────────────────────────────────────────────

async function upsertLocation(data: {
  prisma: PrismaClient;
  sourceId: string;
  type: LocationType;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  parentId: string | null;
  lat?: number | null;
  lon?: number | null;
}): Promise<string> {
  const existing = await data.prisma.location.findFirst({
    where: { source: SOURCE, sourceId: data.sourceId, type: data.type },
    select: { id: true },
  });

  if (existing) {
    await data.prisma.location.update({
      where: { id: existing.id },
      data: {
        nameEn: data.nameEn,
        nameBn: data.nameBn,
        slug: data.slug,
        parentId: data.parentId,
        lat: data.lat ?? null,
        lon: data.lon ?? null,
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }

  const created = await data.prisma.location.create({
    data: {
      sourceId: data.sourceId,
      source: SOURCE,
      type: data.type,
      nameEn: data.nameEn,
      nameBn: data.nameBn,
      slug: data.slug,
      parentId: data.parentId,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      isActive: true,
      isVerified: true,
    },
    select: { id: true },
  });
  return created.id;
}

// ── Step 1: Divisions ─────────────────────────────────────────────────────────

interface RawDivision {
  id: string;
  name: string;
  bn_name: string;
  url?: string;
}

async function importDivisions(prisma: PrismaClient): Promise<Map<string, string>> {
  console.log('  Importing divisions…');
  const rows: RawDivision[] = await fetchRows(`${BASE_RAW}/divisions/divisions.json`);

  const idMap = new Map<string, string>(); // sourceId → DB uuid

  for (const row of rows) {
    const dbId = await upsertLocation({
      prisma,
      sourceId: row.id,
      type: LocationType.DIVISION,
      nameEn: row.name,
      nameBn: row.bn_name || null,
      slug: slugify(row.name),
      parentId: null,
    });
    idMap.set(row.id, dbId);
  }

  console.log(`  ✓ ${rows.length} divisions`);
  return idMap;
}

// ── Step 2: Districts ─────────────────────────────────────────────────────────

interface RawDistrict {
  id: string;
  division_id: string;
  name: string;
  bn_name: string;
  lat?: string | null;
  lon?: string | null;
  url?: string;
}

async function importDistricts(
  prisma: PrismaClient,
  divisionMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('  Importing districts…');
  const rows: RawDistrict[] = await fetchRows(`${BASE_RAW}/districts/districts.json`);

  const idMap = new Map<string, string>();
  let skipped = 0;

  for (const row of rows) {
    const parentId = divisionMap.get(row.division_id) ?? null;
    if (!parentId) { skipped++; continue; }

    const dbId = await upsertLocation({
      prisma,
      sourceId: row.id,
      type: LocationType.DISTRICT,
      nameEn: row.name,
      nameBn: row.bn_name || null,
      slug: slugify(row.name),
      parentId,
      lat: row.lat ? parseFloat(row.lat) : null,
      lon: row.lon ? parseFloat(row.lon) : null,
    });
    idMap.set(row.id, dbId);
  }

  console.log(`  ✓ ${rows.length - skipped} districts (${skipped} skipped — unknown division)`);
  return idMap;
}

// ── Step 3: Upazilas ──────────────────────────────────────────────────────────

interface RawUpazila {
  id: string;
  district_id: string;
  name: string;
  bn_name: string;
  url?: string;
}

async function importUpazilas(
  prisma: PrismaClient,
  districtMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('  Importing upazilas…');
  const rows: RawUpazila[] = await fetchRows(`${BASE_RAW}/upazilas/upazilas.json`);

  const idMap = new Map<string, string>();
  let skipped = 0;
  let batchCount = 0;

  for (const row of rows) {
    const parentId = districtMap.get(row.district_id) ?? null;
    if (!parentId) { skipped++; continue; }

    const dbId = await upsertLocation({
      prisma,
      sourceId: row.id,
      type: LocationType.UPAZILA,
      nameEn: row.name,
      nameBn: row.bn_name || null,
      slug: slugify(row.name),
      parentId,
    });
    idMap.set(row.id, dbId);
    batchCount++;

    if (batchCount % 50 === 0) process.stdout.write('.');
  }

  process.stdout.write('\n');
  console.log(`  ✓ ${batchCount} upazilas (${skipped} skipped)`);
  return idMap;
}

// ── Step 4: Unions ────────────────────────────────────────────────────────────

interface RawUnion {
  id: string;
  upazilla_id: string; // note: source spells with double-l
  name: string;
  bn_name: string;
  url?: string;
}

async function importUnions(prisma: PrismaClient, upazilaMap: Map<string, string>): Promise<number> {
  console.log('  Importing unions (this takes a moment)…');
  const rows: RawUnion[] = await fetchRows(`${BASE_RAW}/unions/unions.json`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const parentId = upazilaMap.get(row.upazilla_id) ?? null;
    if (!parentId) { skipped++; continue; }

    await upsertLocation({
      prisma,
      sourceId: row.id,
      type: LocationType.UNION,
      nameEn: row.name,
      nameBn: row.bn_name || null,
      slug: slugify(row.name),
      parentId,
    });
    imported++;

    if (imported % 200 === 0) process.stdout.write('.');
  }

  process.stdout.write('\n');
  console.log(`  ✓ ${imported} unions (${skipped} skipped)`);
  return imported;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function importBangladeshGeocode(prisma: PrismaClient = cliPrisma): Promise<{
  divisions: number;
  districts: number;
  upazilas: number;
  unions: number;
}> {
  console.log('\n[BD Geocode] Starting import from nuhil/bangladesh-geocode…');
  const t0 = Date.now();

  const divisionMap = await importDivisions(prisma);
  const districtMap = await importDistricts(prisma, divisionMap);
  const upazilaMap  = await importUpazilas(prisma, districtMap);
  const unions = await importUnions(prisma, upazilaMap);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[BD Geocode] Done in ${elapsed}s\n`);

  return {
    divisions: divisionMap.size,
    districts: districtMap.size,
    upazilas: upazilaMap.size,
    unions,
  };
}

// Allow direct run: ts-node scripts/location-data/import-bangladesh-geocode.ts
if (require.main === module) {
  importBangladeshGeocode()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(() => cliPrisma.$disconnect());
}
