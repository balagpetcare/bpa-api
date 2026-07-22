const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const c = await prisma.campaign.findFirst({
    where: { slug: 'cat-vaccination-dhaka-2026' },
    include: { coverImage: true }
  });
  console.log("Campaign:", c);
}
main().finally(() => prisma.$disconnect());
