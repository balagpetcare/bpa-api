import { PrismaClient } from '@prisma/client';

const CONTACT_TYPES = [
  { slug: 'individual', labelEn: 'Individual / Personal', labelBn: 'ব্যক্তিগত', sortOrder: 1 },
  { slug: 'organization', labelEn: 'Organization / NGO', labelBn: 'সংস্থা / এনজিও', sortOrder: 2 },
  { slug: 'government-ngo', labelEn: 'Government / Public Body', labelBn: 'সরকারি প্রতিষ্ঠান', sortOrder: 3 },
  { slug: 'media', labelEn: 'Media / Press', labelBn: 'মিডিয়া / প্রেস', sortOrder: 4 },
  { slug: 'corporate', labelEn: 'Corporate / Business', labelBn: 'কর্পোরেট / ব্যবসায়', sortOrder: 5 },
  { slug: 'veterinary', labelEn: 'Veterinary / Medical', labelBn: 'ভেটেরিনারি / চিকিৎসা', sortOrder: 6 },
] as const;

const INQUIRY_CATEGORIES = [
  { slug: 'general-inquiry', labelEn: 'General Inquiry', labelBn: 'সাধারণ জিজ্ঞাসা', sortOrder: 1 },
  { slug: 'vaccination-campaign', labelEn: 'Vaccination Campaign', labelBn: 'টিকাদান ক্যাম্পেইন', sortOrder: 2 },
  { slug: 'membership-care', labelEn: 'Membership / Community Care', labelBn: 'সদস্যপদ / কমিউনিটি কেয়ার', sortOrder: 3 },
  { slug: 'donation', labelEn: 'Donation', labelBn: 'অনুদান', sortOrder: 4 },
  { slug: 'media-partnership', labelEn: 'Media / Partnership', labelBn: 'মিডিয়া / অংশীদারিত্ব', sortOrder: 5 },
  { slug: 'technical-support', labelEn: 'Technical Support', labelBn: 'টেকনিক্যাল সাপোর্ট', sortOrder: 6 },
  { slug: 'animal-welfare', labelEn: 'Emergency / Animal Welfare', labelBn: 'জরুরি / পশু কল্যাণ', sortOrder: 7 },
  { slug: 'volunteer', labelEn: 'Volunteer / Event', labelBn: 'স্বেচ্ছাসেবী / ইভেন্ট', sortOrder: 8 },
  { slug: 'feedback', labelEn: 'Feedback / Complaint', labelBn: 'মতামত / অভিযোগ', sortOrder: 9 },
] as const;

const CONTACT_DEPARTMENTS = [
  {
    slug: 'general-support',
    nameEn: 'General Support',
    nameBn: 'সাধারণ সাপোর্ট',
    description: 'Default routing for general public inquiries.',
    contactEmail: 'support@bdpetassociation.org',
    sortOrder: 1,
  },
  {
    slug: 'campaign-operations',
    nameEn: 'Campaign Operations',
    nameBn: 'ক্যাম্পেইন অপারেশন',
    description: 'Handles vaccination campaign and field-operations questions.',
    contactEmail: 'campaigns@bdpetassociation.org',
    sortOrder: 2,
  },
  {
    slug: 'membership-care',
    nameEn: 'Membership Care',
    nameBn: 'মেম্বারশিপ কেয়ার',
    description: 'Handles membership plans, benefits, and care-partner questions.',
    contactEmail: 'membership@bdpetassociation.org',
    sortOrder: 3,
  },
  {
    slug: 'donations-partnerships',
    nameEn: 'Donations & Partnerships',
    nameBn: 'অনুদান ও অংশীদারিত্ব',
    description: 'Handles donation, sponsorship, and partnership requests.',
    contactEmail: 'partnerships@bdpetassociation.org',
    sortOrder: 4,
  },
  {
    slug: 'animal-welfare-response',
    nameEn: 'Animal Welfare Response',
    nameBn: 'প্রাণী কল্যাণ রেসপন্স',
    description: 'Handles urgent animal-welfare and rescue-related issues.',
    contactEmail: 'welfare@bdpetassociation.org',
    sortOrder: 5,
  },
] as const;

