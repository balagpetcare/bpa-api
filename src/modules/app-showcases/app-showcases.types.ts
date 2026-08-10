import { z } from 'zod';

const nullableText = z.string().trim().max(2000).optional().nullable();

const platformLinkSchema = z
  .object({
    platform: z.enum(['ANDROID', 'IOS', 'WEB']),
    availability: z.enum(['LIVE', 'COMING_SOON', 'BETA']).default('COMING_SOON'),
    storeUrl: z.string().trim().url().optional().nullable(),
    qrCodeMediaId: z.string().uuid().optional().nullable(),
  })
  // The one guarantee the public API relies on (see homepage-public
  // normalizers): a platform link can only carry a real store URL when it
  // is actually LIVE — never a COMING_SOON/BETA row with a URL that would
  // render a working-looking button for an app that isn't published yet.
  .refine((v) => v.availability === 'LIVE' || !v.storeUrl, {
    message: 'storeUrl can only be set when availability is LIVE',
    path: ['storeUrl'],
  });

const screenshotSchema = z.object({
  mediaFileId: z.string().uuid(),
  caption: z.string().trim().max(200).optional().nullable(),
});

export const createAppShowcaseSchema = z.object({
  appKey: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(200).optional().nullable(),
  description: nullableText,
  // Admin-authored, entirely optional — see AppShowcase.relationshipLabel
  // in schema.prisma. Never inferred by application code.
  relationshipLabel: z.string().trim().max(160).optional().nullable(),
  iconMediaId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
  features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  screenshots: z.array(screenshotSchema).max(10).default([]),
  platforms: z.array(platformLinkSchema).max(3).default([]),
});

export const updateAppShowcaseSchema = createAppShowcaseSchema.partial();

export const appShowcaseListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateAppShowcaseDto = z.infer<typeof createAppShowcaseSchema>;
export type UpdateAppShowcaseDto = z.infer<typeof updateAppShowcaseSchema>;
export type AppShowcaseListQuery = z.infer<typeof appShowcaseListQuerySchema>;
