import * as XLSX from 'xlsx';
import { prisma } from '../../database/prisma';
import { generateSlug, uniqueClinicOrganizationSlug, uniqueClinicBranchSlug } from '../../utils/slug';

const DIRECTORY_SHEET = 'Directory';

const NA_VALUES = new Set(['', 'n/a', 'na', 'null', 'none', '-']);

/** Converts Excel "N/A"/blank cells to `null`; trims real values. Never
 * invents a value — a missing cell stays missing. */
function cleanCell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (NA_VALUES.has(text.toLowerCase())) return null;
  return text.length === 0 ? null : text;
}

/** Splits a "a / b" style multi-value cell (phone numbers) on `/`. Must
 * never be used for URLs — a URL's own `/` characters would be shredded. */
function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !NA_VALUES.has(s.toLowerCase()));
}

/** Splits a " url1 ; url2 " style multi-value cell on `;` only — safe for
 * URLs, which legitimately contain `/`. */
function splitUrlList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !NA_VALUES.has(s.toLowerCase()));
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

/** Stable dedup/idempotency key for a branch row — deliberately NOT phone
 * alone, so branches that legitimately share a phone number (e.g. two
 * outlets of the same clinic) remain distinct records across re-imports. */
function buildImportKey(parts: {
  clinicName: string;
  branchArea: string | null;
  address: string | null;
  primaryPhone: string | null;
}): string {
  const seg = (s: string | null) => generateSlug(s ?? '').slice(0, 80) || 'none';
  return [
    seg(parts.clinicName),
    seg(parts.branchArea),
    seg(parts.address),
    parts.primaryPhone ? normalizePhone(parts.primaryPhone) : 'nophone',
  ].join('|');
}

export interface RawDirectoryRow {
  'SL'?: unknown;
  'Clinic / Hospital / Vet Point Name'?: unknown;
  'Branch / Area'?: unknown;
  'City Corporation'?: unknown;
  'Address'?: unknown;
  'Contact Number'?: unknown;
  'Normalized Unique Phone(s)'?: unknown;
  'Primary Phone Key'?: unknown;
  'Phone Duplicate Status'?: unknown;
  'Google Maps Search URL'?: unknown;
  'Source URL(s)'?: unknown;
  'Record Type'?: unknown;
  'Notes'?: unknown;
}

export interface ParsedClinicRow {
  rowNumber: number;
  clinicName: string | null;
  branchArea: string | null;
  cityCorporation: string | null;
  address: string | null;
  phones: string[];
  primaryPhone: string | null;
  googleMapUrl: string | null;
  sourceUrls: string[];
  notes: string | null;
  recordType: string | null;
  importKey: string;
  organizationSlugSeed: string;
}

/** Reads the workbook's `Directory` sheet safely: throws a clear error if
 * the sheet is missing rather than silently importing zero rows. */
export function parseDirectorySheet(buffer: Buffer): ParsedClinicRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[DIRECTORY_SHEET];
  if (!sheet) {
    throw new Error(`Workbook has no "${DIRECTORY_SHEET}" sheet`);
  }
  const rows = XLSX.utils.sheet_to_json<RawDirectoryRow>(sheet, { defval: null });

  return rows.map((row, index) => {
    const clinicName = cleanCell(row['Clinic / Hospital / Vet Point Name']);
    const branchArea = cleanCell(row['Branch / Area']);
    const address = cleanCell(row['Address']);
    const normalizedPhonesRaw = cleanCell(row['Normalized Unique Phone(s)']);
    const contactNumberRaw = cleanCell(row['Contact Number']);
    const primaryPhoneKeyRaw = cleanCell(row['Primary Phone Key']);

    const phones = splitList(normalizedPhonesRaw ?? contactNumberRaw).map(normalizePhone);
    const primaryPhone = primaryPhoneKeyRaw
      ? normalizePhone(primaryPhoneKeyRaw)
      : (phones[0] ?? null);

    return {
      rowNumber: index + 2, // +2: 1-indexed and header row occupies row 1
      clinicName,
      branchArea,
      cityCorporation: cleanCell(row['City Corporation']),
      address,
      phones,
      primaryPhone,
      googleMapUrl: cleanCell(row['Google Maps Search URL']),
      sourceUrls: splitUrlList(cleanCell(row['Source URL(s)'])),
      notes: cleanCell(row['Notes']),
      recordType: cleanCell(row['Record Type']),
      importKey: buildImportKey({ clinicName: clinicName ?? '', branchArea, address, primaryPhone }),
      organizationSlugSeed: clinicName ?? '',
    };
  });
}