const CONTACT_PRIORITY_RULES = [
  { contactTypeSlug: null, categorySlug: 'general-inquiry', priority: 'normal', departmentSlug: 'general-support', sortOrder: 1 },
  { contactTypeSlug: null, categorySlug: 'technical-support', priority: 'high', departmentSlug: 'general-support', sortOrder: 2 },
  { contactTypeSlug: null, categorySlug: 'vaccination-campaign', priority: 'high', departmentSlug: 'campaign-operations', sortOrder: 3 },
  { contactTypeSlug: null, categorySlug: 'membership-care', priority: 'normal', departmentSlug: 'membership-care', sortOrder: 4 },
  { contactTypeSlug: null, categorySlug: 'donation', priority: 'normal', departmentSlug: 'donations-partnerships', sortOrder: 5 },
  { contactTypeSlug: null, categorySlug: 'media-partnership', priority: 'high', departmentSlug: 'donations-partnerships', sortOrder: 6 },
  { contactTypeSlug: null, categorySlug: 'animal-welfare', priority: 'urgent', departmentSlug: 'animal-welfare-response', sortOrder: 7 },
  { contactTypeSlug: null, categorySlug: 'feedback', priority: 'normal', departmentSlug: 'general-support', sortOrder: 8 },
  { contactTypeSlug: 'media', categorySlug: null, priority: 'high', departmentSlug: 'donations-partnerships', sortOrder: 9 },
  { contactTypeSlug: 'veterinary', categorySlug: null, priority: 'high', departmentSlug: 'campaign-operations', sortOrder: 10 },
] as const;

export async function seedContactInquiryConfig(prisma: PrismaClient) {
  let typesCreated = 0;
  let typesSkipped = 0;

  for (const item of CONTACT_TYPES) {
    const existing = await prisma.contactType.findUnique({ where: { slug: item.slug } });
    if (existing) {
      typesSkipped++;
      continue;
    }

    await prisma.contactType.create({ data: { ...item, isActive: true } });
    typesCreated++;
  }

  let categoriesCreated = 0;
  let categoriesSkipped = 0;

  for (const item of INQUIRY_CATEGORIES) {
    const existing = await prisma.inquiryCategory.findUnique({ where: { slug: item.slug } });
    if (existing) {
      categoriesSkipped++;
      continue;
    }

    await prisma.inquiryCategory.create({ data: { ...item, isActive: true } });
    categoriesCreated++;
  }

  let departmentsUpserted = 0;
  const departmentsBySlug = new Map<string, string>();

  for (const item of CONTACT_DEPARTMENTS) {
    const row = await prisma.contactDepartment.upsert({
      where: { slug: item.slug },
      update: {
        nameEn: item.nameEn,
        nameBn: item.nameBn,
        description: item.description,
        contactEmail: item.contactEmail,
        isActive: true,
        sortOrder: item.sortOrder,
      },
      create: {
        slug: item.slug,
        nameEn: item.nameEn,
        nameBn: item.nameBn,
        description: item.description,
        contactEmail: item.contactEmail,
        isActive: true,
        sortOrder: item.sortOrder,
      },
      select: { id: true, slug: true },
    });

    departmentsBySlug.set(row.slug, row.id);
    departmentsUpserted++;
  }

  let priorityRulesUpserted = 0;

  for (const item of CONTACT_PRIORITY_RULES) {
    const departmentId = departmentsBySlug.get(item.departmentSlug);
    if (!departmentId) {
      throw new Error(`Contact priority rule references unknown department slug "${item.departmentSlug}"`);
    }

    const existing = await prisma.contactPriorityRule.findFirst({
      where: {
        contactTypeSlug: item.contactTypeSlug,
        categorySlug: item.categorySlug,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.contactPriorityRule.update({
        where: { id: existing.id },
        data: {
          priority: item.priority,
          departmentId,
          isActive: true,
          sortOrder: item.sortOrder,
        },
      });
    } else {
      await prisma.contactPriorityRule.create({
        data: {
          contactTypeSlug: item.contactTypeSlug,
          categorySlug: item.categorySlug,
          priority: item.priority,
          departmentId,
          isActive: true,
          sortOrder: item.sortOrder,
        },
      });
    }

    priorityRulesUpserted++;
  }

  return {
    types: { created: typesCreated, skipped: typesSkipped },
    categories: { created: categoriesCreated, skipped: categoriesSkipped },
    departments: { upserted: departmentsUpserted },
    priorityRules: { upserted: priorityRulesUpserted },
  };
}
