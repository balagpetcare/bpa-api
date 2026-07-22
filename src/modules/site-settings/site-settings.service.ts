import { prisma } from '../../database/prisma';
import type { UpdateSiteSettingsDto } from './site-settings.types';

const SINGLETON_ID = 'default';

async function ensureExists() {
  const existing = await prisma.siteSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!existing) {
    await prisma.siteSettings.create({ data: { id: SINGLETON_ID } });
  }
}

export async function getSettings() {
  await ensureExists();
  return prisma.siteSettings.findUnique({ where: { id: SINGLETON_ID } });
}

export async function updateSettings(dto: UpdateSiteSettingsDto) {
  await ensureExists();
  return prisma.siteSettings.update({
    where: { id: SINGLETON_ID },
    data: dto,
  });
}

// Returns only public-safe fields for the public API
export async function getPublicSettings() {
  await ensureExists();
  return prisma.siteSettings.findUnique({
    where: { id: SINGLETON_ID },
    select: {
      siteName: true,
      siteTagline: true,
      tagline: true,
      organizationName: true,
      // Contact
      officialPhone: true,
      supportPhone: true,
      emergencyPhone: true,
      whatsappNumber: true,
      generalEmail: true,
      supportEmail: true,
      contactEmail: true,
      vaccinationEmail: true,
      primaryPhone: true,
      secondaryPhone: true,
      officeHours: true,
      // Address
      officeAddress: true,
      addressLine1: true,
      addressLine2: true,
      addressLine: true,
      area: true,
      city: true,
      postalCode: true,
      country: true,
      mapEmbedUrl: true,
      mapLink: true,
      // Branding
      primaryLogoUrl: true,
      secondaryLogoUrl: true,
      faviconUrl: true,
      websiteUrl: true,
      legalName: true,
      defaultMetaTitle: true,
      defaultMetaDescription: true,
      receiptFooterNote: true,
      donationReceiptTermsBn: true,
      donationReceiptTermsEn: true,
      // Social
      facebookUrl: true,
      youtubeUrl: true,
      linkedinUrl: true,
      // Public messages
      registrationErrorTitle: true,
      registrationErrorMessage: true,
      emergencyNotice: true,
    },
  });
}
