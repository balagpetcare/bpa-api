const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.$queryRawUnsafe(`SELECT * FROM "users" WHERE id = '26d5404b-941a-45d4-82a1-5bd2525f1ffe'`);
  console.log(users);
}
main().catch(console.error).finally(() => prisma.$disconnect());
