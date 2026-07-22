import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { seedVideoCategories } from './seed/video-categories.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('============================================================');
  console.log(' BPA Video Category Seeder');
  console.log('============================================================');

  const result = await seedVideoCategories(prisma);

  console.log(` Attempted           : ${result.attempted}`);
  console.log(` Inserted or updated : ${result.insertedOrUpdated}`);
  console.log(` Matching seeded set : ${result.totalMatching}/${result.attempted}`);
  console.log(` Unique slugs        : ${result.uniqueSlugs}/${result.attempted}`);
  console.log(` Missing slugs       : ${result.missingSlugs.join(',') || 'none'}`);
  console.log(` Duplicate slugs     : ${result.duplicateSlugs.join(',') || 'none'}`);

  for (const category of result.categories) {
    console.log(`  - ${category.slug} :: ${category.nameEn} / ${category.nameBn}`);
  }
}

main()
  .catch((error) => {
    console.error('[VIDEO CATEGORY SEED FAILED]', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
