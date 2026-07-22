import { prisma } from '../../database/prisma';
import { hashPassword, verifyPassword } from '../../utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getAccessTokenExpiryDate,
  getRefreshTokenExpiryDate,
} from '../../utils/jwt';
import { AppError } from '../../utils/AppError';
import { ERROR_CODES } from '../../config/constants';
import { AuthPayload } from '../../types';
import {
  LoginDto,
  AuthResponse,
  MeResponse,
  RegisterDto,
  RequestOtpDto,
  VerifyOtpDto,
  ChangePasswordDto,
} from './auth.types';
import { config } from '../../config';
import * as smsService from '../../services/sms.service';
import * as emailService from '../../services/email.service';
import crypto from 'crypto';

const MAX_FAILED_ATTEMPTS = 10;
// ... (rest of the file until verifyOtp)
export async function forgotPassword(dto: { email: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) return; // Always return generic success

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  const resetLink = `${config.AUTH_PUBLIC_WEB_URL}/auth/reset-password?token=${token}`;
  await emailService.sendPasswordResetEmail(user.email!, resetLink);
}

export async function resetPassword(dto: { token: string; password: string }): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, consumedAt: null },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    throw AppError.badRequest('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(dto.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { consumedAt: new Date() },
    }),
  ]);
}
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function login(dto: LoginDto): Promise<AuthResponse> {
  const user = await prisma.user.findFirst({
    where: { email: dto.email, deletedAt: null },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    throw AppError.unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw AppError.unauthorized(
      `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }

  if (!user.passwordHash) {
    throw AppError.unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
  }

  const valid = await verifyPassword(dto.password, user.passwordHash);

  if (!valid) {
    const newAttempts = user.failedLoginAttempts + 1;
    const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });

    if (shouldLock) {
      throw AppError.unauthorized(
        'Account locked for 30 minutes after too many failed login attempts.',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    throw AppError.unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // Successful login — reset lockout state
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  return issueTokenPair(user);
}

export async function register(dto: RegisterDto): Promise<AuthResponse> {
  if (dto.email) {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw AppError.badRequest('Email already registered');
  }

  if (dto.phone) {
    const normalizedPhone = normalizePhone(dto.phone);
    const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existing) throw AppError.badRequest('Phone number already registered');
  }

  const passwordHash = await hashPassword(dto.password);

  const user = await prisma.user.create({
    data: {
      name: dto.name,
      email: dto.email || null,
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      passwordHash,
      role: 'USER',
    },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (user.email) {
    await sendVerificationEmail(user);
  }

  return issueTokenPair(user as any);
}

export async function sendVerificationEmail(user: { id: string; email: string | null }): Promise<void> {
  if (!user.email) return;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  const verifyLink = `${config.AUTH_PUBLIC_WEB_URL}/auth/email-verified?token=${token}`;
  
  if (config.NODE_ENV === 'production' || config.EMAIL_HOST) {
    await emailService.sendEmail({
      to: user.email!,
      template: 'GENERAL_NOTIFICATION',
      data: {
        title: 'Verify your email address',
        message: 'Thank you for signing up with Bangladesh Pet Association. Please click the button below to verify your email address. This link expires in 24 hours.',
        actionText: 'Verify Email',
        actionUrl: verifyLink,
      },
    });
  } else {
    console.log(`[DEV] Verification link for ${user.email}: ${verifyLink}`);
  }
}

export async function resendVerification(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) return; // Always return generic success

  await sendVerificationEmail(user);
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const verifyToken = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, consumedAt: null },
  });

  if (!verifyToken || verifyToken.expiresAt < new Date()) {
    throw AppError.badRequest('Invalid or expired verification token');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verifyToken.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: verifyToken.id },
      data: { consumedAt: new Date() },
    }),
  ]);
}

export async function requestOtp(dto: RequestOtpDto): Promise<{ success: boolean; devOtp?: string }> {
  const normalizedPhone = normalizePhone(dto.phone);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await hashPassword(otp);

  await prisma.otpCode.create({
    data: {
      phone: normalizedPhone,
      otpHash,
      expiresAt: new Date(Date.now() + config.OTP_EXPIRY_MINUTES * 60_000),
    },
  });

  if (config.NODE_ENV === 'production') {
    await smsService.sendSms({
      to: normalizedPhone,
      message: `Your BPA login OTP is ${otp}. Valid for ${config.OTP_EXPIRY_MINUTES} minutes.`,
    });
    return { success: true };
  } else {
    // In development/test, return OTP in response for easier testing
    return { success: true, devOtp: otp };
  }
}

export async function verifyOtp(dto: VerifyOtpDto): Promise<AuthResponse> {
  const normalizedPhone = normalizePhone(dto.phone);
  const latestOtp = await prisma.otpCode.findFirst({
    where: { phone: normalizedPhone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestOtp || latestOtp.expiresAt < new Date()) {
    throw AppError.badRequest('Invalid or expired OTP');
  }

  if (latestOtp.attempts >= config.OTP_MAX_ATTEMPTS) {
    throw AppError.badRequest('Too many failed attempts');
  }

  const valid = await verifyPassword(dto.otp, latestOtp.otpHash);

  if (!valid) {
    await prisma.otpCode.update({
      where: { id: latestOtp.id },
      data: { attempts: { increment: 1 } },
    });
    throw AppError.badRequest('Invalid OTP');
  }

  await prisma.otpCode.update({
    where: { id: latestOtp.id },
    data: { consumedAt: new Date() },
  });

  let user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: `User ${normalizedPhone.slice(-4)}`,
        phone: normalizedPhone,
        role: 'USER',
        phoneVerifiedAt: new Date(),
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    }) as any;
  }

  return issueTokenPair(user as any);
}

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('880')) cleaned = '880' + cleaned;
  return cleaned;
}

export async function refresh(rawToken: string): Promise<AuthResponse> {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw AppError.unauthorized('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
  }

  const stored = await prisma.refreshToken.findFirst({
    where: { token: rawToken, revokedAt: null },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expired or revoked', ERROR_CODES.TOKEN_INVALID);
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, isActive: true },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw AppError.unauthorized('User not found', ERROR_CODES.UNAUTHORIZED);
  }

  return issueTokenPair(user);
}

export async function changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw AppError.notFound('User');

  if (!user.passwordHash) {
    throw AppError.badRequest('No password set on this account. Use "Forgot Password" to set one.');
  }

  const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
  if (!valid) throw AppError.badRequest('Current password is incorrect.');

  const newHash = await hashPassword(dto.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
}

export async function logout(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token: rawToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) throw AppError.notFound('User');

  return formatMeResponse(user);
}

// ─── Helpers ────────────────────────────────────────────

export type UserWithRoles = Awaited<ReturnType<typeof prisma.user.findFirst>> & {
  userRoles: Array<{
    role: {
      name: string;
      rolePermissions: Array<{ permission: { resource: string; action: string } }>;
    };
  }>;
};

export async function issueTokenPair(user: NonNullable<UserWithRoles>): Promise<AuthResponse> {
  const roles = user.userRoles.map((ur) => ur.role.name);
  const accessPayload: AuthPayload = {
    sub: user.id,
    email: user.email || undefined,
    roles,
  };

  const accessToken = signAccessToken(accessPayload);
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return {
    user: formatMeResponse(user),
    accessToken,
    refreshToken,
    accessTokenExpires: getAccessTokenExpiryDate().getTime(),
  };
}

export function formatMeResponse(user: NonNullable<UserWithRoles>): MeResponse {
  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((ur) =>
        ur.role.rolePermissions.map(
          (rp) => `${rp.permission.resource}:${rp.permission.action}`,
        ),
      ),
    ),
  ];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    roles,
    permissions,
  };
}
