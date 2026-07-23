import { z } from 'zod';

// ─── DTOs ─────────────────────────────────────────────────────────

export const updateMediaSchema = z.object({
  altText: z.string().max(255).optional().nullable(),
});

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  search: z.string().optional(),
  mimeType: z.string().optional(),
});

// Validates the `:id` route param on GET/PATCH/DELETE /admin/media/:id and
// POST /:id/crop before it ever reaches Prisma. Without this, a non-UUID id
// (e.g. a URL passed where an id was expected) hits `mediaFile.findUnique`
// directly, Postgres rejects the invalid uuid literal, and Prisma surfaces
// it as error code P2023 — which the global error handler maps to a
// generic, confusing "Invalid data format in request" / VALIDATION_ERROR
// response. Rejecting the bad id here instead gives a clean, honest 400.
export const mediaIdParamSchema = z.object({
  id: z.string().uuid('Media id must be a valid UUID.'),
});

export const cropMediaSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  targetWidth: z.number().int().positive(),
  targetHeight: z.number().int().positive(),
});

export type UpdateMediaDto = z.infer<typeof updateMediaSchema>;
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
export type CropMediaDto = z.infer<typeof cropMediaSchema>;

// ─── Response shapes ──────────────────────────────────────────────

export interface MediaFileResponse {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  extension: string;
  fileCategory: 'image' | 'video' | 'document' | 'archive' | 'other';
  sizeBytes: string;
  url: string;
  altText: string | null;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  missing?: boolean;
}
