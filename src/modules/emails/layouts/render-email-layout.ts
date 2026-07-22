import { prisma } from '../../../database/prisma';
import { getSettings } from '../../site-settings/site-settings.service';

export interface RenderEmailOptions {
  locale: 'en' | 'bn';
  subject: string;
  previewText?: string;
  bodyHtml: string;
  layoutKey?: string;
}

export interface FallbackLayout {
  headerTitle: string;
  headerSubtitle: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  footerSupportEmail: string;
  footerPhonePrimary: string;
  footerPhoneSecondary: string;
  footerWebsiteUrl: string;
  footerLogoUrl: string | null;
  headerLogoUrl: string | null;
  footerText: string;
  footerAddress: string;
  footerBackgroundColor: string;
  footerTextColor: string;
  buttonPrimaryColor: string;
  buttonTextColor: string;
  legalNote: string;
}

// Helper to sanitize logo URLs
export function cleanLogoUrl(url: string | null | undefined, fallbackUrl: string | null = null): string {
  const currentUrl = url || fallbackUrl;
  if (!currentUrl) return '';
  
  if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
    return '';
  }
  
  if (currentUrl.startsWith('http://')) {
    return currentUrl.replace('http://', 'https://');
  }
  
  if (currentUrl.startsWith('/')) {
    return `https://bangladeshpetassociation.com${currentUrl}`;
  }
  
  if (!currentUrl.startsWith('https://')) {
    return '';
  }
  
  return currentUrl;
}

