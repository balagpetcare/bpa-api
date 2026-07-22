import { z } from 'zod';

const optionalPhone = z.string().max(30).nullable().optional();
const optionalEmail = z.string().email().max(200).nullable().optional();
const optionalUrl   = z.string().url().nullable().optional();
const optionalText  = z.string().nullable().optional();

export const updateSiteSettingsSchema = z.object({
  // ─── Identity ─────────────────────────────────────────────────────
  siteName:                 z.string().min(1).max(200).optional(),
  siteTagline:              z.string().max(300).nullable().optional(),
  tagline:                  z.string().max(300).nullable().optional(),
  organizationName:         z.string().min(1).max(200).optional(),
  // ─── Contact ──────────────────────────────────────────────────────
  officialPhone:            optionalPhone,
  supportPhone:             optionalPhone,
  emergencyPhone:           optionalPhone,
  whatsappNumber:           optionalPhone,
  generalEmail:             optionalEmail,
  supportEmail:             optionalEmail,
  contactEmail:             optionalEmail,
  vaccinationEmail:         optionalEmail,
  primaryPhone:             optionalPhone,
  secondaryPhone:           optionalPhone,
  officeHours:              z.string().max(500).nullable().optional(),
  // ─── Address ──────────────────────────────────────────────────────
  officeAddress:            optionalText,
  addressLine1:             z.string().max(200).nullable().optional(),
  addressLine2:             z.string().max(200).nullable().optional(),
  addressLine:              z.string().max(500).nullable().optional(),
  area:                     z.string().max(100).nullable().optional(),
  city:                     z.string().max(100).nullable().optional(),
  postalCode:               z.string().max(20).nullable().optional(),
  country:                  z.string().max(100).nullable().optional(),
  mapEmbedUrl:              optionalText,
  mapLink:                  optionalUrl,
  // ─── Branding ─────────────────────────────────────────────────────
  primaryLogoUrl:           optionalUrl,
  secondaryLogoUrl:         optionalUrl,
  faviconUrl:               optionalUrl,
  websiteUrl:               z.string().max(200).nullable().optional(),
  legalName:                z.string().max(200).nullable().optional(),
  defaultMetaTitle:         z.string().max(200).nullable().optional(),
  defaultMetaDescription:   optionalText,
  receiptFooterNote:        optionalText,
  donationReceiptTermsBn:   optionalText,
  donationReceiptTermsEn:   optionalText,
  // ─── Social ───────────────────────────────────────────────────────
  facebookUrl:              optionalUrl,
  youtubeUrl:               optionalUrl,
  linkedinUrl:              optionalUrl,
  // ─── Public messages ──────────────────────────────────────────────
  registrationErrorTitle:   z.string().max(300).optional(),
  registrationErrorMessage: z.string().optional(),
  emergencyNotice:          optionalText,
});

export type UpdateSiteSettingsDto = z.infer<typeof updateSiteSettingsSchema>;