export type ImportRowStatus = 'inserted' | 'updated' | 'unchanged' | 'skipped' | 'invalid';

export interface ImportRowResult {
  rowNumber: number;
  clinicName: string | null;
  branchArea: string | null;
  importKey: string;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportReport {
  totalRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  invalid: number;
  committed: boolean;
  rows: ImportRowResult[];
}

function branchScalarFieldsEqual(
  existing: { branchName: string; address: string | null; area: string | null; cityCorporation: string | null; googleMapUrl: string | null; importNotes: string | null },
  incoming: ParsedClinicRow,
): boolean {
  return (
    existing.branchName === incoming.clinicName &&
    existing.address === incoming.address &&
    existing.area === incoming.branchArea &&
    existing.cityCorporation === incoming.cityCorporation &&
    existing.googleMapUrl === incoming.googleMapUrl &&
    existing.importNotes === incoming.notes
  );
}

function phonesEqual(existingPhones: string[], incomingPhones: string[]): boolean {
  if (existingPhones.length !== incomingPhones.length) return false;
  const a = [...existingPhones].sort();
  const b = [...incomingPhones].sort();
  return a.every((v, i) => v === b[i]);
}

/**
 * Imports the branch/contact-level directory sheet. Always dry-run capable
 * (`commit: false`) so an admin can preview insert/update/skip/invalid
 * counts before anything is written; idempotent on re-run because matching
 * is done via each row's stable `importKey`, not by phone number alone.
 *
 * Never invents latitude/longitude/WhatsApp/emergency/24-hour data — none
 * of that exists in this sheet, so every imported branch keeps those fields
 * at their UNKNOWN/null defaults until an admin verifies them by hand.
 */
export async function importClinicDirectory(
  buffer: Buffer,
  options: { commit: boolean },
): Promise<ImportReport> {
  const rows = parseDirectorySheet(buffer);
  const seenImportKeys = new Set<string>();
  const results: ImportRowResult[] = [];

  for (const row of rows) {
    if (!row.clinicName) {
      results.push({
        rowNumber: row.rowNumber,
        clinicName: row.clinicName,
        branchArea: row.branchArea,
        importKey: row.importKey,
        status: 'invalid',
        reason: 'Missing clinic name',
      });
      continue;
    }
    if (row.recordType && row.recordType !== 'Branch/contact-level') {
      results.push({
        rowNumber: row.rowNumber,
        clinicName: row.clinicName,
        branchArea: row.branchArea,
        importKey: row.importKey,
        status: 'skipped',
        reason: `Unsupported record type "${row.recordType}"`,
      });
      continue;
    }
    if (seenImportKeys.has(row.importKey)) {
      results.push({
        rowNumber: row.rowNumber,
        clinicName: row.clinicName,
        branchArea: row.branchArea,
        importKey: row.importKey,
        status: 'skipped',
        reason: 'Duplicate row within workbook (identical name/area/address/phone)',
      });
      continue;
    }
    seenImportKeys.add(row.importKey);

    const existing = await prisma.clinicBranch.findUnique({
      where: { importKey: row.importKey },
      include: { phones: true },
    });

    if (!existing) {
      results.push({
        rowNumber: row.rowNumber,
        clinicName: row.clinicName,
        branchArea: row.branchArea,
        importKey: row.importKey,
        status: 'inserted',
      });
      if (options.commit) await insertRow(row);
      continue;
    }

    const scalarsEqual = branchScalarFieldsEqual(existing, row);
    const phonesMatch = phonesEqual(existing.phones.map((p) => p.phoneNumber), row.phones);
    const sourcesExisting = await prisma.clinicBranchSource.findMany({ where: { branchId: existing.id } });
    const sourcesMatch =
      sourcesExisting.length === row.sourceUrls.length &&
      [...sourcesExisting.map((s) => s.sourceUrl)].sort().every((v, i) => v === [...row.sourceUrls].sort()[i]);

    if (scalarsEqual && phonesMatch && sourcesMatch) {
      results.push({
        rowNumber: row.rowNumber,
        clinicName: row.clinicName,
        branchArea: row.branchArea,
        importKey: row.importKey,
        status: 'unchanged',
      });
      continue;
    }

    results.push({
      rowNumber: row.rowNumber,
      clinicName: row.clinicName,
      branchArea: row.branchArea,
      importKey: row.importKey,
      status: 'updated',
    });
    if (options.commit) await updateRow(existing.id, row);
  }

  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { inserted: 0, updated: 0, unchanged: 0, skipped: 0, invalid: 0 } as Record<ImportRowStatus, number>,
  );

