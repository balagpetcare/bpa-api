import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { config } from '../../config';

const ALGORITHM = 'aes-256-cbc';
const SECRET = config.MAIL_CREDENTIAL_SECRET || 'bpa_mail_secret_key_32_bytes_long_!!!';

// Ensure SECRET produces exactly a 32-byte key
const hashKey = crypto.createHash('sha256').update(SECRET).digest();

export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, hashKey, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptPassword(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted password format');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, hashKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface MailServerConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export function resolveMailServerConfig(account: {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean | null;
}): MailServerConfig {
  return {
    smtpHost: account.smtpHost ?? config.DEFAULT_SMTP_HOST,
    smtpPort: account.smtpPort ?? config.DEFAULT_SMTP_PORT,
    smtpSecure: account.smtpSecure ?? config.DEFAULT_SMTP_SECURE,
    imapHost: account.imapHost ?? config.DEFAULT_IMAP_HOST,
    imapPort: account.imapPort ?? config.DEFAULT_IMAP_PORT,
    imapSecure: account.imapSecure ?? config.DEFAULT_IMAP_SECURE,
  };
}

const MAIL_ACCOUNT_SELECT = {
  id: true,
  displayName: true,
  emailAddress: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  imapHost: true,
  imapPort: true,
  imapSecure: true,
  username: true,
  fromName: true,
  status: true,
  isDefault: true,
  sortOrder: true,
  smtpLastStatus: true,
  smtpLastCheckedAt: true,
  imapLastStatus: true,
  imapLastCheckedAt: true,
  lastSyncAt: true,
  lastSyncUid: true,
  createdAt: true,
  updatedAt: true,
};

export async function createMailAccount(data: any) {
  const existing = await prisma.mailAccount.findUnique({
    where: { emailAddress: data.emailAddress },
  });
  if (existing) {
    throw AppError.conflict('A mail account with this email address already exists');
  }

  const encryptedPassword = data.password ? encryptPassword(data.password) : null;
  const { password: _, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.mailAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.mailAccount.create({
      data: {
        ...rest,
        encryptedPassword,
      },
      select: MAIL_ACCOUNT_SELECT,
    });
  });
}

export async function updateMailAccount(id: string, data: any) {
  const account = await prisma.mailAccount.findUnique({ where: { id } });
  if (!account) {
    throw AppError.notFound('Mail account');
  }

  if (data.emailAddress && data.emailAddress !== account.emailAddress) {
    const conflict = await prisma.mailAccount.findUnique({
      where: { emailAddress: data.emailAddress },
    });
    if (conflict) {
      throw AppError.conflict('Email address already in use');
    }
  }

  const updateData: any = { ...data };
  if (data.password) {
    updateData.encryptedPassword = encryptPassword(data.password);
  }
  delete updateData.password;

  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.mailAccount.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return tx.mailAccount.update({
      where: { id },
      data: updateData,
      select: MAIL_ACCOUNT_SELECT,
    });
  });
}

export async function listMailAccounts() {
  return prisma.mailAccount.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: MAIL_ACCOUNT_SELECT,
  });
}

export async function getMailAccount(id: string) {
  const account = await prisma.mailAccount.findFirst({
    where: { id, deletedAt: null },
    select: MAIL_ACCOUNT_SELECT,
  });

  if (!account) {
    throw AppError.notFound('Mail account');
  }

  return account;
}

export async function deleteMailAccount(id: string) {
  const account = await prisma.mailAccount.findFirst({ where: { id, deletedAt: null } });
  if (!account) {
    throw AppError.notFound('Mail account');
  }
  
  // Soft delete as schema has deletedAt nullable field
  return prisma.mailAccount.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function testSmtpConnection(id: string): Promise<{ success: boolean; message: string }> {
  const account = await prisma.mailAccount.findUnique({ where: { id } });
  if (!account) {
    throw AppError.notFound('Mail account');
  }

  if (!account.encryptedPassword) {
    return { success: false, message: 'SMTP verification failed: Mail account has no password set.' };
  }

  const password = decryptPassword(account.encryptedPassword);
  const resolved = resolveMailServerConfig(account);

  const transporter = nodemailer.createTransport({
    host: resolved.smtpHost,
    port: resolved.smtpPort,
    secure: resolved.smtpSecure,
    auth: {
      user: account.username,
      pass: password,
    },
    connectTimeout: 5000,
  } as any);

  try {
    await transporter.verify();
    await prisma.mailAccount.update({
      where: { id },
      data: {
        smtpLastStatus: 'success',
        smtpLastCheckedAt: new Date(),
      },
    });
    return { success: true, message: 'SMTP connection verified successfully.' };
  } catch (err: any) {
    await prisma.mailAccount.update({
      where: { id },
      data: {
        smtpLastStatus: 'failed',
        smtpLastCheckedAt: new Date(),
      },
    });
    return { success: false, message: `SMTP verification failed: ${err.message}` };
  }
}

export async function testImapConnection(id: string): Promise<{ success: boolean; message: string }> {
  const account = await prisma.mailAccount.findUnique({ where: { id } });
  if (!account) {
    throw AppError.notFound('Mail account');
  }

  if (!account.encryptedPassword) {
    return { success: false, message: 'IMAP verification failed: Mail account has no password set.' };
  }

  const password = decryptPassword(account.encryptedPassword);
  const resolved = resolveMailServerConfig(account);

  const client = new ImapFlow({
    host: resolved.imapHost,
    port: resolved.imapPort,
    secure: resolved.imapSecure,
    auth: {
      user: account.username,
      pass: password,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
  });

  try {
    await client.connect();
    await client.logout();
    await prisma.mailAccount.update({
      where: { id },
      data: {
        imapLastStatus: 'success',
        imapLastCheckedAt: new Date(),
      },
    });
    return { success: true, message: 'IMAP connection verified successfully.' };
  } catch (err: any) {
    await prisma.mailAccount.update({
      where: { id },
      data: {
        imapLastStatus: 'failed',
        imapLastCheckedAt: new Date(),
      },
    });
    return { success: false, message: `IMAP verification failed: ${err.message}` };
  }
}
