import { z } from 'zod';

// ─── DTOs ─────────────────────────────────────────────────────────

export const upsertSeoSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  ogTitle: z.string().max(255).optional().nullable(),
  ogDescription: z.string().optional().nullable(),
  ogImageId: z.string().uuid().optional().nullable(),
  schemaJson: z.record(z.unknown()).optional().nullable(),
});

export type UpsertSeoDto = z.infer<typeof upsertSeoSchema>;

// ─── Response shapes ──────────────────────────────────────────────

export interface SeoMetadataResponse {
  id: string;
  route: string;
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  schemaJson: Record<string, unknown> | null;
  updatedAt: Date;
}
