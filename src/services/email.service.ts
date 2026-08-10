import nodemailer from 'nodemailer';
import { config } from '../config';
import { EmailTemplateRegistry } from '../modules/emails/email-template.registry';

export interface EmailOptions {
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  template?: keyof typeof EmailTemplateRegistry;
  data?: any;
  locale?: 'en' | 'bn';
  layoutKey?: string;
}

export type EmailSendResult =
  | { ok: true; provider: 'smtp'; providerMessageId: string }
  | { ok: false; provider: 'smtp'; disabled: true; error: 'EMAIL_DISABLED' }
  | { ok: false; provider: 'smtp'; disabled?: false; error: string };

function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((value) => value.trim()).filter(Boolean);
}

function resolveRenderedContent(options: EmailOptions): { subject: string; html: string; text: string } {
  if (!options.template) {
    return {
      subject: options.subject?.trim() || '(no subject)',
      html: options.html ?? '',
      text: options.text ?? '',
    };
  }

  const templateFn = EmailTemplateRegistry[options.template];
  if (!templateFn) {
    throw new Error(`Email template ${options.template} not found in registry.`);
  }

  const rendered = templateFn(options.data ?? {});
  return {
    subject: options.subject?.trim() || rendered.subject || '(no subject)',
    html: options.html ?? rendered.bodyHtml ?? '',
    text: options.text ?? rendered.plainText ?? '',
  };
}

function smtpConfigured(): boolean {
  return Boolean(config.EMAIL_HOST && config.EMAIL_USER && config.EMAIL_PASS && config.EMAIL_FROM);
}

export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const recipients = normalizeRecipients(options.to);
  if (recipients.length === 0) {
    return { ok: false, provider: 'smtp', error: 'NO_RECIPIENT' };
  }

  const rendered = resolveRenderedContent(options);

  if (!smtpConfigured()) {
    console.warn('[EmailService] SMTP credentials are not configured; email delivery skipped.');
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EmailService] Would send email to ${recipients.join(', ')}: ${rendered.subject}`);
    }
    return { ok: false, provider: 'smtp', disabled: true, error: 'EMAIL_DISABLED' };
  }

  const transporter = nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT ?? 587,
    secure: String(config.EMAIL_SECURE).toLowerCase() === 'true',
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: recipients.join(', '),
      subject: rendered.subject,
      html: rendered.html || undefined,
      text: rendered.text || undefined,
    });
    return { ok: true, provider: 'smtp', providerMessageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EMAIL_SEND_FAILED';
    console.error('[EmailService] SMTP send failed:', message);
    return { ok: false, provider: 'smtp', error: message };
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    template: 'GENERAL_NOTIFICATION',
    data: {
      title: 'Welcome to Bangladesh Pet Association',
      message: `Dear ${name}, welcome to BPA! We are glad to have you.`,
    },
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  await sendEmail({
    to,
    template: 'PASSWORD_RESET',
    data: {
      name: 'User',
      resetLink,
    },
  });
}
