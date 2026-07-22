const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const fileName = '911e5748-246e-487c-9442-a3acd5cdd7ca.jpg';
  
  const files = await prisma.mediaFile.findMany({
    where: {
      id: fileName.split('.')[0]
    }
  });
  console.log("Media files:", files);
}
main().finally(() => prisma.$disconnect());
