import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
  message: 'Must be a valid hex color (e.g. #ffffff or #fff)',
});

const logoUrlSchema = z.string()
  .url({ message: 'Must be a valid URL' })
  .refine(
    (val) => {
      if (!val) return true;
      if (val.includes('localhost') || val.includes('127.0.0.1')) return false;
      return val.startsWith('https://');
    },
    { message: 'Must be an absolute HTTPS URL and cannot contain localhost' }
  )
  .optional()
  .nullable()
  .or(z.literal(''));

export const createEmailLayoutSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  isDefault: z.boolean().optional().default(false),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  locale: z.enum(['en', 'bn']),
  headerLogoUrl: logoUrlSchema,
  headerTitle: z.string().min(1, 'Header title is required').max(255),
  headerSubtitle: z.string().max(255).optional().nullable(),
  headerBackgroundColor: hexColorSchema.optional().default('#1a2540'),
  headerTextColor: hexColorSchema.optional().default('#ffffff'),
  footerLogoUrl: logoUrlSchema,
  footerText: z.string().optional().nullable(),
  footerSupportEmail: z.string().email('Must be a valid email').optional().nullable().or(z.literal('')),
  footerPhonePrimary: z.string().max(50).optional().nullable(),
  footerPhoneSecondary: z.string().max(50).optional().nullable(),
  footerWebsiteUrl: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  footerAddress: z.string().optional().nullable(),
  footerBackgroundColor: hexColorSchema.optional().default('#1a2540'),
  footerTextColor: hexColorSchema.optional().default('#aabbcc'),
  buttonPrimaryColor: hexColorSchema.optional().default('#1a6b3c'),
  buttonTextColor: hexColorSchema.optional().default('#ffffff'),
  legalNote: z.string().optional().nullable(),
  customHeaderHtml: z.string().optional().nullable(),
  customFooterHtml: z.string().optional().nullable(),
});

export const updateEmailLayoutSchema = createEmailLayoutSchema.partial();

export const sendTestEmailSchema = z.object({
  email: z.string().email('Must be a valid email'),
  layoutId: z.string().uuid().optional().nullable(),
  layoutData: createEmailLayoutSchema.partial().optional().nullable(),
  locale: z.enum(['en', 'bn']).optional().default('en'),
});

export const previewEmailLayoutSchema = z.object({
  layoutId: z.string().uuid().optional().nullable(),
  layoutData: createEmailLayoutSchema.partial().optional().nullable(),
  locale: z.enum(['en', 'bn']).optional().default('en'),
  subject: z.string().optional().default('Test Subject'),
  bodyHtml: z.string().optional().default('<p>This is a preview of the email body content.</p>'),
  previewText: z.string().optional().default('This is preview preheader text'),
});
