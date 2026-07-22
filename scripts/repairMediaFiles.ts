/**
 * One-time repair pass over existing MediaFile records: detects missing,
 * corrupted, mismatched, or unsupported files and (in repair mode) fixes
 * whatever can be safely fixed by re-running the centralized
 * `processImageUpload` pipeline (src/utils/imagePipeline.ts) on the
 * existing bytes.
 *
 * Safety:
 * - Dry-run by default. Pass --repair to actually write changes.
 * - Every file that gets rewritten has its original bytes backed up first
 *   (to <uploadsDir>/_media_repair_backups/<objectKey>.bak) — originals
 *   are never deleted.
 * - Idempotent: a record whose current bytes already validate and decode
 *   cleanly under its recorded mimeType is reported VALID and left alone,
 *   so re-running this script is always safe.
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/repairMediaFiles.ts            # dry run
 *   npx ts-node -r dotenv/config scripts/repairMediaFiles.ts --repair   # apply fixes
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { validateUploadBuffer, getFileCategory, isSvg } from '../src/utils/fileType';
import { ImageProcessingError, processImageUpload } from '../src/utils/imagePipeline';
import { downloadFromStorage, verifyFileExists, getPublicUrl } from '../src/storage/storage.service';

const prisma = new PrismaClient();

const REPAIR = process.argv.includes('--repair');
const BACKUP_DIR = path.join(process.cwd(), 'uploads', '_media_repair_backups');

type Outcome = 'valid' | 'repaired' | 'missing' | 'corrupted' | 'skipped' | 'failed';

interface RecordResult {
  id: string;
  filename: string;
  outcome: Outcome;
  detail: string;
}

function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupOriginal(objectKey: string, bytes: Buffer): void {
  ensureBackupDir();
  const dest = path.join(BACKUP_DIR, `${objectKey}.bak`);
  if (fs.existsSync(dest)) return; // already backed up by a prior run — never overwrite
  fs.writeFileSync(dest, bytes);
}

async function repairOneImage(
  id: string,
  filename: string,
  originalMimeType: string,
  bytes: Buffer,
): Promise<RecordResult> {
  try {
    // A record is genuinely broken only when its bytes fail signature
    // validation against the claimed extension/MIME (mislabeled/corrupt),
    // OR sharp cannot fully decode them (truncated/malformed). A file that
    // is a perfectly valid, correctly-labeled PNG is NOT "repaired" just
    // because the *new* pipeline would now prefer JPEG output for opaque
    // images going forward — that's a forward-looking upload-time
    // preference, not a defect in the existing file, and reformatting it
    // would break every existing URL/reference to it for no reason (see
    // "preserve backward compatibility with existing media URLs").
    const signatureCheck = validateUploadBuffer(bytes, filename);
    let decodeOk = true;
    let decodedWidth = 0;
    let decodedHeight = 0;
    try {
      const meta = await sharp(bytes, { failOn: 'error' }).metadata();
      decodedWidth = meta.width ?? 0;
      decodedHeight = meta.height ?? 0;
      await sharp(bytes, { failOn: 'error' }).raw().toBuffer();
    } catch {
      decodeOk = false;
    }

    if (signatureCheck.ok && decodeOk) {
      return { id, filename, outcome: 'valid', detail: `${decodedWidth}x${decodedHeight} ${originalMimeType}` };
    }

    const reason = !signatureCheck.ok ? signatureCheck.reason! : 'sharp could not fully decode pixel data';

    if (!REPAIR) {
      return { id, filename, outcome: 'corrupted', detail: reason };
    }

    // Confirmed broken and repair mode is on: regenerate through the
    // normalization pipeline (this call also acts as the final
    // decodability check — it throws ImageProcessingError if the bytes
    // truly can't be salvaged).
    const processed = await processImageUpload(bytes);

    backupOriginal(filename, bytes);

    const baseName = filename.replace(/\.[^./\\]+$/, '');
    const newFilename = `${baseName}.${processed.extension}`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    fs.writeFileSync(path.join(uploadsDir, newFilename), processed.buffer);
    // Old object key stays on disk (already backed up above too) — never
    // deleted, per "never delete originals without backup".

    await prisma.mediaFile.update({
      where: { id },
      data: {
        filename: newFilename,
        mimeType: processed.mimeType,
        sizeBytes: BigInt(processed.sizeBytes),
        url: getPublicUrl(newFilename),
      },
    });

    return {
      id,
      filename: newFilename,
      outcome: 'repaired',
      detail: `${originalMimeType} -> ${processed.mimeType}, ${processed.width}x${processed.height}, backup=${filename}.bak`,
    };
  } catch (e) {
    const reason = e instanceof ImageProcessingError ? e.message : e instanceof Error ? e.message : String(e);
    return { id, filename, outcome: 'failed', detail: reason };
  }
}

async function main(): Promise<void> {
  console.log(`[repairMediaFiles] mode=${REPAIR ? 'REPAIR' : 'DRY-RUN'}`);

  const records = await prisma.mediaFile.findMany({
    select: { id: true, filename: true, mimeType: true, originalName: true },
  });

  const results: RecordResult[] = [];

  for (const record of records) {
    const category = getFileCategory(record.mimeType, record.originalName || record.filename);

    if (!verifyFileExists(record.filename)) {
      results.push({ id: record.id, filename: record.filename, outcome: 'missing', detail: 'physical file not found' });
      continue;
    }

    if (category !== 'image' || isSvg(record.mimeType, record.originalName || record.filename)) {
      // Non-raster or vector: outside this pass's scope (nothing in the
      // pipeline re-encodes SVG/video/document/archive content).
      results.push({ id: record.id, filename: record.filename, outcome: 'skipped', detail: `category=${category}` });
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = await downloadFromStorage(record.filename);
    } catch (e) {
      results.push({
        id: record.id,
        filename: record.filename,
        outcome: 'failed',
        detail: `download failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    if (bytes.length === 0) {
      results.push({ id: record.id, filename: record.filename, outcome: 'corrupted', detail: 'zero-byte file' });
      continue;
    }

    results.push(await repairOneImage(record.id, record.filename, record.mimeType, bytes));
  }

  const summary = results.reduce<Record<Outcome, number>>(
    (acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    },
    { valid: 0, repaired: 0, missing: 0, corrupted: 0, skipped: 0, failed: 0 },
  );

  console.log('\n--- Records needing attention ---');
  for (const r of results) {
    if (r.outcome === 'valid' || r.outcome === 'skipped') continue;
    console.log(`[${r.outcome.toUpperCase()}] ${r.id} ${r.filename} — ${r.detail}`);
  }

  console.log('\n--- Summary ---');
  console.log(`scanned:   ${results.length}`);
  console.log(`valid:     ${summary.valid}`);
  console.log(`repaired:  ${summary.repaired}`);
  console.log(`missing:   ${summary.missing}`);
  console.log(`corrupted: ${summary.corrupted}`);
  console.log(`skipped:   ${summary.skipped}`);
  console.log(`failed:    ${summary.failed}`);

  if (!REPAIR && summary.corrupted > 0) {
    console.log('\nThis was a dry run. Re-run with --repair to apply the fixes listed above.');
  }
}

main()
  .catch((e) => {
    console.error('[repairMediaFiles] fatal error', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
