import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../database/prisma';
import { importClinicDirectory } from '../modules/clinics/clinic-import.service';

// One-off / repeatable CLI runner for the clinic directory Excel importer.
// Always a dry-run preview unless --commit is passed, and idempotent when
// re-run against the same workbook (matches existing branches by their
// stable importKey rather than duplicating them).
//
// Usage:
//   npm run clinics:import -- "<path-to-workbook.xlsx>"            (preview)
//   npm run clinics:import -- "<path-to-workbook.xlsx>" --commit    (write)

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const filePath = args.find((a) => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: npm run clinics:import -- "<path-to-workbook.xlsx>" [--commit]');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const report = await importClinicDirectory(buffer, { commit });

  console.log(`\nClinic directory import — ${commit ? 'COMMIT' : 'DRY RUN (preview only)'}`);
  console.log(`Source: ${filePath}`);
  console.log(`Total rows:  ${report.totalRows}`);
  console.log(`  Inserted:  ${report.inserted}`);
  console.log(`  Updated:   ${report.updated}`);
  console.log(`  Unchanged: ${report.unchanged}`);
  console.log(`  Skipped:   ${report.skipped}`);
  console.log(`  Invalid:   ${report.invalid}`);

  const problems = report.rows.filter((r) => r.status === 'invalid' || r.status === 'skipped');
  if (problems.length > 0) {
    console.log('\nRows needing attention:');
    for (const r of problems) {
      console.log(`  Row ${r.rowNumber} [${r.status}] "${r.clinicName ?? '(no name)'}" ${r.branchArea ?? ''} — ${r.reason ?? ''}`);
    }
  }

  if (!commit) {
    console.log('\nThis was a preview only — no data was written. Re-run with --commit to apply.');
  }
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
