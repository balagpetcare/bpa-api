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
