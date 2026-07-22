const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
async function run() {
  const sql = fs.readFileSync('prisma/migrations/20260713000000_make_plan_values_nullable/migration.sql', 'utf8');
  const commands = sql.split(';').filter(c => c.trim().length > 0);
  for (const cmd of commands) {
    console.log('Executing:', cmd);
    await prisma.$executeRawUnsafe(cmd);
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
