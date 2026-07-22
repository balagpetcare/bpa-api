import { PrismaClient } from '@prisma/client';

export async function seedSiteSettings(prisma: PrismaClient) {
  const data = {
    siteName: 'Bangladesh Pet Association',
    siteTagline: 'Building a Better Future for Pets and Their Families',
    tagline: 'Building a Better Future for Pets and Their Families',
    organizationName: 'Bangladesh Pet Association',
    legalName: 'Bangladesh Pet Association',
    officialPhone: '+8809612345678',
    supportPhone: '+8809612345678',
    emergencyPhone: '+8809612345678',
    whatsappNumber: '+8809612345678',
    primaryPhone: '+8809612345678',
    generalEmail: 'info@bangladeshpetassociation.com',
    supportEmail: 'support@bangladeshpetassociation.com',
    contactEmail: 'info@bangladeshpetassociation.com',
    vaccinationEmail: 'vaccination2026@bangladeshpetassociation.com',
    websiteUrl: 'https://bangladeshpetassociation.com',
    officeHours: 'Saturday – Thursday: 9 AM – 6 PM (BST)',
    officeAddress: 'Dhaka, Bangladesh',
    addressLine: 'Dhaka, Bangladesh',
    city: 'Dhaka',
    country: 'Bangladesh',
    defaultMetaTitle: 'Bangladesh Pet Association — Community Pet Care',
    defaultMetaDescription:
      'BPA is dedicated to improving the lives of pets and their owners across Bangladesh through community clinics, vaccination campaigns, and education.',
    receiptFooterNote: 'BPA is a registered non-profit animal welfare organization.',
    donationReceiptTermsBn:
      'এই রসিদটি নিশ্চিত করে যে আপনার অনুদানটি গৃহীত হয়েছে এবং এটি ফেরতযোগ্য নয়। আপনার অবদান শুধুমাত্র প্রাণীদের সেবা, উদ্ধার, চিকিৎসা, টিকাদান এবং কল্যাণমূলক কার্যক্রমে ব্যবহার করা হবে।',
    donationReceiptTermsEn:
      'This receipt confirms that your donation has been received and is non-refundable. Your contribution will be used solely for animal care, rescue, treatment, vaccination, and welfare programs.',
    registrationErrorTitle: 'Online registration temporarily unavailable',
    registrationErrorMessage:
      'Online registration/payment is temporarily unavailable. Please call BPA support for assistance.',
    facebookUrl: 'https://facebook.com/bangladeshpetassociation',
    youtubeUrl: 'https://youtube.com/@bangladeshpetassociation',
    linkedinUrl: 'https://linkedin.com/company/bangladeshpetassociation',
  };

  await prisma.siteSettings.upsert({
    where: { id: 'default' },
    update: data,
    create: { id: 'default', ...data },
  });

  return { upserted: 1 };
}
