import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).transform((v) => v || null).optional().nullable();
const sortOrder = z.coerce.number().int().min(0).max(1_000_000);
export const safeUrlSchema = z.string().trim().max(2048).superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL must use HTTP or HTTPS' });
    if (!url.hostname || url.username || url.password) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL is not a safe destination' });
  } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Malformed URL' }); }
});

export const sectionWriteSchema = z.object({
  key: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'key must be lowercase kebab-case'),
  eyebrow: nullableText(120), title: text(160), subtitle: nullableText(5000), description: nullableText(10000),
  layout: z.enum(['PREVIEW_LEFT', 'PREVIEW_RIGHT']).default('PREVIEW_LEFT'),
  theme: z.enum(['default', 'light', 'dark']).default('default'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'), isActive: z.boolean().default(true),
  sortOrder: sortOrder.default(0), logoMediaId: z.string().uuid().optional().nullable(),
});
export const updateSectionSchema = sectionWriteSchema.partial();
export const sectionListSchema = z.object({ status: z.enum(['draft', 'published', 'archived']).optional(), isActive: z.enum(['true', 'false']).optional(), page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional() });

export const itemWriteSchema = z.object({
  platformKey: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), brandKey: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platformType: z.enum(['APP', 'WEBSITE']), name: text(160), badgeText: nullableText(120), heading: nullableText(180),
  subheading: nullableText(200), description: nullableText(10000), featureBullets: z.array(text(300)).max(30).default([]),
  ctaText: nullableText(80), ctaUrl: safeUrlSchema.optional().nullable(), layoutOverride: nullableText(60), featured: z.boolean().default(false),
  isActive: z.boolean().default(true), sortOrder: sortOrder.default(0), logoMediaId: z.string().uuid().optional().nullable(),
  primaryPreviewMediaId: z.string().uuid().optional().nullable(), secondaryPreviewMediaId: z.string().uuid().optional().nullable(),
  previewMode: z.enum(['RAW_IMAGE', 'DEVICE_FRAME']).default('RAW_IMAGE'),
});
export const updateItemSchema = itemWriteSchema.partial();
export const itemListSchema = z.object({ sectionId: z.string().uuid().optional(), platformType: z.enum(['APP', 'WEBSITE']).optional(), brandKey: z.string().trim().optional(), isActive: z.enum(['true', 'false']).optional(), featured: z.enum(['true', 'false']).optional(), page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional() });

export const linkWriteSchema = z.object({ type: z.enum(['GOOGLE_PLAY', 'APP_STORE', 'WEBSITE', 'DETAILS', 'OTHER']), label: text(120), url: safeUrlSchema, qrEnabled: z.boolean().default(false), qrCaption: nullableText(160), openInNewTab: z.boolean().default(false), isActive: z.boolean().default(true), sortOrder: sortOrder.default(0) });
export const updateLinkSchema = linkWriteSchema.partial();
export const reorderSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), sortOrder })).min(1).max(200) }).refine((v) => new Set(v.items.map((i) => i.id)).size === v.items.length, 'Duplicate IDs are not allowed');
export const statusSchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });
export const activeSchema = z.object({ isActive: z.boolean() });
export const featuredSchema = z.object({ featured: z.boolean() });

export type SectionWrite = z.infer<typeof sectionWriteSchema>; export type SectionUpdate = z.infer<typeof updateSectionSchema>; export type SectionList = z.infer<typeof sectionListSchema>;
export type ItemWrite = z.infer<typeof itemWriteSchema>; export type ItemUpdate = z.infer<typeof updateItemSchema>; export type ItemList = z.infer<typeof itemListSchema>;
export type LinkWrite = z.infer<typeof linkWriteSchema>; export type LinkUpdate = z.infer<typeof updateLinkSchema>; export type Reorder = z.infer<typeof reorderSchema>;
