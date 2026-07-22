import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function seedAdminUser(prisma: PrismaClient) {
  const BCRYPT_ROUNDS = parseInt(process.env['BCRYPT_ROUNDS'] ?? '12', 10);

  // Support both SEED_ADMIN_* (preferred) and ROOT_ADMIN_* (legacy) env vars
  const name = (
    process.env['SEED_ADMIN_NAME'] ??
    process.env['ROOT_ADMIN_NAME'] ??
    'BPA Super Admin'
  ).trim();

  const email = (
    process.env['SEED_ADMIN_EMAIL'] ??
    process.env['ROOT_ADMIN_EMAIL'] ??
    'admin@bpa.org'
  ).toLowerCase().trim();

  const password = (
    process.env['SEED_ADMIN_PASSWORD'] ??
    process.env['ROOT_ADMIN_PASSWORD'] ??
    ''
  );

  const roleName = (
    process.env['SEED_ADMIN_ROLE'] ??
    process.env['ROOT_ADMIN_ROLE'] ??
    'super_admin'
  ).toLowerCase().trim();

  if (!password) {
    console.warn(
      '  [users] WARNING: No SEED_ADMIN_PASSWORD or ROOT_ADMIN_PASSWORD set.' +
      ' Admin user skipped. Set the env var and re-run.',
    );
    return { skipped: true, reason: 'no_password' };
  }

  // Ensure the role exists
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    return { skipped: true, reason: `role_not_found:${roleName}` };
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

  return { email, role: roleName, upserted: true };
}
