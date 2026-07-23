import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { seedVideoContent } from './seed/video-content.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('============================================================');
  console.log(' BPA Sample Video Content Seeder');
  console.log('============================================================');

  const result = await seedVideoContent(prisma);

  if (result.skipped) {
    console.log(` Skipped             : ${result.reason}`);
    return;
  }

  console.log(` Attempted           : ${result.attempted}`);
  console.log(` Upserted            : ${result.upserted}`);
  console.log(` Published samples   : ${result.published}`);
  console.log(` Draft samples       : ${result.draft}`);
}

main()
  .catch((error) => {
    console.error('[VIDEO CONTENT SEED FAILED]', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