  return {
    totalRows: rows.length,
    ...counts,
    committed: options.commit,
    rows: results,
  };
}

async function resolveOrganizationId(clinicName: string): Promise<string> {
  const seedSlug = generateSlug(clinicName);
  const existingBySlug = await prisma.clinicOrganization.findFirst({
    where: { slug: seedSlug },
  });
  if (existingBySlug) return existingBySlug.id;

  // Also match by exact case-insensitive name — the slug alone can collide
  // for organizations with different names that slugify identically only
  // in edge cases, but the more common case this guards is a second branch
  // of an org already imported under this exact name.
  const existingByName = await prisma.clinicOrganization.findFirst({
    where: { name: { equals: clinicName, mode: 'insensitive' } },
  });
  if (existingByName) return existingByName.id;

  const slug = await uniqueClinicOrganizationSlug(clinicName);
  const created = await prisma.clinicOrganization.create({
    data: { name: clinicName, slug, published: false },
  });
  return created.id;
}

async function insertRow(row: ParsedClinicRow): Promise<void> {
  const organizationId = await resolveOrganizationId(row.clinicName!);
  const organization = await prisma.clinicOrganization.findUniqueOrThrow({ where: { id: organizationId } });
  const slug = await uniqueClinicBranchSlug(organization.slug, row.branchArea ?? row.clinicName!);
  const branch = await prisma.clinicBranch.create({
    data: {
      organizationId,
      branchName: row.clinicName!,
      slug,
      address: row.address,
      area: row.branchArea,
      cityCorporation: row.cityCorporation,
      googleMapUrl: row.googleMapUrl,
      importNotes: row.notes,
      importKey: row.importKey,
      published: false,
    },
  });
  await writeBranchPhonesAndSources(branch.id, row);
}

async function updateRow(branchId: string, row: ParsedClinicRow): Promise<void> {
  await prisma.clinicBranch.update({
    where: { id: branchId },
    data: {
      branchName: row.clinicName!,
      address: row.address,
      area: row.branchArea,
      cityCorporation: row.cityCorporation,
      googleMapUrl: row.googleMapUrl,
      importNotes: row.notes,
    },
  });
  await writeBranchPhonesAndSources(branchId, row);
}

async function writeBranchPhonesAndSources(branchId: string, row: ParsedClinicRow): Promise<void> {
  await prisma.clinicBranchPhone.deleteMany({ where: { branchId } });
  if (row.phones.length > 0) {
    await prisma.clinicBranchPhone.createMany({
      data: row.phones.map((phoneNumber, i) => ({
        branchId,
        phoneNumber,
        isPrimary: phoneNumber === row.primaryPhone,
        sortOrder: i,
      })),
    });
  }

  await prisma.clinicBranchSource.deleteMany({ where: { branchId } });
  if (row.sourceUrls.length > 0) {
    await prisma.clinicBranchSource.createMany({
      data: row.sourceUrls.map((sourceUrl) => ({ branchId, sourceUrl })),
    });
  }
}
