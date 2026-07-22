import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    await prisma.appBanner.updateMany({
        where: { id: '5998143d-dc7f-4a7b-91d7-324550af7511' },
        data: { status: 'published' }
    });
    console.log('Banner published!');
}
main().catch(console.error).finally(() => prisma.$disconnect());
