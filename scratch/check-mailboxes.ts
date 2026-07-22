import { prisma } from '../src/database/prisma';

async function main() {
  console.log('Fetching mail accounts from database...');
  const accounts = await prisma.mailAccount.findMany();
  console.log(`Found ${accounts.length} accounts:`);
  for (const acc of accounts) {
    console.log(`- ID: ${acc.id}`);
    console.log(`  Name: ${acc.name}`);
    console.log(`  Email: ${acc.emailAddress}`);
    console.log(`  Status: ${acc.status}`);
    console.log(`  Default: ${acc.isDefault}`);
    console.log(`  Encrypted Password: ${acc.encryptedPassword}`);
  }
}

main().catch(console.error);
