import { PrismaClient } from '@prisma/client';
import { listMyMemberships } from './src/modules/membership-campaign/membership-campaign.service';

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await listMyMemberships('cmrcla6qk0017gg8osmkw6z08'); // CUID
    console.log("Result:", result);
  } catch (err) {
    console.error("Error with CUID:", err);
  }
}
main().finally(() => prisma.$disconnect());
