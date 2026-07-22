const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.$queryRawUnsafe(`SELECT * FROM "users" WHERE central_auth_user_id = 'cmrcla6qk0017gg8osmkw6z08'`);
  console.log(users);
}
main().catch(console.error).finally(() => prisma.$disconnect());
