const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    'memberships',
    'membership_plans',
    'users',
    'membership_campaigns',
    'membership_applications',
    'membership_covered_pets',
    'membership_service_usages',
    'membership_upgrades',
    'pets',
    'venues',
    'payments'
  ];

  for (const table of tables) {
    const colRes = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1;
    `, table);
    
    const maybeBadCols = colRes.filter(r => r.data_type === 'text' || r.data_type.startsWith('character'));
    if (maybeBadCols.length > 0) {
      const selects = maybeBadCols.map(c => `"${c.column_name}"::text`).join(', ');
      try {
        const dataRes = await prisma.$queryRawUnsafe(`SELECT ${selects} FROM "${table}"`);
        for (const row of dataRes) {
          for (const [k, v] of Object.entries(row)) {
            if (v && typeof v === 'string' && v.startsWith('c') && v.includes('m')) {
              console.log(`Found CUID in ${table}.${k}: ${v}`);
            }
          }
        }
      } catch (e) {
        console.error(`Error querying ${table}: ${e.message}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
