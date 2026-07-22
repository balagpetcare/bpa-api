import { PrismaClient } from '@prisma/client';

type VideoCategorySeed = Readonly<{
  nameEn: string;
  nameBn: string;
  slug: string;
  description: string;
}>;

type SeededVideoCategory = Readonly<{
  slug: string;
  nameEn: string;
  nameBn: string;
}>;

export type VideoCategorySeedResult = Readonly<{
  attempted: number;
  insertedOrUpdated: number;
  totalMatching: number;
  uniqueSlugs: number;
  duplicateSlugs: string[];
  missingSlugs: string[];
  categories: readonly SeededVideoCategory[];
}>;

export const VIDEO_CATEGORIES: readonly VideoCategorySeed[] = [
  {
    nameEn: 'Pet Care & Health',
    nameBn: 'পেট কেয়ার ও স্বাস্থ্য',
    slug: 'pet-care-health',
    description:
      'পোষা প্রাণীর দৈনন্দিন যত্ন, স্বাস্থ্য পরীক্ষা, পরিচ্ছন্নতা এবং সাধারণ স্বাস্থ্য সমস্যা সম্পর্কিত শিক্ষামূলক ভিডিও।',
  },
  {
    nameEn: 'Vaccination & Prevention',
    nameBn: 'ভ্যাকসিনেশন ও রোগ প্রতিরোধ',
    slug: 'vaccination-prevention',
    description:
      'কুকুর, বিড়াল ও অন্যান্য পোষা প্রাণীর ভ্যাকসিন, ডিওয়ার্মিং এবং প্রতিরোধমূলক স্বাস্থ্যসেবা সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Diseases, Symptoms & Treatment',
    nameBn: 'রোগ, লক্ষণ ও চিকিৎসা',
    slug: 'diseases-symptoms-treatment',
    description:
      'বিভিন্ন রোগের লক্ষণ, প্রাথমিক করণীয়, রোগ নির্ণয় এবং চিকিৎসা সম্পর্কে ভেটেরিনারি পরামর্শ।',
  },
  {
    nameEn: 'Pet Nutrition & Food',
    nameBn: 'পেট নিউট্রিশন ও খাবার',
    slug: 'pet-nutrition-food',
    description:
      'বয়স ও প্রজাতি অনুযায়ী খাবার, সুষম পুষ্টি, নিরাপদ খাবার এবং ক্ষতিকর খাবার সম্পর্কে ভিডিও।',
  },
  {
    nameEn: 'Training & Behavior',
    nameBn: 'প্রশিক্ষণ ও আচরণ',
    slug: 'training-behavior',
    description:
      'টয়লেট ট্রেনিং, সামাজিকীকরণ, আগ্রাসন, ভয় এবং পোষা প্রাণীর আচরণ নিয়ন্ত্রণ সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Grooming & Hygiene',
    nameBn: 'গ্রুমিং ও পরিচ্ছন্নতা',
    slug: 'grooming-hygiene',
    description:
      'গোসল, ব্রাশিং, নখ কাটা, কান পরিষ্কার, দাঁতের যত্ন এবং নিয়মিত গ্রুমিং সম্পর্কে নির্দেশনা।',
  },
  {
    nameEn: 'Emergency & First Aid',
    nameBn: 'জরুরি চিকিৎসা ও ফার্স্ট এইড',
    slug: 'emergency-first-aid',
    description:
      'দুর্ঘটনা, বিষক্রিয়া, রক্তপাত, শ্বাসকষ্ট এবং অন্যান্য জরুরি অবস্থায় প্রাথমিক করণীয় সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Puppy & Kitten Care',
    nameBn: 'পাপি ও কিটেন কেয়ার',
    slug: 'puppy-kitten-care',
    description:
      'নবজাতক ও অল্প বয়সী কুকুর-বিড়ালের খাবার, পরিচর্যা, ভ্যাকসিন এবং বিকাশ সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Senior Pet Care',
    nameBn: 'বয়স্ক পোষা প্রাণীর যত্ন',
    slug: 'senior-pet-care',
    description:
      'বয়স্ক পোষা প্রাণীর খাদ্য, জয়েন্ট, কিডনি, ব্যথা ব্যবস্থাপনা এবং নিয়মিত স্বাস্থ্য পরীক্ষার নির্দেশনা।',
  },
  {
    nameEn: 'Spay, Neuter & Reproductive Health',
    nameBn: 'স্পে, নিউটার ও প্রজনন স্বাস্থ্য',
    slug: 'spay-neuter-reproductive-health',
    description:
      'স্পে-নিউটার, হিট সাইকেল, গর্ভাবস্থা, প্রসব এবং দায়িত্বশীল প্রজনন সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Adoption & Rescue',
    nameBn: 'অ্যাডপশন ও রেসকিউ',
    slug: 'adoption-rescue',
    description:
      'দায়িত্বশীল অ্যাডপশন, প্রাণী উদ্ধার, পুনর্বাসন এবং নতুন পরিবারে মানিয়ে নেওয়ার বিষয়ক ভিডিও।',
  },
  {
    nameEn: 'Pet Owner Awareness',
    nameBn: 'পেট মালিক সচেতনতা',
    slug: 'pet-owner-awareness',
    description:
      'দায়িত্বশীল পোষা প্রাণী পালন, জনস্বাস্থ্য, প্রতিবেশী সচেতনতা এবং সামাজিক দায়িত্ব সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Animal Law & Welfare',
    nameBn: 'প্রাণী আইন ও কল্যাণ',
    slug: 'animal-law-welfare',
    description:
      'প্রাণীকল্যাণ, নির্যাতন প্রতিরোধ, আইনগত অধিকার এবং অভিযোগ করার পদ্ধতি সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'BPA Campaigns & Activities',
    nameBn: 'বিপিএ ক্যাম্পেইন ও কার্যক্রম',
    slug: 'bpa-campaigns-activities',
    description:
      'বাংলাদেশ পেট অ্যাসোসিয়েশনের ক্যাম্পেইন, ভ্যাকসিনেশন, সদস্যপদ, পেট সেনসাস এবং অন্যান্য কার্যক্রমের ভিডিও।',
  },
  {
    nameEn: 'Expert Advice',
    nameBn: 'বিশেষজ্ঞের পরামর্শ',
    slug: 'expert-advice',
    description:
      'ভেটেরিনারিয়ান, প্রশিক্ষক, পুষ্টিবিদ এবং অন্যান্য বিশেষজ্ঞদের সাক্ষাৎকার ও পরামর্শমূলক ভিডিও।',
  },
  {
    nameEn: 'Success Stories',
    nameBn: 'সাফল্যের গল্প',
    slug: 'success-stories',
    description:
      'সফল চিকিৎসা, প্রাণী উদ্ধার, অ্যাডপশন এবং পেট মালিকদের বাস্তব অভিজ্ঞতার অনুপ্রেরণামূলক ভিডিও।',
  },
  {
    nameEn: 'Pet Community',
    nameBn: 'পেট কমিউনিটি',
    slug: 'pet-community',
    description:
      'পেট মালিকদের সংগঠন, সামাজিক উদ্যোগ, সদস্য কার্যক্রম এবং কমিউনিটি সহযোগিতা সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Pet Industry & Economy',
    nameBn: 'পেট ইন্ডাস্ট্রি ও অর্থনীতি',
    slug: 'pet-industry-economy',
    description:
      'বাংলাদেশের পেট মার্কেট, ক্লিনিক, পেট ফুড, সেবা, কর্মসংস্থান এবং অর্থনৈতিক সম্ভাবনা সম্পর্কিত ভিডিও।',
  },
  {
    nameEn: 'Events & Webinars',
    nameBn: 'অনুষ্ঠান ও ওয়েবিনার',
    slug: 'events-webinars',
    description:
      'লাইভ আলোচনা, প্রশিক্ষণ, প্রশ্নোত্তর, সেমিনার এবং রেকর্ড করা ওয়েবিনারের ভিডিও।',
  },
  {
    nameEn: 'Entertainment & Pet Stories',
    nameBn: 'বিনোদন ও পেট স্টোরি',
    slug: 'entertainment-pet-stories',
    description:
      'পোষা প্রাণীর মজার মুহূর্ত, গল্প, প্রতিযোগিতা এবং কমিউনিটির বিনোদনমূলক ভিডিও।',
  },
];

