import { PrismaClient } from '@prisma/client';

const CONTACT_TYPES = [
  { slug: 'individual',       labelEn: 'Individual / Personal',       labelBn: 'ব্যক্তিগত',          sortOrder: 1 },
  { slug: 'organization',     labelEn: 'Organization / NGO',          labelBn: 'সংস্থা / এনজিও',      sortOrder: 2 },
  { slug: 'government-ngo',   labelEn: 'Government / Public Body',    labelBn: 'সরকারি প্রতিষ্ঠান',   sortOrder: 3 },
  { slug: 'media',            labelEn: 'Media / Press',               labelBn: 'মিডিয়া / প্রেস',      sortOrder: 4 },
  { slug: 'corporate',        labelEn: 'Corporate / Business',        labelBn: 'কর্পোরেট / ব্যবসায়', sortOrder: 5 },
  { slug: 'veterinary',       labelEn: 'Veterinary / Medical',        labelBn: 'ভেটেরিনারি / চিকিৎসা', sortOrder: 6 },
];

const INQUIRY_CATEGORIES = [
  { slug: 'general-inquiry',      labelEn: 'General Inquiry',              labelBn: 'সাধারণ জিজ্ঞাসা',         sortOrder: 1 },
  { slug: 'vaccination-campaign', labelEn: 'Vaccination Campaign',         labelBn: 'টিকাদান ক্যাম্পেইন',      sortOrder: 2 },
  { slug: 'membership-care',      labelEn: 'Membership / Community Care',  labelBn: 'সদস্যপদ / কমিউনিটি কেয়ার', sortOrder: 3 },
  { slug: 'donation',             labelEn: 'Donation',                     labelBn: 'অনুদান',                   sortOrder: 4 },
  { slug: 'media-partnership',    labelEn: 'Media / Partnership',          labelBn: 'মিডিয়া / অংশীদারিত্ব',   sortOrder: 5 },
  { slug: 'technical-support',    labelEn: 'Technical Support',            labelBn: 'টেকনিক্যাল সাপোর্ট',      sortOrder: 6 },
  { slug: 'animal-welfare',       labelEn: 'Emergency / Animal Welfare',   labelBn: 'জরুরি / পশু কল্যাণ',      sortOrder: 7 },
  { slug: 'volunteer',            labelEn: 'Volunteer / Event',            labelBn: 'স্বেচ্ছাসেবী / ইভেন্ট',   sortOrder: 8 },
  { slug: 'feedback',             labelEn: 'Feedback / Complaint',         labelBn: 'মতামত / অভিযোগ',           sortOrder: 9 },
];

export async function seedContactInquiryConfig(prisma: PrismaClient) {
  let typesCreated = 0;
  let typesSkipped = 0;
  for (const t of CONTACT_TYPES) {
    const existing = await prisma.contactType.findUnique({ where: { slug: t.slug } });
    if (existing) {
      typesSkipped++;
    } else {
      await prisma.contactType.create({ data: { ...t, isActive: true } });
      typesCreated++;
    }
  }

  let categoriesCreated = 0;
  let categoriesSkipped = 0;
  for (const c of INQUIRY_CATEGORIES) {
    const existing = await prisma.inquiryCategory.findUnique({ where: { slug: c.slug } });
    if (existing) {
      categoriesSkipped++;
    } else {
      await prisma.inquiryCategory.create({ data: { ...c, isActive: true } });
      categoriesCreated++;
    }
  }

  return {
    types: { created: typesCreated, skipped: typesSkipped },
    categories: { created: categoriesCreated, skipped: categoriesSkipped },
  };
}
