import { z } from 'zod';
import { CarePartnerCardStatus } from '@prisma/client';

export const revokeCardSchema = z.object({
  revocationReason: z.string().min(5).max(500),
});

export const cardListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  status: z.nativeEnum(CarePartnerCardStatus).optional(),
  zoneId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const reactivateCardSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const verifyCardQuerySchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-f]+$/),
});

export const verificationLogListQuerySchema = z.object({
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
  cardId: z.string().uuid().optional(),
  scanResult: z.string().max(30).optional(),
});

export const LEGAL_DISCLAIMER =
  'Care Partner Card is a contribution recognition and service benefit card only. ' +
  'It is not ownership, share, profit-sharing, investment, or financial return. ' +
  'Product, medicine, food, accessories, and third-party cost discounts are not guaranteed.';

export type RevokeCardDto = z.infer<typeof revokeCardSchema>;
export type ReactivateCardDto = z.infer<typeof reactivateCardSchema>;
export type CardListQuery = z.infer<typeof cardListQuerySchema>;
export type VerifyCardQuery = z.infer<typeof verifyCardQuerySchema>;
export type VerificationLogListQuery = z.infer<typeof verificationLogListQuerySchema>;
