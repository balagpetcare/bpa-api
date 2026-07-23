import 'dotenv/config';
import { prisma } from '../database/prisma';
import { verifyFileExists } from '../storage/storage.service';
import { isLocallyManagedUrl } from '../modules/media/media.service';

// Read-only diagnostic: reports MediaFile rows whose underlying file is not
// present in the currently configured storage backend. Never deletes or
// modifies any row — always dry-run. Pass --json for machine-readable
// output; otherwise prints a human-readable summary.
//
// Records whose `url` already points at a genuine external host (e.g. a
// seed/demo record referencing placehold.co or images.unsplash.com) were
// never uploaded to our own storage at all — they're reported separately
// as "externally hosted" rather than lumped in with genuinely missing
// local/managed uploads, which is what the API itself does too (see
// isLocallyManagedUrl / format() in media.service.ts).
//
// Usage: npm run media:reconcile [-- --json]

async function main() {
  const asJson = process.argv.includes('--json');

  const rows = await prisma.mediaFile.findMany({
    select: { id: true, filename: true, originalName: true, mimeType: true, sizeBytes: true, url: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const managed = rows.filter((r) => isLocallyManagedUrl(r.url));
  const external = rows.filter((r) => !isLocallyManagedUrl(r.url));
  const missing = managed.filter((r) => !verifyFileExists(r.filename));
  const present = managed.length - missing.length;

  if (asJson) {
    console.log(JSON.stringify({
      totalRecords: rows.length,
      managedByLocalStorage: managed.length,
      externallyHostedCount: external.length,
      presentCount: present,
      missingCount: missing.length,
      missingRecords: missing.map((r) => ({
        id: r.id,
        filename: r.filename,
        originalName: r.originalName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
      externallyHostedRecords: external.map((r) => ({
        id: r.id,
        originalName: r.originalName,
        url: r.url,
      })),
    }, null, 2));
    return;
  }

  console.log('=== Media storage reconciliation (dry-run, read-only) ===');
  console.log(`Total media records:        ${rows.length}`);
  console.log(`Externally hosted (not ours): ${external.length}`);
  console.log(`Managed by local storage:   ${managed.length}`);
  console.log(`  Present on disk:          ${present}`);
  console.log(`  Missing from disk:        ${missing.length}`);
  if (missing.length > 0) {
    console.log('\nMissing records (genuinely absent from local storage):');
    for (const r of missing) {
      console.log(`  - ${r.id}  ${r.filename}  (${r.originalName}, ${r.mimeType}, created ${r.createdAt.toISOString()})`);
    }
    console.log('\nNo rows were modified or deleted. This script is read-only by design.');
    console.log('To resolve: restore the original files into the configured storage location,');
    console.log('or have an operator re-upload replacements through the existing upload flow.');
  }
  if (external.length > 0) {
    console.log('\nExternally hosted records (not managed by this server, not counted as missing):');
    for (const r of external) {
      console.log(`  - ${r.id}  ${r.originalName}  -> ${r.url}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Reconciliation failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
