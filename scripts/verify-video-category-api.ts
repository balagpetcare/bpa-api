import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { listCategories, listPublicVideoCategories } from '../src/modules/content/content.service';

const prisma = new PrismaClient();

async function main() {
  const adminCategories = await listCategories();
  const publicCategories = await listPublicVideoCategories();
  const now = new Date();

  const realVideoCount = await prisma.contentPost.count({
    where: { type: 'VIDEO' },
  });

  const publishedVideoCount = await prisma.contentPost.count({
    where: {
      type: 'VIDEO',
      status: 'published',
      OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
    },
  });

  const visiblePublicCategoryCount = publicCategories.length;

  console.log(
    JSON.stringify({
      adminCategoryCount: adminCategories.length,
      publicCategoryCount: visiblePublicCategoryCount,
      realVideoCount,
      publishedVideoCount,
      publicCategorySlugs: publicCategories.map((item) => item.slug).sort(),
    }),
  );

  if (process.env.VERIFY_EXPECT_PUBLIC_CATEGORIES === 'true' && visiblePublicCategoryCount === 0) {
    throw new Error('Expected at least one public video category, but none were returned');
  }
}

main()
  .catch((error) => {
    console.error('[VIDEO CATEGORY API VERIFY FAILED]', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
