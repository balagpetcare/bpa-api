import { z } from 'zod';

export const initiateDonationSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .int('amount must be a whole number')
    .min(50, 'Minimum donation amount is BDT 50'),
  currency: z.string().max(10).optional(),
  purposeId: z.string().uuid('purposeId must be a valid UUID').optional(),
  purposeSlug: z.string().max(100).optional(),
  campaignId: z.string().uuid('campaignId must be a valid UUID').optional(),
  campaignSlug: z.string().max(100).optional(),
  qrSlug: z.string().max(100).optional(),
  donorName: z
    .string({ required_error: 'donorName is required' })
    .min(1, 'donorName is required')
    .max(255),
  donorEmail: z.string().email('donorEmail must be a valid email').max(255).optional(),
  donorPhone: z.string().max(30).optional(),
  donorCountry: z.string().max(100).optional(),
  donorType: z.enum(['INDIVIDUAL', 'ORGANIZATION', 'ANONYMOUS']).optional(),
  organizationName: z.string().max(255).optional(),
  isAnonymous: z.boolean().optional(),
  showOnDonorWall: z.boolean().optional(),
  message: z.string().max(2000).optional(),
  source: z.string().max(100).optional(),
});

export const createImpactStorySchema = z.object({
  titleEn: z.string().min(1, 'Title (English) is required').max(255),
  titleBn: z.string().max(255).optional(),
  slug: z.string().min(1, 'Slug is required').max(280),
  storyType: z.enum(['RESCUE', 'VACCINATION', 'FOOD', 'TREATMENT', 'ADOPTION', 'AWARENESS']).default('RESCUE'),
  location: z.string().max(255).optional(),
  animalType: z.string().max(100).optional(),
  animalName: z.string().max(255).optional(),
  shortDescriptionEn: z.string().optional(),
  shortDescriptionBn: z.string().optional(),
  fullStoryEn: z.string().min(1, 'Full story (English) is required'),
  fullStoryBn: z.string().optional(),
  beforeImageUrl: z.string().url('Invalid before image URL').optional().or(z.literal('')),
  afterImageUrl: z.string().url('Invalid after image URL').optional().or(z.literal('')),
  costUsed: z.number().positive().optional().nullable(),
  storyDate: z.string().optional(),
  status: z.string().default('DRAFT'),
  showOnDonationPage: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  isFeatured: z.boolean().default(false),
  purposeId: z.string().uuid().optional().nullable(),
  campaignId: z.string().uuid().optional().nullable(),
});

export const updateImpactStorySchema = createImpactStorySchema.partial();
