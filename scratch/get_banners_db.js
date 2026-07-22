const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const banners = await prisma.appBanner.findMany();
  console.log("AppBanners:", banners);
}
main().finally(() => prisma.$disconnect());
