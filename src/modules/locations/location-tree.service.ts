import { prisma } from '../../database/prisma';
import { LocationType, Prisma } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LocationNode {
  id: string;
  parentId: string | null;
  type: LocationType;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  code: string | null;
  lat: number | null;
  lon: number | null;
  isActive: boolean;
  isVerified: boolean;
  sortOrder: number;
  children?: LocationNode[];
}

const SELECT = {
  id: true,
  parentId: true,
  type: true,
  nameEn: true,
  nameBn: true,
  slug: true,
  code: true,
  lat: true,
  lon: true,
  isActive: true,
  isVerified: true,
  sortOrder: true,
} satisfies Prisma.LocationSelect;

function toNode(raw: Prisma.LocationGetPayload<{ select: typeof SELECT }>): LocationNode {
  return {
    ...raw,
    lat: raw.lat ? Number(raw.lat) : null,
    lon: raw.lon ? Number(raw.lon) : null,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────────

export async function listLocations(params: {
  type?: LocationType;
  parentId?: string | null;
  activeOnly?: boolean;
}): Promise<LocationNode[]> {
  const where: Prisma.LocationWhereInput = {};
  if (params.type) where.type = params.type;
  if (params.parentId !== undefined) where.parentId = params.parentId ?? null;
  if (params.activeOnly) where.isActive = true;

  const rows = await prisma.location.findMany({
    where,
    select: SELECT,
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  });
  return rows.map(toNode);
}

export async function getLocationById(id: string): Promise<LocationNode | null> {
  const row = await prisma.location.findUnique({ where: { id }, select: SELECT });
  return row ? toNode(row) : null;
}

export async function searchLocations(params: {
  q: string;
  type?: LocationType;
  limit?: number;
}): Promise<LocationNode[]> {
  const { q, type, limit = 20 } = params;
  const rows = await prisma.location.findMany({
    where: {
      isActive: true,
      ...(type ? { type } : {}),
      OR: [
        { nameEn: { contains: q, mode: 'insensitive' } },
        { nameBn: { contains: q } },
        { slug: { contains: q.toLowerCase() } },
      ],
    },
    select: SELECT,
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    take: limit,
  });
  return rows.map(toNode);
}

// Build a subtree rooted at rootId (or all top-level nodes if rootId is null).
// Depth is limited to 4 levels to keep response size sane for tree endpoint.
export async function getLocationTree(rootId: string | null): Promise<LocationNode[]> {
  const roots = await prisma.location.findMany({
    where: { parentId: rootId ?? null, isActive: true },
    select: SELECT,
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  });

  const hydrated = await Promise.all(roots.map(async (r: Prisma.LocationGetPayload<{ select: typeof SELECT }>) => {
    const node = toNode(r);
    // Only hydrate one level of children for performance
    const children = await prisma.location.findMany({
      where: { parentId: node.id, isActive: true },
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    node.children = children.map(toNode);
    return node;
  }));

  return hydrated;
}

// Root -> leaf ancestor chain (inclusive of the node itself), used to restore
// a full breadcrumb after a search result jump.
export async function getLocationAncestors(id: string): Promise<LocationNode[]> {
  const rows = await prisma.$queryRaw<Array<Prisma.LocationGetPayload<{ select: typeof SELECT }> & { depth: number }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id AS "parentId", type, name_en AS "nameEn", name_bn AS "nameBn",
             slug, code, lat, lon, is_active AS "isActive", is_verified AS "isVerified",
             sort_order AS "sortOrder", 0 AS depth
      FROM location_nodes WHERE id = ${id}::uuid
      UNION ALL
      SELECT l.id, l.parent_id, l.type, l.name_en, l.name_bn, l.slug, l.code,
             l.lat, l.lon, l.is_active, l.is_verified, l.sort_order, a.depth + 1
      FROM location_nodes l
      INNER JOIN ancestors a ON l.id = a."parentId"
    )
    SELECT id, "parentId", type, "nameEn", "nameBn", slug, code, lat, lon, "isActive", "isVerified", "sortOrder"
    FROM ancestors ORDER BY depth DESC
  `;
  return rows.map(toNode);
}

// ── Admin mutations ────────────────────────────────────────────────────────────

export async function createLocation(data: {
  parentId?: string | null;
  type: LocationType;
  nameEn: string;
  nameBn?: string | null;
  slug: string;
  code?: string | null;
  source?: string | null;
  sourceId?: string | null;
  lat?: number | null;
  lon?: number | null;
  sortOrder?: number;
  isVerified?: boolean;
}): Promise<LocationNode> {
  const row = await prisma.location.create({
    data: {
      parentId: data.parentId ?? null,
      type: data.type,
      nameEn: data.nameEn,
      nameBn: data.nameBn ?? null,
      slug: data.slug,
      code: data.code ?? null,
      source: data.source ?? null,
      sourceId: data.sourceId ?? null,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
      isVerified: data.isVerified ?? true,
    },
    select: SELECT,
  });
  return toNode(row);
}

export async function updateLocation(
  id: string,
  data: Partial<{
    nameEn: string;
    nameBn: string | null;
    slug: string;
    code: string | null;
    lat: number | null;
    lon: number | null;
    isActive: boolean;
    isVerified: boolean;
    sortOrder: number;
    parentId: string | null;
  }>,
): Promise<LocationNode> {
  const row = await prisma.location.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    select: SELECT,
  });
  return toNode(row);
}

// Soft-delete only — sets isActive = false
export async function softDeleteLocation(id: string): Promise<void> {
  await prisma.location.update({
    where: { id },
    data: { isActive: false, updatedAt: new Date() },
  });
}
