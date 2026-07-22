import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const colRes = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'memberships';
  `);
  console.log("Schema Columns:", colRes);

  const dataRes = await prisma.$queryRawUnsafe(`
    SELECT 
      id::text, 
      user_id::text, 
      member_id::text,
      membership_campaign_id::text,
      application_id::text,
      membership_number::text,
      plan_id::text
    FROM memberships;
  `);
  console.log("Raw Memberships Data:");
  console.log(dataRes);
}

main().catch(console.error).finally(() => prisma.$disconnect());
