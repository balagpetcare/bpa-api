/**
 * Root admin seeder — run after migrations to ensure a super-admin user exists.
 *
 * Usage:
 *   npm run seed:root-admin
 *
 * Required env vars (add to .env):
 *   ROOT_ADMIN_NAME     — display name
 *   ROOT_ADMIN_EMAIL    — login email
 *   ROOT_ADMIN_PASSWORD — plaintext password (bcrypt-hashed before storage)
 *   ROOT_ADMIN_ROLE     — role name (default: super_admin)
 *
 * The script is fully idempotent: running it multiple times is safe.
 * If the user already exists, their name and password are updated.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = parseInt(process.env['BCRYPT_ROUNDS'] ?? '12', 10);

async function main(): Promise<void> {
  const name     = process.env['ROOT_ADMIN_NAME']     ?? 'BPA Root Admin';
  const email    = (process.env['ROOT_ADMIN_EMAIL']   ?? 'admin@bpa.org').toLowerCase().trim();
  const password = process.env['ROOT_ADMIN_PASSWORD'] ?? '';
  const roleName = (process.env['ROOT_ADMIN_ROLE']    ?? 'super_admin').toLowerCase().trim();

  if (!password) {
    console.error('ROOT_ADMIN_PASSWORD env var is required. Aborting.');
    process.exit(1);
  }

  console.log(`\n── BPA Root Admin Seeder ──────────────────────────────`);
  console.log(`   Name  : ${name}`);
  console.log(`   Email : ${email}`);
  console.log(`   Role  : ${roleName}`);
  console.log(`──────────────────────────────────────────────────────\n`);

  // ── 1. Ensure the role exists ────────────────────────────────────
  let role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    console.log(`Role '${roleName}' not found — creating it.`);
    const allPermissions = await prisma.permission.findMany();
    role = await prisma.role.create({
      data: {
        name: roleName,
        description: roleName === 'super_admin' ? 'Full system access' : `${roleName} role`,
        rolePermissions: {
          create: allPermissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    console.log(`Role '${roleName}' created with ${role ? 'success' : 'error'}.`);
  } else {
    console.log(`Role '${roleName}' already exists.`);
  }

  // ── 2. Hash the password ─────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // ── 3. Upsert the user ───────────────────────────────────────────
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

  console.log(`User ${user.email} upserted (id: ${user.id}).`);

  // ── 4. Ensure the user–role link exists ──────────────────────────
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`\n✓ Root admin ready.`);
  console.log(`  Email    : ${email}`);
  console.log(`  Password : (as supplied in ROOT_ADMIN_PASSWORD)`);
  console.log(`  Role     : ${roleName}\n`);
}

main()
  .catch((e) => {
    console.error('Seeder failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
