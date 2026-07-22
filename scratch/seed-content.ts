import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find a user to act as creator (e.g. an admin or super admin)
  const user = await prisma.user.findFirst({
    where: { role: 'super_admin' }
  }) || await prisma.user.findFirst();

  if (!user) {
    console.error("No user found in database. Seed user first.");
    return;
  }

  // Create categories
  const catTips = await prisma.contentCategory.upsert({
    where: { slug: 'pet-care-tips' },
    update: {},
    create: {
      nameEn: 'Pet Care Tips',
      nameBn: 'পোষা প্রাণীর যত্ন',
      slug: 'pet-care-tips',
      description: 'Useful tips for taking care of your pets'
    }
  });

  const catUpdates = await prisma.contentCategory.upsert({
    where: { slug: 'campaign-updates' },
    update: {},
    create: {
      nameEn: 'Campaign Updates',
      nameBn: 'ক্যাম্পেইন আপডেট',
      slug: 'campaign-updates',
      description: 'Latest updates on BPA campaigns'
    }
  });

  // Create content posts
  // 1. Featured Video
  await prisma.contentPost.upsert({
    where: { slug: 'how-to-vaccinate-your-cat' },
    update: {},
    create: {
      type: 'VIDEO',
      titleEn: 'How to Vaccinate Your Cat: Complete Guide',
      titleBn: 'বিড়ালকে টিকা দেওয়ার সম্পূর্ণ নির্দেশিকা',
      slug: 'how-to-vaccinate-your-cat',
      summaryEn: 'Learn the proper schedule and vaccines needed to protect your feline friend.',
      summaryBn: 'আপনার বিড়ালকে সুরক্ষিত রাখতে সঠিক সময়সূচী এবং প্রয়োজনীয় টিকা সম্পর্কে জানুন।',
      bodyEn: '<p>Vaccinating your cat is one of the most important things you can do to ensure they live a long, healthy life. From rabies to feline distemper, vaccines protect cats from common and serious illnesses.</p><h3>Why Vaccinate?</h3><p>Vaccinations prevent diseases that can be easily spread between animals, some of which can be fatal. It also protects your family from zoonotic diseases like rabies.</p>',
      bodyBn: '<p>বিড়ালকে টিকা দেওয়া তাদের দীর্ঘ ও সুস্থ জীবন নিশ্চিত করার অন্যতম গুরুত্বপূর্ণ পদক্ষেপ। জলাতঙ্ক থেকে শুরু করে বিভিন্ন সংক্রামক রোগ থেকে ভ্যাক্সিন বিড়ালকে রক্ষা করে।</p>',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoProvider: 'youtube',
      status: 'published',
      showOnHomepage: true,
      isFeatured: true,
      isPinned: false,
      homepagePriority: 10,
      categoryId: catTips.id,
      createdById: user.id,
      publishedAt: new Date(),
    }
  });

  // 2. Video 2
  await prisma.contentPost.upsert({
    where: { slug: 'dhaka-mass-vaccination-drive-highlights' },
    update: {},
    create: {
      type: 'VIDEO',
      titleEn: 'Dhaka Mass Vaccination Drive 2026 - Highlights',
      titleBn: 'ঢাকা গণ টিকাদান কর্মসূচি ২০২৬ - হাইলাইটস',
      slug: 'dhaka-mass-vaccination-drive-highlights',
      summaryEn: 'Highlights from our recent vaccination drive where we vaccinated over 500 strays and pets.',
      summaryBn: 'আমাদের সাম্প্রতিক টিকাদান কর্মসূচির হাইলাইটস যেখানে আমরা ৫০০-এর বেশি প্রাণীকে টিকা দিয়েছি।',
      bodyEn: '<p>Thanks to our volunteers and community support, the 2026 Mass Vaccination campaign was a grand success!</p>',
      bodyBn: '<p>আমাদের স্বেচ্ছাসেবক এবং কমিউনিটির সহযোগিতায় টিকাদান কর্মসূচি সফলভাবে সম্পন্ন হয়েছে।</p>',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoProvider: 'youtube',
      status: 'published',
      showOnHomepage: true,
      isFeatured: false,
      isPinned: false,
      homepagePriority: 5,
      categoryId: catUpdates.id,
      createdById: user.id,
      publishedAt: new Date(),
    }
  });

  // 3. Community Post 1 (Pinned Announcement)
  await prisma.contentPost.upsert({
    where: { slug: 'bpa-community-clinic-launch-uttara' },
    update: {},
    create: {
      type: 'ANNOUNCEMENT',
      titleEn: 'New BPA Community Clinic Launching in Uttara!',
      titleBn: 'উত্তরায় নতুন বিপিএ কমিউনিটি ক্লিনিকের শুভ উদ্বোধন!',
      slug: 'bpa-community-clinic-launch-uttara',
      summaryEn: 'We are excited to announce our new 24/7 clinic zone opening in Uttara to support pet owners.',
      summaryBn: 'উত্তরা জোনে আমাদের নতুন ২৪/৭ কমিউনিটি ক্লিনিক চালুর ঘোষণা দিতে পেরে আমরা আনন্দিত।',
      bodyEn: '<p>BPA is expanding its veterinary services network to Uttara. The clinic will offer heavily subsidized care, vaccines, and emergency rescue facilities. Registered BPA members get free consultations and discounts.</p>',
      bodyBn: '<p>উত্তরায় বিপিএ-এর চিকিৎসাসেবা কার্যক্রম প্রসারিত হচ্ছে। এখানে স্বল্পমূল্যে টিকা এবং জরুরি উদ্ধার সেবা পাওয়া যাবে।</p>',
      status: 'published',
      showOnHomepage: true,
      isFeatured: true,
      isPinned: true,
      homepagePriority: 20,
      categoryId: catUpdates.id,
      createdById: user.id,
      publishedAt: new Date(),
      ctaLabelEn: 'Become a Partner',
      ctaLabelBn: 'পার্টনার হোন',
      ctaUrl: '/community-pet-care/contribute',
      ctaType: 'primary'
    }
  });

  // 4. Community Post 2 (Pet Care Tip)
  await prisma.contentPost.upsert({
    where: { slug: 'summer-care-tips-for-dogs' },
    update: {},
    create: {
      type: 'PET_CARE_TIP',
      titleEn: 'Essential Summer Care Tips for Dogs in Bangladesh',
      titleBn: 'বাংলাদেশে গ্রীষ্মকালে কুকুরের যত্নের কিছু জরুরি টিপস',
      slug: 'summer-care-tips-for-dogs',
      summaryEn: 'Keep your dogs cool and hydrated during the hot summer months with these practical tips.',
      summaryBn: 'প্রচণ্ড গরমে আপনার কুকুরকে সুস্থ ও পানিশূন্যতা মুক্ত রাখতে কিছু দরকারি পরামর্শ।',
      bodyEn: '<p>Summer in Bangladesh can be extremely humid and hot. Dogs do not sweat like humans, which makes them highly susceptible to heatstrokes. Ensure they have access to fresh water, shaded areas, and never leave them in parked cars.</p>',
      bodyBn: '<p>গ্রীষ্মের প্রচণ্ড গরমে কুকুরের হিটস্ট্রোক হতে পারে। তাদের সবসময় ঠ্যান্ডা পানি এবং ছায়াযুক্ত স্থানে রাখুন।</p>',
      status: 'published',
      showOnHomepage: true,
      isFeatured: false,
      isPinned: false,
      homepagePriority: 10,
      categoryId: catTips.id,
      createdById: user.id,
      publishedAt: new Date(),
    }
  });

  console.log("Database seeded successfully with content posts!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
