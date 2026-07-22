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

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (options.template) {
    const templateFn = EmailTemplateRegistry[options.template];
    if (!templateFn) {
      throw new Error(`Email template ${options.template} not found in registry.`);
    }
  }

  if (!config.EMAIL_HOST || !config.EMAIL_USER) {
    console.warn('[EmailService] Email not configured — skipping send');
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EmailService] Would send email to ${options.to}: ${options.subject || '(no subject)'}`);
    }
    return;
  }

  // Placeholder: integrate nodemailer or an HTTP email provider here.
  // The interface is provider-agnostic; swap the transport without changing callers.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EmailService] Sending email to ${options.to}: ${options.subject || '(no subject)'}`);
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

