import { z } from 'zod';

export const APP_CONTROL_PAGE_KEYS = [
  'app_dashboard',
  'home_page_builder',
  'banners_sliders',
  'quick_actions',
  'featured_services',
  'campaign_blocks',
  'offers_promotions',
  'page_cms',
  'app_navigation',
  'theme_branding',
  'push_notifications',
  'popup_notice',
  'version_control',
  'maintenance_mode',
  'audit_logs',
] as const;

const nullableText = z.string().trim().max(5000).optional().nullable();
const nullableTitle = z.string().trim().min(1).max(255).optional().nullable();
// An empty string is treated the same as an explicit null (clear the
// field) rather than being rejected by `.url()` — the admin UI already
// normalizes '' -> null before sending, but the API must not depend on
// that; any other client sending '' to explicitly clear imageUrl/
// mobileImageUrl/logoUrl must have the same effect, not a validation error.
const nullableUrl = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().url().max(2000).optional().nullable(),
);
const nullableIso = z.string().datetime().optional().nullable();
const uuidSchema = z.string().uuid();

const destinationTypeSchema = z.enum(['CAMPAIGN', 'MEMBERSHIP', 'DONATION', 'PET_CENSUS', 'SERVICE', 'INTERNAL_PAGE', 'EXTERNAL_URL', 'NONE']);
const contentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const appControlListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.preprocess((v) => (v === '' ? undefined : v), contentStatusSchema.optional()),
  isActive: z.enum(['true', 'false']).optional(),
  destinationType: z.preprocess((v) => (v === '' ? undefined : v), destinationTypeSchema.optional()),
  search: z.string().trim().max(255).optional(),
});

const appControlWriteBaseSchema = z.object({
  title: nullableTitle,
  subtitle: z.string().trim().max(255).optional().nullable(),
  description: nullableText,
  imageUrl: nullableUrl,
  mobileImageUrl: nullableUrl,
  ctaText: z.string().trim().max(100).optional().nullable(),
  destinationType: destinationTypeSchema.default('NONE'),
  destinationValue: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: nullableIso,
  endsAt: nullableIso,
  targetAudience: z.enum(['all', 'guest', 'member', 'donor', 'volunteer', 'staff']).default('all'),
  status: contentStatusSchema.default('draft'),
});

function applyDestinationRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: any, ctx) => {
    if (typeof data.startsAt === 'string' && typeof data.endsAt === 'string' && new Date(data.endsAt) < new Date(data.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endsAt must be after startsAt', path: ['endsAt'] });
    }
    if (data.destinationType === 'NONE' && data.destinationValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'destinationValue is not allowed when destinationType is NONE', path: ['destinationValue'] });
    }
    if (data.destinationType && data.destinationType !== 'NONE' && !data.destinationValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'destinationValue is required for the selected destinationType', path: ['destinationValue'] });
    }
    if (data.destinationType === 'EXTERNAL_URL' && data.destinationValue) {
      const urlCheck = z.string().url().safeParse(data.destinationValue);
      if (!urlCheck.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'destinationValue must be a valid URL', path: ['destinationValue'] });
    }
    if (data.destinationType === 'INTERNAL_PAGE' && data.destinationValue && !APP_CONTROL_PAGE_KEYS.includes(data.destinationValue as typeof APP_CONTROL_PAGE_KEYS[number])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'destinationValue must be a known app page key', path: ['destinationValue'] });
    }
  });
}

export const appControlWriteSchema = applyDestinationRules(appControlWriteBaseSchema);

export const appControlUpdateSchema = applyDestinationRules(appControlWriteBaseSchema.partial());

export const appControlPublishSchema = z.object({
  published: z.boolean(),
});

export const appControlReorderSchema = z.object({
  items: z.array(z.object({ id: uuidSchema, sortOrder: z.number().int().min(0) })).min(1),
});

const appVersionSettingBaseSchema = appControlWriteBaseSchema.extend({
  minimumVersion: z.string().trim().min(1).max(50),
  latestVersion: z.string().trim().min(1).max(50),
  forceUpdate: z.boolean().default(false),
  releaseNotes: nullableText,
});

export const appVersionSettingWriteSchema = applyDestinationRules(appVersionSettingBaseSchema);

export const appVersionSettingUpdateSchema = applyDestinationRules(appVersionSettingBaseSchema.partial());

const appTutorialGuideBaseSchema = appControlWriteBaseSchema.extend({
  contentType: z.enum(['GUIDE', 'TUTORIAL', 'FAQ', 'ARTICLE']).default('GUIDE'),
  category: z.string().trim().max(100).optional().nullable(),
  language: z.string().trim().min(2).max(10).default('en'),
  publishedAt: nullableIso,
});

export const appTutorialGuideWriteSchema = applyDestinationRules(appTutorialGuideBaseSchema);

export const appTutorialGuideUpdateSchema = applyDestinationRules(appTutorialGuideBaseSchema.partial());

const appThemeSettingBaseSchema = appControlWriteBaseSchema.extend({
  primaryColor: z.string().trim().max(20).optional().nullable(),
  secondaryColor: z.string().trim().max(20).optional().nullable(),
  accentColor: z.string().trim().max(20).optional().nullable(),
  fontFamily: z.string().trim().max(100).optional().nullable(),
  logoUrl: nullableUrl,
});

export const appThemeSettingWriteSchema = applyDestinationRules(appThemeSettingBaseSchema);

export const appThemeSettingUpdateSchema = applyDestinationRules(appThemeSettingBaseSchema.partial());

export const appAuditLogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  action: z.enum(['create', 'update', 'delete', 'publish', 'unpublish']).optional(),
  entityType: z.string().trim().max(80).optional(),
  search: z.string().trim().max(255).optional(),
});

export type AppControlListQuery = z.infer<typeof appControlListQuerySchema>;
export type AppControlWriteDto = z.infer<typeof appControlWriteSchema>;
export type AppControlUpdateDto = z.infer<typeof appControlUpdateSchema>;
export type AppControlPublishDto = z.infer<typeof appControlPublishSchema>;
export type AppControlReorderDto = z.infer<typeof appControlReorderSchema>;
export type AppVersionSettingWriteDto = z.infer<typeof appVersionSettingWriteSchema>;
export type AppVersionSettingUpdateDto = z.infer<typeof appVersionSettingUpdateSchema>;
export type AppThemeSettingWriteDto = z.infer<typeof appThemeSettingWriteSchema>;
export type AppThemeSettingUpdateDto = z.infer<typeof appThemeSettingUpdateSchema>;
export type AppAuditLogListQuery = z.infer<typeof appAuditLogListQuerySchema>;