export async function renderEmailLayout(options: RenderEmailOptions): Promise<string> {
  const { locale, subject, previewText, bodyHtml, layoutKey } = options;

  // 1. Fetch Layout from Database
  let dbLayout = null;

  try {
    if (layoutKey) {
      dbLayout = await prisma.emailLayoutSetting.findFirst({
        where: {
          OR: [
            { id: layoutKey },
            { name: layoutKey },
          ],
          status: 'active',
        },
      });
    }

    if (!dbLayout) {
      dbLayout = await prisma.emailLayoutSetting.findFirst({
        where: {
          locale,
          status: 'active',
          isDefault: true,
        },
      });
    }
  } catch (err) {
    console.error('[RenderEmailLayout] Error fetching email layout from database:', err);
  }

  // 2. Fetch Site Settings for branding fallbacks
  let siteSettings: any = null;
  try {
    siteSettings = await getSettings();
  } catch (err) {
    console.error('[RenderEmailLayout] Error fetching site settings:', err);
  }

  const defaultLogo = siteSettings?.primaryLogoUrl ? cleanLogoUrl(siteSettings.primaryLogoUrl) : 'https://bangladeshpetassociation.com/assets/images/logo.png';

  // 3. Define fallback values
  const fallback: FallbackLayout = {
    headerTitle: locale === 'bn' ? 'বাংলাদেশ পেট অ্যাসোসিয়েশন' : 'Bangladesh Pet Association',
    headerSubtitle: locale === 'bn' ? 'দায়িত্বশীল পোষা প্রাণী সেবার জাতীয় প্ল্যাটফর্ম' : 'A national platform for responsible pet care',
    headerBackgroundColor: '#1a2540',
    headerTextColor: '#ffffff',
    footerSupportEmail: 'vaccination2026@bangladeshpetassociation.com',
    footerPhonePrimary: '01575-008300',
    footerPhoneSecondary: '01701-022274',
    footerWebsiteUrl: 'https://bangladeshpetassociation.com',
    headerLogoUrl: defaultLogo || null,
    footerLogoUrl: defaultLogo || null,
    footerText: locale === 'bn' ? 'বাংলাদেশ পেট অ্যাসোসিয়েশন' : 'Bangladesh Pet Association',
    footerAddress: locale === 'bn' ? 'ঢাকা, বাংলাদেশ' : 'Dhaka, Bangladesh',
    footerBackgroundColor: '#1a2540',
    footerTextColor: '#aabbcc',
    buttonPrimaryColor: '#1a6b3c',
    buttonTextColor: '#ffffff',
    legalNote: locale === 'bn' 
      ? 'বাংলাদেশ পেট অ্যাসোসিয়েশন-এর পরিষেবায় অংশ নেওয়ার জন্য আপনি এই ইমেলটি পেয়েছেন।' 
      : 'You are receiving this email because you interacted with Bangladesh Pet Association services.',
  };

  // 4. Resolve template parameters
  const headerTitle = dbLayout?.headerTitle || fallback.headerTitle;
  const headerSubtitle = dbLayout?.headerSubtitle || fallback.headerSubtitle;
  const headerBg = dbLayout?.headerBackgroundColor || fallback.headerBackgroundColor;
  const headerTextColor = dbLayout?.headerTextColor || fallback.headerTextColor;
  const headerLogo = cleanLogoUrl(dbLayout?.headerLogoUrl, fallback.headerLogoUrl);

  const footerText = dbLayout?.footerText || fallback.footerText;
  const footerBg = dbLayout?.footerBackgroundColor || fallback.footerBackgroundColor;
  const footerTextColor = dbLayout?.footerTextColor || fallback.footerTextColor;
  const footerLogo = cleanLogoUrl(dbLayout?.footerLogoUrl, fallback.footerLogoUrl);

  const supportEmail = dbLayout?.footerSupportEmail || fallback.footerSupportEmail;
  const phonePrimary = dbLayout?.footerPhonePrimary || fallback.footerPhonePrimary;
  const phoneSecondary = dbLayout?.footerPhoneSecondary || fallback.footerPhoneSecondary;
  const websiteUrl = dbLayout?.footerWebsiteUrl || fallback.footerWebsiteUrl;
  const address = dbLayout?.footerAddress || fallback.footerAddress;
  const legalNote = dbLayout?.legalNote || fallback.legalNote;

  const customHeaderHtml = dbLayout?.customHeaderHtml || null;
  const customFooterHtml = dbLayout?.customFooterHtml || null;

  const phoneLine = [phonePrimary, phoneSecondary].filter(Boolean).join(', ');

  // 5. Construct table-based responsive HTML
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
  <style>
    /* Dark mode styling override */
    @media (prefers-color-scheme: dark) {
      body, .body-bg {
        background-color: #0f172a !important;
      }
      .email-card {
        background-color: #1e293b !important;
        box-shadow: none !important;
      }
      .email-text {
        color: #f1f5f9 !important;
      }
      .email-muted {
        color: #94a3b8 !important;
      }
      .divider {
        border-top-color: #334155 !important;
      }
      .fallback-header {
        background-color: #0f172a !important;
      }
      .fallback-footer {
        background-color: #0f172a !important;
        border-top-color: #334155 !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased; width: 100% !important;" class="body-bg">
  ${previewText ? `<div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>` : ''}

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f8fafc;" class="body-bg">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.035);" class="email-card">
          
          <!-- Header Area -->
          ${customHeaderHtml ? customHeaderHtml : `
          <tr>
            <td align="center" style="background-color: ${headerBg}; padding: 32px 24px; text-align: center;" class="fallback-header">
              ${headerLogo ? `<img src="${headerLogo}" alt="Logo" style="max-height: 60px; margin-bottom: 12px; border: 0; outline: none; display: inline-block;">` : ''}
              <h1 style="margin: 0; color: ${headerTextColor}; font-size: 22px; font-weight: 700; line-height: 1.3;">${headerTitle}</h1>
              ${headerSubtitle ? `<p style="margin: 6px 0 0 0; color: ${headerTextColor}; opacity: 0.8; font-size: 13px; font-weight: 400; line-height: 1.4;">${headerSubtitle}</p>` : ''}
            </td>
          </tr>
          `}

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 24px; color: #334155; font-size: 15px; line-height: 1.6;" class="email-text">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer Area -->
          ${customFooterHtml ? customFooterHtml : `
          <tr>
            <td style="background-color: ${footerBg}; padding: 32px 24px; text-align: center; font-size: 12px; color: ${footerTextColor}; border-top: 1px solid #e2e8f0;" class="fallback-footer email-muted">
              ${footerLogo ? `<img src="${footerLogo}" alt="Footer Logo" style="max-height: 40px; margin-bottom: 16px; border: 0; outline: none; display: inline-block;">` : ''}
              
              ${footerText ? `<p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600;">${footerText}</p>` : ''}
              
              <p style="margin: 0 0 8px 0; line-height: 1.5;">
                ${websiteUrl ? `<a href="${websiteUrl}" target="_blank" style="color: ${footerTextColor}; text-decoration: underline; font-weight: bold; margin: 0 8px;">Website</a>` : ''}
                ${supportEmail ? `<a href="mailto:${supportEmail}" style="color: ${footerTextColor}; text-decoration: underline; font-weight: bold; margin: 0 8px;">${supportEmail}</a>` : ''}
              </p>
              
              ${phoneLine ? `<p style="margin: 0 0 8px 0; line-height: 1.5;">Helpline: ${phoneLine}</p>` : ''}
              ${address ? `<p style="margin: 0 0 16px 0; line-height: 1.5;">${address}</p>` : ''}
              
              <div style="border-top: 1px solid #e2e8f0; margin: 16px 0;" class="divider"></div>
              
              ${legalNote ? `<p style="margin: 0 0 8px 0; line-height: 1.4; font-size: 11px; opacity: 0.8;">${legalNote}</p>` : ''}
              <p style="margin: 0; font-size: 10px; opacity: 0.7;">This is a system-generated transactional email from Bangladesh Pet Association. Please do not reply directly.</p>
            </td>
          </tr>
          `}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
