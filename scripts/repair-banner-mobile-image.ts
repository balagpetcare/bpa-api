/**
 * One-off, idempotent data repair for AppBanner rows whose mobileImageUrl
 * is still stale seed/demo placeholder content (see
 * prisma/seed/app-control.seed.ts) left over from before the Admin form
 * had a real Mobile Banner Image control. Never touches title, subtitle,
 * description, destination, schedule, status, isActive, or sortOrder.
 *
 * Safe to re-run: a banner is only modified if its mobileImageUrl still
 * matches a known seed-placeholder host AND its imageUrl is a real
 * (non-placeholder) value to fall back to. Once repaired, mobileImageUrl is
 * null, so re-running finds nothing left to change for that row. Never
 * overwrites a real, admin-chosen mobile image the same way it never
 * touches any other admin-authored field.
 *
 * Usage: npx ts-node -r dotenv/config scripts/repair-banner-mobile-image.ts
 */
import { prisma } from '../src/database/prisma';

const TARGET_BANNER_IDS = [
  '10000000-0000-0000-0000-000000000401',
  '10000000-0000-0000-0000-000000000402',
];

const KNOWN_SEED_PLACEHOLDER_HOSTS = new Set([
  'placehold.co',
  'via.placeholder.com',
  'dummyimage.com',
  'placehold.jp',
  'fakeimg.pl',
]);

function isKnownSeedPlaceholderUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return KNOWN_SEED_PLACEHOLDER_HOSTS.has(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

async function main() {
  console.log(`[repair-banner-mobile-image] Starting for ${TARGET_BANNER_IDS.length} target banner(s)`);

  for (const id of TARGET_BANNER_IDS) {
    const before = await prisma.appBanner.findUnique({ where: { id } });
    if (!before) {
      console.log(`[repair-banner-mobile-image] ${id}: not found, skipping`);
      continue;
    }

    console.log(`[repair-banner-mobile-image] ${id} ("${before.title}") — before:`);
    console.log(`  imageUrl       = ${before.imageUrl}`);
    console.log(`  mobileImageUrl = ${before.mobileImageUrl}`);

    const shouldClear = isKnownSeedPlaceholderUrl(before.mobileImageUrl) && !isKnownSeedPlaceholderUrl(before.imageUrl);

    if (!shouldClear) {
      console.log(`[repair-banner-mobile-image] ${id}: no change needed (already repaired, or mobileImageUrl is real content)`);
      continue;
    }

    const after = await prisma.appBanner.update({
      where: { id },
      data: { mobileImageUrl: null },
    });

    console.log(`[repair-banner-mobile-image] ${id}: cleared stale seed mobileImageUrl — after:`);
    console.log(`  imageUrl       = ${after.imageUrl}`);
    console.log(`  mobileImageUrl = ${after.mobileImageUrl}`);
  }

  console.log('[repair-banner-mobile-image] Done');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[repair-banner-mobile-image] Failed:', err);
  process.exit(1);
});
