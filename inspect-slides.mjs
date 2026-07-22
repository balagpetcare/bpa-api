import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const slides = await prisma.heroSlide.findMany({
  include: { desktopImage: true, mobileImage: true, video: true },
});
console.log(JSON.stringify(slides, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
await prisma.$disconnect();
