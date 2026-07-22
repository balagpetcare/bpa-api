import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const b = await prisma.appBanner.findUnique({
        where: { id: '5998143d-dc7f-4a7b-91d7-324550af7511' }
    });
    console.log(b);
}
main().catch(console.error).finally(() => prisma.$disconnect());
