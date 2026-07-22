const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@127.0.0.1:5432/bpa_db?schema=public' } } });
prisma.$connect().then(() => { console.log('Connected 5432 with postgres'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