function buildVerificationError(result: VideoCategorySeedResult): Error {
  const details = [
    `attempted=${result.attempted}`,
    `insertedOrUpdated=${result.insertedOrUpdated}`,
    `totalMatching=${result.totalMatching}`,
    `uniqueSlugs=${result.uniqueSlugs}`,
    `missingSlugs=${result.missingSlugs.join(',') || 'none'}`,
    `duplicateSlugs=${result.duplicateSlugs.join(',') || 'none'}`,
  ];

  return new Error(`Video content category seed verification failed: ${details.join(' | ')}`);
}

export async function seedVideoCategories(prisma: PrismaClient): Promise<VideoCategorySeedResult> {
  let insertedOrUpdated = 0;

  for (const category of VIDEO_CATEGORIES) {
    await prisma.contentCategory.upsert({
      where: { slug: category.slug },
      update: {
        nameEn: category.nameEn,
        nameBn: category.nameBn,
        description: category.description,
      },
      create: {
        nameEn: category.nameEn,
        nameBn: category.nameBn,
        slug: category.slug,
        description: category.description,
      },
    });
    insertedOrUpdated++;
  }

  const expectedSlugs = VIDEO_CATEGORIES.map((category) => category.slug);

  const categories = await prisma.contentCategory.findMany({
    where: {
      slug: {
        in: expectedSlugs,
      },
    },
    select: {
      slug: true,
      nameEn: true,
      nameBn: true,
    },
    orderBy: {
      slug: 'asc',
    },
  });

  const groupedSlugs = await prisma.contentCategory.groupBy({
    by: ['slug'],
    where: {
      slug: {
        in: expectedSlugs,
      },
    },
    _count: {
      slug: true,
    },
  });

  const duplicateSlugs = groupedSlugs
    .filter((item) => item._count.slug > 1)
    .map((item) => item.slug)
    .sort((a, b) => a.localeCompare(b));

  const actualSlugs = categories.map((category) => category.slug);
  const actualSlugSet = new Set(actualSlugs);
  const missingSlugs = expectedSlugs
    .filter((slug) => !actualSlugSet.has(slug))
    .sort((a, b) => a.localeCompare(b));

  const result: VideoCategorySeedResult = {
    attempted: VIDEO_CATEGORIES.length,
    insertedOrUpdated,
    totalMatching: categories.length,
    uniqueSlugs: groupedSlugs.length,
    duplicateSlugs,
    missingSlugs,
    categories,
  };

  if (
    result.totalMatching !== result.attempted ||
    result.uniqueSlugs !== result.attempted ||
    result.missingSlugs.length > 0 ||
    result.duplicateSlugs.length > 0
  ) {
    throw buildVerificationError(result);
  }

  return result;
}

export async function verifyVideoCategorySlugs(prisma: PrismaClient): Promise<VideoCategorySeedResult> {
  return seedVideoCategories(prisma);
}
