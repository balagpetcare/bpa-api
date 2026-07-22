import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { sendSuccess, sendCreated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { sendEmail } from '../../services/email.service';

// Basic HTML Sanitizer to prevent script injection
function sanitizeHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  // Strip script tags
  let sanitized = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  // Strip iframe tags
  sanitized = sanitized.replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '');
  // Strip style tags to keep style control contained (emails should use inline styles anyway)
  sanitized = sanitized.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  // Strip events
  sanitized = sanitized.replace(/\son\w+\s*=\s*(['"])(.*?)\1/gi, '');
  sanitized = sanitized.replace(/\son\w+\s*=\s*([^\s>]+)/gi, '');
  // Strip javascript protocol
  sanitized = sanitized.replace(/href\s*=\s*(['"])javascript:(.*?)\1/gi, 'href="#"');
  return sanitized;
}

export async function listEmailLayoutsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layouts = await prisma.emailLayoutSetting.findMany({
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, layouts);
  } catch (err) {
    next(err);
  }
}

export async function getEmailLayoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const layout = await prisma.emailLayoutSetting.findUnique({
      where: { id },
    });
    if (!layout) {
      throw AppError.notFound(`Email layout with ID ${id}`);
    }
    sendSuccess(res, layout);
  } catch (err) {
    next(err);
  }
}

export async function createEmailLayoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = req.body;
    
    // Sanitize custom HTML if present
    const customHeaderHtml = sanitizeHtml(data.customHeaderHtml);
    const customFooterHtml = sanitizeHtml(data.customFooterHtml);

    const result = await prisma.$transaction(async (tx) => {
      // If setting as default, update existing defaults for this locale
      if (data.isDefault) {
        await tx.emailLayoutSetting.updateMany({
          where: {
            locale: data.locale,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.emailLayoutSetting.create({
        data: {
          ...data,
          customHeaderHtml,
          customFooterHtml,
        },
      });
    });

    sendCreated(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateEmailLayoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.emailLayoutSetting.findUnique({
      where: { id },
    });
    if (!existing) {
      throw AppError.notFound(`Email layout with ID ${id}`);
    }

    const locale = data.locale || existing.locale;
    const isDefault = data.isDefault !== undefined ? data.isDefault : existing.isDefault;

    // Sanitize custom HTML if present
    const customHeaderHtml = data.customHeaderHtml !== undefined ? sanitizeHtml(data.customHeaderHtml) : existing.customHeaderHtml;
    const customFooterHtml = data.customFooterHtml !== undefined ? sanitizeHtml(data.customFooterHtml) : existing.customFooterHtml;

    const result = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.emailLayoutSetting.updateMany({
          where: {
            locale,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      return tx.emailLayoutSetting.update({
        where: { id },
        data: {
          ...data,
          customHeaderHtml,
          customFooterHtml,
        },
      });
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function setEmailLayoutDefaultHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const layout = await prisma.emailLayoutSetting.findUnique({
      where: { id },
    });
    if (!layout) {
      throw AppError.notFound(`Email layout with ID ${id}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Unset other defaults for this locale
      await tx.emailLayoutSetting.updateMany({
        where: {
          locale: layout.locale,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      // Set this one as default and active
      return tx.emailLayoutSetting.update({
        where: { id },
        data: {
          isDefault: true,
          status: 'active',
        },
      });
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function previewEmailLayoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { layoutId, layoutData, locale, subject, bodyHtml, previewText } = req.body;

    let dbLayoutData: any = {};
    if (layoutId) {
      const found = await prisma.emailLayoutSetting.findUnique({ where: { id: layoutId } });
      if (found) {
        dbLayoutData = found;
      }
    }

    // Merge layout data
    const mergedLayout = {
      ...dbLayoutData,
      ...layoutData,
    };

    // Temporarily inject layout data to a mock setting or renderEmailLayout directly using a mock DB layout resolver.
    // To achieve this cleanly with renderEmailLayout, we can temporarily override layout retrieval or bypass it.
    // Let's create a temporary record or we can mock renderEmailLayout functionality here.
    // Actually, renderEmailLayout fetches from DB if layoutKey is provided. If we provide a layoutKey that doesn't exist, it falls back to default layout.
    // But we want to preview UNSAVED edits!
    // Let's implement preview rendering in render-email-layout.ts or directly here.
    // We can extract renderEmailLayout logic into a helper that takes direct layout properties so both this preview and renderEmailLayout can use it.
    // Let's do that! Wait, we can transactionally create/rollback or simply do the rendering directly:
    // Let's write the renderer function that accepts the layout properties directly so we don't need database access for previews!
    
    // We can do this by using a helper or copying the logic.
    // Let's inspect the layout properties we need:
    const headerTitle = mergedLayout.headerTitle || 'Bangladesh Pet Association';
    const headerSubtitle = mergedLayout.headerSubtitle || 'A national platform for responsible pet care';
    const headerBg = mergedLayout.headerBackgroundColor || '#1a2540';
    const headerTextColor = mergedLayout.headerTextColor || '#ffffff';
    const headerLogo = mergedLayout.headerLogoUrl || '';

    const footerText = mergedLayout.footerText || 'Bangladesh Pet Association';
    const footerBg = mergedLayout.footerBackgroundColor || '#1a2540';
    const footerTextColor = mergedLayout.footerTextColor || '#aabbcc';
    const footerLogo = mergedLayout.footerLogoUrl || '';

    const supportEmail = mergedLayout.footerSupportEmail || 'vaccination2026@bangladeshpetassociation.com';
    const phonePrimary = mergedLayout.footerPhonePrimary || '01575-008300';
    const phoneSecondary = mergedLayout.footerPhoneSecondary || '01701-022274';
    const websiteUrl = mergedLayout.footerWebsiteUrl || 'https://bangladeshpetassociation.com';
    const address = mergedLayout.footerAddress || 'Dhaka, Bangladesh';
    const legalNote = mergedLayout.legalNote || 'You are receiving this email because you interacted with Bangladesh Pet Association services.';

    const customHeaderHtml = mergedLayout.customHeaderHtml ? sanitizeHtml(mergedLayout.customHeaderHtml) : null;
    const customFooterHtml = mergedLayout.customFooterHtml ? sanitizeHtml(mergedLayout.customFooterHtml) : null;

    const phoneLine = [phonePrimary, phoneSecondary].filter(Boolean).join(', ');

    const html = `<!DOCTYPE html>
<html lang="${locale || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject || 'Test Subject'}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body, .body-bg { background-color: #0f172a !important; }
      .email-card { background-color: #1e293b !important; box-shadow: none !important; }
      .email-text { color: #f1f5f9 !important; }
      .email-muted { color: #94a3b8 !important; }
      .divider { border-top-color: #334155 !important; }
      .fallback-header { background-color: #0f172a !important; }
      .fallback-footer { background-color: #0f172a !important; border-top-color: #334155 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: Arial, Helvetica, sans-serif; width: 100% !important;" class="body-bg">
  ${previewText ? `<div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>` : ''}
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f8fafc;" class="body-bg">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);" class="email-card">
          ${customHeaderHtml ? customHeaderHtml : `
          <tr>
            <td align="center" style="background-color: ${headerBg}; padding: 32px 24px; text-align: center;" class="fallback-header">
              ${headerLogo ? `<img src="${headerLogo}" alt="Logo" style="max-height: 60px; margin-bottom: 12px; display: inline-block;">` : ''}
              <h1 style="margin: 0; color: ${headerTextColor}; font-size: 22px; font-weight: 700;">${headerTitle}</h1>
              ${headerSubtitle ? `<p style="margin: 6px 0 0 0; color: ${headerTextColor}; opacity: 0.8; font-size: 13px;">${headerSubtitle}</p>` : ''}
            </td>
          </tr>
          `}
          <tr>
            <td style="padding: 32px 24px; color: #334155; font-size: 15px; line-height: 1.6;" class="email-text">
              ${bodyHtml || '<p>This is placeholder content for your email body.</p>'}
            </td>
          </tr>
          ${customFooterHtml ? customFooterHtml : `
          <tr>
            <td style="background-color: ${footerBg}; padding: 32px 24px; text-align: center; font-size: 12px; color: ${footerTextColor}; border-top: 1px solid #e2e8f0;" class="fallback-footer email-muted">
              ${footerLogo ? `<img src="${footerLogo}" alt="Footer Logo" style="max-height: 40px; margin-bottom: 16px; display: inline-block;">` : ''}
              ${footerText ? `<p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600;">${footerText}</p>` : ''}
              <p style="margin: 0 0 8px 0;">
                ${websiteUrl ? `<a href="${websiteUrl}" target="_blank" style="color: ${footerTextColor}; margin: 0 8px;">Website</a>` : ''}
                ${supportEmail ? `<a href="mailto:${supportEmail}" style="color: ${footerTextColor}; margin: 0 8px;">${supportEmail}</a>` : ''}
              </p>
              ${phoneLine ? `<p style="margin: 0 0 8px 0;">Helpline: ${phoneLine}</p>` : ''}
              ${address ? `<p style="margin: 0 0 16px 0;">${address}</p>` : ''}
              <div style="border-top: 1px solid #e2e8f0; margin: 16px 0;" class="divider"></div>
              ${legalNote ? `<p style="margin: 0; font-size: 11px; opacity: 0.8;">${legalNote}</p>` : ''}
            </td>
          </tr>
          `}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    sendSuccess(res, { html });
  } catch (err) {
    next(err);
  }
}

export async function sendTestEmailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, layoutId, layoutData, locale } = req.body;


    // Let's create a temporary layout in the database if we need to send email via renderEmailLayout layoutKey.
    // Or we can just use the renderer logic. Wait, sendEmail calls renderEmailLayout using layoutKey.
    // Let's make sendEmail support passing layoutData directly so we can send test email without database persistence!
    // Let's check: yes, in our layout renderer, we can support layoutData. But wait, sendEmail signature didn't have layoutData. We can easily update sendEmail to support passing layoutData directly, or we can transactionally save the layout, send the email, and then rollback the transaction!
    // Wait, transaction rollback doesn't rollback network calls. If the email is sent, that's fine. But creating layout, sending email, and then deleting layout is a very easy and clean pattern.
    // Let's do that:
    let tempLayoutId: string | null = null;
    if (layoutData && Object.keys(layoutData).length > 0) {
      const tempLayout = await prisma.emailLayoutSetting.create({
        data: {
          name: `TEMP_TEST_${Date.now()}`,
          locale: locale || 'en',
          status: 'inactive', // inactive so it doesn't affect standard emails
          isDefault: false,
          ...layoutData,
        }
      });
      tempLayoutId = tempLayout.id;
    }

    const targetLayoutKey = tempLayoutId || layoutId || undefined;

    // Use GENERAL_NOTIFICATION template to send a nice test email
    await sendEmail({
      to: email,
      template: 'GENERAL_NOTIFICATION',
      data: {
        title: 'BPA Email layout Test',
        message: 'This is a test email sent from the Bangladesh Pet Association Email Layout management panel to verify your header/footer layouts and styling.',
        actionText: 'Go to Website',
        actionUrl: 'https://bangladeshpetassociation.com'
      },
      locale: locale || 'en',
      layoutKey: targetLayoutKey,
    });

    // Clean up temporary layout if created
    if (tempLayoutId) {
      await prisma.emailLayoutSetting.delete({
        where: { id: tempLayoutId }
      }).catch(console.error);
    }

    sendSuccess(res, { message: `Test email successfully sent to ${email}` });
  } catch (err) {
    next(err);
  }
}
