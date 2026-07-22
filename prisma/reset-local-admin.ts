/**
 * Local/dev-only admin password reset helper.
 *
 * This script updates exactly one legacy BPA admin user and ensures the
 * requested role exists and is attached. It must not be used in production
 * unless NODE_ENV is explicitly set for a local/dev environment.
 *
 * Usage:
 *   LOCAL_ADMIN_EMAIL=admin@bangladeshpetassociation.com \
 *   LOCAL_ADMIN_PASSWORD='...' \
 *   npm run reset:local-admin
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const nodeEnv = (process.env['NODE_ENV'] ?? '').toLowerCase();
if (nodeEnv === 'production') {
  console.error('Refusing to run local admin reset in production.');
  process.exit(1);
}

const email = (process.env['LOCAL_ADMIN_EMAIL'] ?? 'admin@bangladeshpetassociation.com').toLowerCase().trim();
const password = process.env['LOCAL_ADMIN_PASSWORD'] ?? '';
const name = (process.env['LOCAL_ADMIN_NAME'] ?? 'BPA Super Admin').trim();
const roleName = (process.env['LOCAL_ADMIN_ROLE'] ?? 'super_admin').toLowerCase().trim();
const BCRYPT_ROUNDS = parseInt(process.env['BCRYPT_ROUNDS'] ?? '12', 10);

async function main(): Promise<void> {
  if (!password) {
    console.error('LOCAL_ADMIN_PASSWORD env var is required.');
    process.exit(1);
  }

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    throw new Error(`Role not found: ${roleName}`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name,
      email,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`Local admin reset complete for ${email}.`);
  console.log(`Role ensured: ${roleName}`);
}

main()
  .catch((error) => {
    console.error('Local admin reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
