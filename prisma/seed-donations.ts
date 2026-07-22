/**
 * Donation module seed script.
 *
 * Run:  npx ts-node -r dotenv/config prisma/seed-donations.ts
 * Or:   npm run seed:donations
 *
 * Safe to re-run — all operations use upsert / create-if-not-exists.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── 1. DonationPageSetting ───────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    questionEn: 'Is my donation tax-deductible?',
    questionBn: 'আমার দান কি করমুক্ত?',
    answerEn:
      'BPA is a registered non-profit animal welfare organization in Bangladesh. Please consult your tax advisor regarding deductibility in your jurisdiction.',
    answerBn:
      'বিপিএ বাংলাদেশে একটি নিবন্ধিত অলাভজনক পশু কল্যাণ সংস্থা। আপনার দেশের কর-সংক্রান্ত নিয়ম সম্পর্কে আপনার কর উপদেষ্টার সাথে পরামর্শ করুন।',
  },
  {
    questionEn: 'How is my donation used?',
    questionBn: 'আমার দান কীভাবে ব্যবহার করা হয়?',
    answerEn:
      'Your donation is split across our core programs: 45% veterinary care & treatment, 25% food & nutrition support, 20% rescue operations, and 10% administration & operations. A quarterly transparency report is published on our website.',
    answerBn:
      'আপনার দান আমাদের মূল কর্মসূচিগুলিতে ভাগ করা হয়: ৪৫% ভেটেরিনারি সেবা ও চিকিৎসা, ২৫% খাদ্য ও পুষ্টি সহায়তা, ২০% উদ্ধার অভিযান এবং ১০% প্রশাসন ও পরিচালনা।',
  },
  {
    questionEn: 'Will I receive a receipt for my donation?',
    questionBn: 'আমি কি আমার দানের রসিদ পাব?',
    answerEn:
      'Yes. Immediately after your payment is confirmed, an official receipt with a unique reference number and QR verification code will be sent to your email. You can also download a PDF receipt anytime from the thank-you page.',
    answerBn:
      'হ্যাঁ। আপনার পেমেন্ট নিশ্চিত হওয়ার পরপরই একটি অনন্য রেফারেন্স নম্বর ও কিউআর যাচাই কোড সহ একটি অফিসিয়াল রসিদ আপনার ইমেইলে পাঠানো হবে।',
  },
  {
    questionEn: 'Can I donate anonymously?',
    questionBn: 'আমি কি বেনামে দান করতে পারি?',
    answerEn:
      'Absolutely. Select the "Donate Anonymously" option at checkout. Your name will not appear on the donor wall or in any public communications. You will still receive a private receipt.',
    answerBn:
      'অবশ্যই। পেমেন্টের সময় "বেনামে দান করুন" বিকল্পটি নির্বাচন করুন। আপনার নাম ডোনার ওয়ালে বা কোনো পাবলিক যোগাযোগে প্রদর্শিত হবে না।',
  },
  {
    questionEn: 'Is it safe to donate online?',
    questionBn: 'অনলাইনে দান করা কি নিরাপদ?',
    answerEn:
      'Yes. All transactions are processed securely through EPS (Electronic Payment System), Bangladesh\'s certified payment gateway. We do not store your card or payment details.',
    answerBn:
      'হ্যাঁ। সমস্ত লেনদেন বাংলাদেশের সার্টিফাইড পেমেন্ট গেটওয়ে ইপিএস (ইলেকট্রনিক পেমেন্ট সিস্টেম) এর মাধ্যমে নিরাপদে প্রক্রিয়া করা হয়।',
  },
  {
    questionEn: 'Can I donate for a specific campaign?',
    questionBn: 'আমি কি একটি নির্দিষ্ট ক্যাম্পেইনের জন্য দান করতে পারি?',
    answerEn:
      'Yes. Select any active campaign from the campaign section, and your donation will be directed exclusively to that campaign\'s goal.',
    answerBn:
      'হ্যাঁ। ক্যাম্পেইন বিভাগ থেকে যেকোনো সক্রিয় ক্যাম্পেইন নির্বাচন করুন এবং আপনার দান সেই ক্যাম্পেইনের লক্ষ্যমাত্রায় পরিচালিত হবে।',
  },
  {
    questionEn: 'What payment methods are accepted?',
    questionBn: 'কোন পেমেন্ট পদ্ধতি গ্রহণ করা হয়?',
    answerEn:
      'We accept all major payment methods through EPS: bKash, Nagad, Rocket, credit/debit cards (Visa, Mastercard), and bank transfers. More options may be available at checkout.',
    answerBn:
      'আমরা ইপিএসের মাধ্যমে সমস্ত প্রধান পেমেন্ট পদ্ধতি গ্রহণ করি: বিকাশ, নগদ, রকেট, ক্রেডিট/ডেবিট কার্ড (ভিসা, মাস্টারকার্ড) এবং ব্যাংক ট্রান্সফার।',
  },
];

async function seedPageSettings() {
  console.log('  Seeding DonationPageSetting...');

  const existing = await prisma.donationPageSetting.findFirst();
  if (existing) {
    await prisma.donationPageSetting.update({
      where: { id: existing.id },
      data: {
        heroTitleEn: 'Give Hope to Street Animals',
        heroTitleBn: 'পথ-প্রাণীদের আশার আলো দিন',
        heroSubtitleEn:
          'Your donation funds life-saving veterinary care, daily feeding, emergency rescue, and vaccination programs for thousands of animals across Bangladesh.',
        heroSubtitleBn:
          'আপনার দান বাংলাদেশ জুড়ে হাজার হাজার প্রাণীর জন্য জীবনরক্ষাকারী ভেটেরিনারি সেবা, দৈনন্দিন খাওয়ানো, জরুরি উদ্ধার এবং টিকাদান কর্মসূচি পরিচালনা করে।',
        primaryCtaTextEn: 'Donate Now',
        primaryCtaTextBn: 'এখনই দান করুন',
        secondaryCtaTextEn: 'See How It Works',
        secondaryCtaTextBn: 'কীভাবে কাজ করে দেখুন',
        goalAmount: 5000000,
        showImpactCounters: true,
        showPurposeCards: true,
        showCampaigns: true,
        showImpactStories: true,
        showDonorWall: true,
        showTransparency: true,
        showQrSection: true,
        faqJson: FAQ_ITEMS,
        seoTitle: 'Donate to Help Street Animals — Bangladesh Pet Association',
        seoDescription:
          'Support BPA\'s mission to rescue, vaccinate, feed, and provide emergency veterinary care for street animals across Bangladesh. Every taka counts.',
        isActive: true,
      },
    });
    console.log('    ✓ Updated existing DonationPageSetting');
  } else {
    await prisma.donationPageSetting.create({
      data: {
        heroTitleEn: 'Give Hope to Street Animals',
        heroTitleBn: 'পথ-প্রাণীদের আশার আলো দিন',
        heroSubtitleEn:
          'Your donation funds life-saving veterinary care, daily feeding, emergency rescue, and vaccination programs for thousands of animals across Bangladesh.',
        heroSubtitleBn:
          'আপনার দান বাংলাদেশ জুড়ে হাজার হাজার প্রাণীর জন্য জীবনরক্ষাকারী ভেটেরিনারি সেবা, দৈনন্দিন খাওয়ানো, জরুরি উদ্ধার এবং টিকাদান কর্মসূচি পরিচালনা করে।',
        primaryCtaTextEn: 'Donate Now',
        primaryCtaTextBn: 'এখনই দান করুন',
        secondaryCtaTextEn: 'See How It Works',
        secondaryCtaTextBn: 'কীভাবে কাজ করে দেখুন',
        goalAmount: 5000000,
        showImpactCounters: true,
        showPurposeCards: true,
        showCampaigns: true,
        showImpactStories: true,
        showDonorWall: true,
        showTransparency: true,
        showQrSection: true,
        faqJson: FAQ_ITEMS,
        seoTitle: 'Donate to Help Street Animals — Bangladesh Pet Association',
        seoDescription:
          'Support BPA\'s mission to rescue, vaccinate, feed, and provide emergency veterinary care for street animals across Bangladesh. Every taka counts.',
        isActive: true,
      },
    });
    console.log('    ✓ Created DonationPageSetting');
  }
}

// ─── 2. Donation Purposes ─────────────────────────────────────────────────────

const PURPOSES = [
  {
    titleEn: 'Street Animal Vaccination',
    titleBn: 'পথ-প্রাণী টিকাদান',
    slug: 'street-animal-vaccination',
    icon: 'solar:syringe-bold-duotone',
    shortDescriptionEn:
      'Fund mass vaccination drives for street dogs and cats against rabies, distemper, parvovirus, and more.',
    shortDescriptionBn:
      'রেবিজ, ডিস্টেম্পার, পারভোভাইরাস এবং আরও অনেক রোগের বিরুদ্ধে পথ-কুকুর ও বিড়ালদের জন্য গণ টিকাদান অভিযানে অর্থায়ন করুন।',
    impactTextEn: '৳500 vaccinates 5 street animals against rabies.',
    impactTextBn: '৳৫০০ রেবিজের বিরুদ্ধে ৫টি পথ-প্রাণীকে টিকা দেয়।',
    suggestedAmounts: [200, 500, 1000, 2500, 5000],
    sortOrder: 1,
  },
  {
    titleEn: 'Food Support',
    titleBn: 'খাদ্য সহায়তা',
    slug: 'food-support',
    icon: 'solar:bowl-spoon-bold-duotone',
    shortDescriptionEn:
      'Provide daily nutritional meals to abandoned and stray dogs and cats across Dhaka and beyond.',
    shortDescriptionBn:
      'ঢাকা ও আশেপাশে পরিত্যক্ত এবং পথ-কুকুর ও বিড়ালদের প্রতিদিনের পুষ্টিকর খাবার সরবরাহ করুন।',
    impactTextEn: '৳300 feeds 10 street animals for one day.',
    impactTextBn: '৳৩০০ একদিনের জন্য ১০টি পথ-প্রাণীকে খাওয়ায়।',
    suggestedAmounts: [100, 300, 500, 1000, 3000],
    sortOrder: 2,
  },
  {
    titleEn: 'Rescue & Emergency Treatment',
    titleBn: 'উদ্ধার ও জরুরি চিকিৎসা',
    slug: 'rescue-emergency-treatment',
    icon: 'solar:ambulance-bold-duotone',
    shortDescriptionEn:
      'Support emergency rescue operations and urgent medical treatment for injured and critically ill street animals.',
    shortDescriptionBn:
      'আহত এবং গুরুতর অসুস্থ পথ-প্রাণীদের জরুরি উদ্ধার অভিযান এবং জরুরি চিকিৎসা সহায়তা করুন।',
    impactTextEn: '৳1,000 covers one emergency rescue and initial treatment.',
    impactTextBn: '৳১,০০০ একটি জরুরি উদ্ধার ও প্রাথমিক চিকিৎসা বহন করে।',
    suggestedAmounts: [500, 1000, 2500, 5000, 10000],
    sortOrder: 3,
  },
  {
    titleEn: 'Spay / Neuter Program',
    titleBn: 'স্পে / নিউটার প্রোগ্রাম',
    slug: 'spay-neuter-program',
    icon: 'solar:scissors-bold-duotone',
    shortDescriptionEn:
      'Fund spay and neuter surgeries to humanely control the street animal population and reduce suffering.',
    shortDescriptionBn:
      'পথ-প্রাণীর সংখ্যা মানবিকভাবে নিয়ন্ত্রণ করতে এবং কষ্ট কমাতে স্পে ও নিউটার অস্ত্রোপচারে অর্থায়ন করুন।',
    impactTextEn: '৳2,000 covers one spay or neuter surgery.',
    impactTextBn: '৳২,০০০ একটি স্পে বা নিউটার অস্ত্রোপচারের খরচ বহন করে।',
    suggestedAmounts: [500, 1000, 2000, 5000, 10000],
    sortOrder: 4,
  },
  {
    titleEn: 'Rescue Team Support',
    titleBn: 'উদ্ধার দল সহায়তা',
    slug: 'rescue-team-support',
    icon: 'solar:users-group-two-rounded-bold-duotone',
    shortDescriptionEn:
      'Equip and support BPA volunteer rescue teams with transport, protective gear, and medical supplies.',
    shortDescriptionBn:
      'বিপিএ স্বেচ্ছাসেবক উদ্ধার দলগুলিকে পরিবহন, সুরক্ষামূলক সরঞ্জাম এবং চিকিৎসা সামগ্রী দিয়ে সজ্জিত ও সহায়তা করুন।',
    impactTextEn: '৳500 funds one rescue team field operation.',
    impactTextBn: '৳৫০০ একটি উদ্ধার দলের মাঠ অভিযানে অর্থায়ন করে।',
    suggestedAmounts: [200, 500, 1000, 2500, 5000],
    sortOrder: 5,
  },
  {
    titleEn: '24/7 Emergency Clinic Fund',
    titleBn: '২৪/৭ জরুরি ক্লিনিক ফান্ড',
    slug: 'emergency-clinic-fund',
    icon: 'solar:hospital-bold-duotone',
    shortDescriptionEn:
      'Help establish and operate BPA\'s round-the-clock community veterinary clinics across Dhaka.',
    shortDescriptionBn:
      'ঢাকা জুড়ে বিপিএ-র সার্বক্ষণিক কমিউনিটি ভেটেরিনারি ক্লিনিক স্থাপন ও পরিচালনায় সহায়তা করুন।',
    impactTextEn: '৳5,000 contributes to one day of 24/7 clinic operations.',
    impactTextBn: '৳৫,০০০ ২৪/৭ ক্লিনিক পরিচালনার একদিনে অবদান রাখে।',
    suggestedAmounts: [1000, 2500, 5000, 10000, 25000],
    sortOrder: 6,
  },
  {
    titleEn: 'General Animal Welfare Fund',
    titleBn: 'সাধারণ পশু কল্যাণ তহবিল',
    slug: 'general-animal-welfare-fund',
    icon: 'solar:heart-bold-duotone',
    shortDescriptionEn:
      'Support BPA\'s overall mission — funds are allocated to wherever the need is greatest at any given time.',
    shortDescriptionBn:
      'বিপিএ-র সামগ্রিক লক্ষ্য সমর্থন করুন — যেকোনো সময় সবচেয়ে বেশি প্রয়োজন সেখানে তহবিল বরাদ্দ করা হয়।',
    impactTextEn: 'Every taka goes directly to animal care programs.',
    impactTextBn: 'প্রতিটি টাকা সরাসরি পশু সেবা কর্মসূচিতে যায়।',
    suggestedAmounts: [100, 300, 500, 1000, 5000],
    sortOrder: 7,
  },
];

async function seedPurposes() {
  console.log('  Seeding donation purposes...');
  const ids: Record<string, string> = {};

  for (const p of PURPOSES) {
    const record = await prisma.donationPurpose.upsert({
      where: { slug: p.slug },
      update: {
        titleEn: p.titleEn,
        titleBn: p.titleBn,
        shortDescriptionEn: p.shortDescriptionEn,
        shortDescriptionBn: p.shortDescriptionBn,
        icon: p.icon,
        impactTextEn: p.impactTextEn,
        impactTextBn: p.impactTextBn,
        suggestedAmounts: p.suggestedAmounts,
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        titleEn: p.titleEn,
        titleBn: p.titleBn,
        slug: p.slug,
        shortDescriptionEn: p.shortDescriptionEn,
        shortDescriptionBn: p.shortDescriptionBn,
        icon: p.icon,
        impactTextEn: p.impactTextEn,
        impactTextBn: p.impactTextBn,
        suggestedAmounts: p.suggestedAmounts,
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });
    ids[p.slug] = record.id;
    console.log(`    ✓ ${p.titleEn}`);
  }

  return ids;
}

// ─── 3. Campaigns ─────────────────────────────────────────────────────────────

async function seedCampaigns(purposeIds: Record<string, string>) {
  console.log('  Seeding donation campaigns...');

  const campaigns = [
    {
      titleEn: 'Street Animal Vaccination Fund 2026',
      titleBn: 'পথ-প্রাণী টিকাদান তহবিল ২০২৬',
      slug: 'street-animal-vaccination-fund-2026',
      descriptionEn:
        'Our flagship 2026 vaccination drive aims to vaccinate 10,000 street animals across 8 zones of Dhaka against rabies, distemper, and parvovirus. '
        + 'Every ৳500 donated protects 5 animals. Join us in building a disease-free community for pets and people alike.',
      descriptionBn:
        'আমাদের ২০২৬ সালের প্রধান টিকাদান অভিযানের লক্ষ্য হল ঢাকার ৮টি জোন জুড়ে রেবিজ, ডিস্টেম্পার ও পারভোভাইরাসের বিরুদ্ধে ১০,০০০ পথ-প্রাণীকে টিকা দেওয়া।',
      goalAmount: 2500000,
      defaultAmount: 500,
      suggestedAmounts: [200, 500, 1000, 2500, 5000],
      status: 'ACTIVE' as const,
      purposeSlug: 'street-animal-vaccination',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      allowCustomAmount: true,
      showOnDonatePage: true,
    },
    {
      titleEn: 'Emergency Rescue Treatment Fund',
      titleBn: 'জরুরি উদ্ধার চিকিৎসা তহবিল',
      slug: 'emergency-rescue-treatment-fund',
      descriptionEn:
        'Street animals face life-threatening injuries every day — hit by vehicles, attacked by predators, or abandoned while sick. '
        + 'This fund ensures our rescue teams can respond immediately and provide critical emergency veterinary care with no delay.',
      descriptionBn:
        'পথ-প্রাণীরা প্রতিদিন জীবন-হুমকির আঘাতের মুখোমুখি হয় — যানবাহনে আঘাত পায়, শিকারীদের দ্বারা আক্রান্ত হয় বা অসুস্থ অবস্থায় পরিত্যক্ত হয়।',
      goalAmount: 1500000,
      defaultAmount: 1000,
      suggestedAmounts: [500, 1000, 2500, 5000, 10000],
      status: 'ACTIVE' as const,
      purposeSlug: 'rescue-emergency-treatment',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      allowCustomAmount: true,
      showOnDonatePage: true,
    },
    {
      titleEn: 'Food for Street Animals',
      titleBn: 'পথ-প্রাণীদের জন্য খাদ্য',
      slug: 'food-for-street-animals',
      descriptionEn:
        'Hundreds of stray dogs and cats across Dhaka go hungry every day. Our volunteer feeders operate daily feeding stations '
        + 'in 15 locations across the city. Your donation directly provides nutritional dry and wet food to animals in need.',
      descriptionBn:
        'ঢাকা জুড়ে শত শত পথ-কুকুর ও বিড়াল প্রতিদিন অনাহারে থাকে। আমাদের স্বেচ্ছাসেবক ফিডাররা শহরের ১৫টি স্থানে দৈনিক খাদ্য কেন্দ্র পরিচালনা করে।',
      goalAmount: 800000,
      defaultAmount: 300,
      suggestedAmounts: [100, 300, 500, 1000, 3000],
      status: 'ACTIVE' as const,
      purposeSlug: 'food-support',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      allowCustomAmount: true,
      showOnDonatePage: true,
    },
    {
      titleEn: 'BPA 24/7 Animal Clinic Fund',
      titleBn: 'বিপিএ ২৪/৭ পশু ক্লিনিক তহবিল',
      slug: 'bpa-24-7-animal-clinic-fund',
      descriptionEn:
        'Help us establish Dhaka\'s first round-the-clock community veterinary clinic. Our goal is to open the pilot clinic in the zone '
        + 'with the highest community demand, providing free or heavily subsidised care to street animals and affordable care to low-income pet owners.',
      descriptionBn:
        'ঢাকার প্রথম সার্বক্ষণিক কমিউনিটি ভেটেরিনারি ক্লিনিক স্থাপনে আমাদের সাহায্য করুন। আমাদের লক্ষ্য হল সর্বোচ্চ কমিউনিটি চাহিদার জোনে পাইলট ক্লিনিক খোলা।',
      goalAmount: 5000000,
      defaultAmount: 5000,
      suggestedAmounts: [1000, 2500, 5000, 10000, 25000],
      status: 'ACTIVE' as const,
      purposeSlug: 'emergency-clinic-fund',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      allowCustomAmount: true,
      showOnDonatePage: true,
    },
  ];

  const ids: Record<string, string> = {};

  for (const c of campaigns) {
    const purposeId = purposeIds[c.purposeSlug] ?? null;
    const { purposeSlug, ...data } = c;

    const record = await prisma.donationCampaign.upsert({
      where: { slug: data.slug },
      update: {
        titleEn: data.titleEn,
        titleBn: data.titleBn,
        descriptionEn: data.descriptionEn,
        descriptionBn: data.descriptionBn,
        goalAmount: data.goalAmount,
        defaultAmount: data.defaultAmount,
        suggestedAmounts: data.suggestedAmounts,
        status: data.status,
        purposeId,
        endDate: data.endDate,
        allowCustomAmount: data.allowCustomAmount,
        showOnDonatePage: data.showOnDonatePage,
      },
      create: {
        titleEn: data.titleEn,
        titleBn: data.titleBn,
        slug: data.slug,
        descriptionEn: data.descriptionEn,
        descriptionBn: data.descriptionBn,
        goalAmount: data.goalAmount,
        defaultAmount: data.defaultAmount,
        suggestedAmounts: data.suggestedAmounts,
        status: data.status,
        purposeId,
        startDate: data.startDate,
        endDate: data.endDate,
        allowCustomAmount: data.allowCustomAmount,
        showOnDonatePage: data.showOnDonatePage,
      },
    });
    ids[c.slug] = record.id;
    console.log(`    ✓ ${c.titleEn}`);
  }

  return ids;
}

// ─── 4. Impact Stories ────────────────────────────────────────────────────────

async function seedImpactStories(
  purposeIds: Record<string, string>,
  campaignIds: Record<string, string>,
) {
  console.log('  Seeding impact stories...');

  // Note: image URLs are left as undefined — real images should be uploaded via the admin panel.
  // Set status to PUBLISHED so they appear on the website; change to DRAFT if you need review first.
  const stories = [
    {
      titleEn: 'Lucky Survived a Road Accident in Mirpur',
      titleBn: 'মিরপুরে সড়ক দুর্ঘটনায় ভাগ্যবান বেঁচে গেল',
      slug: 'lucky-survived-road-accident-mirpur',
      storyType: 'RESCUE' as const,
      location: 'Mirpur, Dhaka',
      animalType: 'dog',
      shortDescriptionEn:
        'Lucky, a 2-year-old stray dog, was found unconscious on the road after being hit by a vehicle. BPA volunteers rushed him to emergency care.',
      shortDescriptionBn:
        'লাকি, একটি ২ বছর বয়সী পথ-কুকুর, যানবাহনের ধাক্কায় রাস্তায় অজ্ঞান অবস্থায় পাওয়া গিয়েছিল।',
      fullStoryEn:
        'In March 2026, BPA\'s hotline received a call from a resident of Mirpur Section 10 reporting a badly injured stray dog on the roadside. '
        + 'Our rescue team arrived within 20 minutes. Lucky — as we named him — had a fractured leg and internal bruising. '
        + 'He was rushed to our partner veterinary clinic where emergency surgery was performed. '
        + 'After three weeks of intensive care, Lucky made a full recovery and was adopted by a loving family in Gulshan. '
        + 'His story is a reminder of why your donations to our Emergency Rescue Treatment Fund matter every single day.',
      fullStoryBn:
        '২০২৬ সালের মার্চ মাসে, বিপিএ-র হটলাইনে মিরপুর সেকশন ১০-এর একজন বাসিন্দার কাছ থেকে রাস্তার পাশে একটি গুরুতর আহত পথ-কুকুরের খবর পাওয়া যায়। '
        + 'আমাদের উদ্ধার দল ২০ মিনিটের মধ্যে পৌঁছায়। লাকি — যেমন আমরা তাকে নাম দিয়েছিলাম — এর একটি ভাঙা পা এবং অভ্যন্তরীণ আঘাত ছিল।',
      costUsed: 4500,
      storyDate: new Date('2026-03-15'),
      purposeSlug: 'rescue-emergency-treatment',
      campaignSlug: 'emergency-rescue-treatment-fund',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
    {
      titleEn: '200 Street Dogs Vaccinated in Uttara in a Single Day',
      titleBn: 'একদিনে উত্তরায় ২০০ পথ-কুকুরকে টিকা দেওয়া হল',
      slug: '200-dogs-vaccinated-uttara',
      storyType: 'VACCINATION' as const,
      location: 'Uttara, Dhaka',
      animalType: 'dog',
      shortDescriptionEn:
        'BPA\'s largest single-day vaccination drive in early 2026 — 200 dogs protected against rabies and distemper in Uttara in just 8 hours.',
      shortDescriptionBn:
        '২০২৬ সালের শুরুতে বিপিএ-র বৃহত্তম একদিনের টিকাদান অভিযান — মাত্র ৮ ঘণ্টায় উত্তরায় ২০০টি কুকুরকে রেবিজ ও ডিস্টেম্পারের বিরুদ্ধে সুরক্ষিত করা হয়।',
      fullStoryEn:
        'On February 10, 2026, BPA deployed 12 veterinarians and 30 volunteers across 6 feeding points in Uttara. '
        + 'Working from 7 AM to 3 PM, the team administered rabies, distemper, and parvovirus vaccines to 200 street dogs. '
        + 'This was entirely funded by donations to our Street Animal Vaccination Fund. '
        + 'The Uttara Zone alone has an estimated 800 unvaccinated stray dogs — this single drive covered 25% of the zone\'s population. '
        + 'With consistent donor support, we plan to complete all 8 Dhaka zones by end of 2026.',
      fullStoryBn:
        '১০ ফেব্রুয়ারি ২০২৬ তারিখে, বিপিএ উত্তরার ৬টি খাদ্য কেন্দ্রে ১২ জন পশুচিকিৎসক ও ৩০ জন স্বেচ্ছাসেবক মোতায়েন করে। '
        + 'সকাল ৭টা থেকে বিকাল ৩টা পর্যন্ত কাজ করে, দলটি ২০০টি পথ-কুকুরকে রেবিজ, ডিস্টেম্পার ও পারভোভাইরাস ভ্যাকসিন দেয়।',
      costUsed: 25000,
      storyDate: new Date('2026-02-10'),
      purposeSlug: 'street-animal-vaccination',
      campaignSlug: 'street-animal-vaccination-fund-2026',
      status: 'PUBLISHED',
      sortOrder: 2,
    },
    {
      titleEn: 'Mimi the Cat: From Malnourished to Thriving',
      titleBn: 'বিড়াল মিমি: অপুষ্টি থেকে সুস্থ জীবনে',
      slug: 'mimi-cat-malnourished-to-thriving',
      storyType: 'FOOD' as const,
      location: 'Dhanmondi, Dhaka',
      animalType: 'cat',
      shortDescriptionEn:
        'Mimi was found severely malnourished near a restaurant in Dhanmondi. Regular feeding support from BPA helped her recover and gain a healthy weight.',
      shortDescriptionBn:
        'মিমিকে ধানমন্ডির একটি রেস্তোরাঁর কাছে গুরুতর অপুষ্টিতে পাওয়া গিয়েছিল। বিপিএ-র নিয়মিত খাদ্য সহায়তা তাকে সুস্থ হতে সাহায্য করেছে।',
      fullStoryEn:
        'Mimi was discovered by one of our feeding volunteers in Dhanmondi in January 2026. She weighed just 1.2 kg — far below the healthy range for an adult cat. '
        + 'Our feeding team began providing high-protein wet food twice daily at her location. Over six weeks, Mimi gained 800g and her fur coat transformed from dull and patchy to shiny. '
        + 'She is now a regular at our Dhanmondi feeding station and has become a beloved fixture of the neighbourhood. '
        + 'Your donations to the Food Support fund make stories like Mimi\'s possible every single day.',
      fullStoryBn:
        'মিমিকে ২০২৬ সালের জানুয়ারিতে ধানমন্ডিতে আমাদের একজন খাদ্য সরবরাহকারী স্বেচ্ছাসেবক আবিষ্কার করেন। তার ওজন মাত্র ১.২ কেজি ছিল।',
      costUsed: 1800,
      storyDate: new Date('2026-01-20'),
      purposeSlug: 'food-support',
      campaignSlug: 'food-for-street-animals',
      status: 'PUBLISHED',
      sortOrder: 3,
    },
    {
      titleEn: 'Bijoy: Post-Surgical Recovery at the Rescue Clinic',
      titleBn: 'বিজয়: উদ্ধার ক্লিনিকে অস্ত্রোপচার পরবর্তী সুস্থতা',
      slug: 'bijoy-post-surgical-recovery',
      storyType: 'TREATMENT' as const,
      location: 'Mohammadpur, Dhaka',
      animalType: 'dog',
      shortDescriptionEn:
        'Bijoy, a senior street dog from Mohammadpur, required complex abdominal surgery after ingesting a foreign object. Donor support made his treatment possible.',
      shortDescriptionBn:
        'মোহাম্মদপুরের বৃদ্ধ পথ-কুকুর বিজয়ের একটি বিদেশী বস্তু গিলে ফেলার পরে জটিল পেটের অস্ত্রোপচারের প্রয়োজন ছিল।',
      fullStoryEn:
        'Bijoy, an estimated 7-year-old male dog, was brought to BPA\'s partner clinic by residents of Mohammadpur who noticed he hadn\'t eaten in three days and was vomiting repeatedly. '
        + 'An X-ray revealed a foreign object — a piece of plastic — lodged in his intestine. '
        + 'Emergency surgery was performed within hours of arrival. The procedure took two hours and required post-operative antibiotics, pain management, and three weeks of supervised recovery. '
        + 'Bijoy is now fully recovered and has been rehomed with a family in Bashundhara Residential Area. '
        + 'The total cost of his treatment was ৳8,200 — fully covered by our Emergency Rescue Treatment Fund.',
      fullStoryBn:
        'বিজয়, আনুমানিক ৭ বছর বয়সী পুরুষ কুকুর, মোহাম্মদপুরের বাসিন্দারা তাকে বিপিএ-র পার্টনার ক্লিনিকে নিয়ে আসে যখন লক্ষ্য করে সে তিন দিন ধরে খায়নি।',
      costUsed: 8200,
      storyDate: new Date('2026-04-05'),
      purposeSlug: 'rescue-emergency-treatment',
      campaignSlug: 'emergency-rescue-treatment-fund',
      status: 'PUBLISHED',
      sortOrder: 4,
    },
  ];

  for (const s of stories) {
    const purposeId = purposeIds[s.purposeSlug] ?? null;
    const campaignId = campaignIds[s.campaignSlug] ?? null;
    const { purposeSlug, campaignSlug, ...data } = s;

    const existing = await prisma.donationImpactStory.findUnique({ where: { slug: data.slug } });
    if (existing) {
      await prisma.donationImpactStory.update({
        where: { slug: data.slug },
        data: {
          titleEn: data.titleEn,
          titleBn: data.titleBn,
          storyType: data.storyType,
          location: data.location,
          animalType: data.animalType,
          shortDescriptionEn: data.shortDescriptionEn,
          shortDescriptionBn: data.shortDescriptionBn,
          fullStoryEn: data.fullStoryEn,
          fullStoryBn: data.fullStoryBn,
          costUsed: data.costUsed,
          storyDate: data.storyDate,
          status: data.status,
          showOnDonationPage: true,
          sortOrder: data.sortOrder,
          purposeId,
          campaignId,
        },
      });
      console.log(`    ✓ (updated) ${data.titleEn}`);
    } else {
      await prisma.donationImpactStory.create({
        data: {
          titleEn: data.titleEn,
          titleBn: data.titleBn,
          slug: data.slug,
          storyType: data.storyType,
          location: data.location,
          animalType: data.animalType,
          shortDescriptionEn: data.shortDescriptionEn,
          shortDescriptionBn: data.shortDescriptionBn,
          fullStoryEn: data.fullStoryEn,
          fullStoryBn: data.fullStoryBn,
          costUsed: data.costUsed,
          storyDate: data.storyDate,
          status: data.status,
          showOnDonationPage: true,
          sortOrder: data.sortOrder,
          purposeId,
          campaignId,
        },
      });
      console.log(`    ✓ ${data.titleEn}`);
    }
  }
}

// ─── 5. QR Codes (tracking) ───────────────────────────────────────────────────

async function seedQrCodes(
  purposeIds: Record<string, string>,
  campaignIds: Record<string, string>,
) {
  console.log('  Seeding QR codes...');

  const baseUrl = process.env.FRONTEND_URL ?? 'https://bdpetassociation.org';

  const qrCodes = [
    {
      name: 'General Donation QR',
      slug: 'general-donation',
      source: 'general',
      targetUrl: `${baseUrl}/donate`,
      purposeSlug: null,
      campaignSlug: null,
    },
    {
      name: 'Vaccination Fund 2026 — Event Banner',
      slug: 'vaccination-2026-event',
      source: 'event-banner',
      targetUrl: `${baseUrl}/donate?campaign=street-animal-vaccination-fund-2026#donate-form`,
      purposeSlug: null,
      campaignSlug: 'street-animal-vaccination-fund-2026',
    },
    {
      name: 'Emergency Rescue Fund — Clinic Poster',
      slug: 'rescue-fund-clinic-poster',
      source: 'clinic-poster',
      targetUrl: `${baseUrl}/donate?campaign=emergency-rescue-treatment-fund#donate-form`,
      purposeSlug: null,
      campaignSlug: 'emergency-rescue-treatment-fund',
    },
    {
      name: '24/7 Clinic Fund — Social Media',
      slug: 'clinic-fund-social',
      source: 'social-media',
      targetUrl: `${baseUrl}/donate?campaign=bpa-24-7-animal-clinic-fund#donate-form`,
      purposeSlug: null,
      campaignSlug: 'bpa-24-7-animal-clinic-fund',
    },
  ];

  for (const q of qrCodes) {
    const purposeId = q.purposeSlug ? (purposeIds[q.purposeSlug] ?? null) : null;
    const campaignId = q.campaignSlug ? (campaignIds[q.campaignSlug] ?? null) : null;

    const existing = await prisma.donationQrCode.findUnique({ where: { slug: q.slug } });
    if (!existing) {
      await prisma.donationQrCode.create({
        data: {
          name: q.name,
          slug: q.slug,
          source: q.source,
          targetUrl: q.targetUrl,
          purposeId,
          campaignId,
          isActive: true,
        },
      });
      console.log(`    ✓ ${q.name}`);
    } else {
      console.log(`    — (already exists) ${q.name}`);
    }
  }
}

// ─── 6. Transparency Report (demo) ───────────────────────────────────────────

async function seedTransparencyReport() {
  console.log('  Seeding transparency report (demo)...');

  const existing = await prisma.donationTransparencyReport.findFirst({
    where: { reportMonth: '2026-03' },
  });

  if (!existing) {
    await prisma.donationTransparencyReport.create({
      data: {
        reportMonth: '2026-03',
        titleEn: 'March 2026 — Quarterly Donation Utilisation Report',
        titleBn: 'মার্চ ২০২৬ — ত্রৈমাসিক দান ব্যবহার প্রতিবেদন',
        totalReceived: 385000,
        totalUsed: 312000,
        openingBalance: 48000,
        closingBalance: 121000,
        vaccinationExpense: 112000,
        foodExpense: 78000,
        treatmentExpense: 95000,
        rescueTransportExpense: 22000,
        clinicFundAllocation: 0,
        adminAndProcessingExpense: 5000,
        status: 'PUBLISHED',
      },
    });
    console.log('    ✓ March 2026 transparency report');
  } else {
    console.log('    — (already exists) March 2026 transparency report');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' BPA Donation Module — Seed Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  await seedPageSettings();
  console.log('');

  const purposeIds = await seedPurposes();
  console.log('');

  const campaignIds = await seedCampaigns(purposeIds);
  console.log('');

  await seedImpactStories(purposeIds, campaignIds);
  console.log('');

  await seedQrCodes(purposeIds, campaignIds);
  console.log('');

  await seedTransparencyReport();
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Donation seed complete.');
  console.log(`  Purposes : ${PURPOSES.length}`);
  console.log(`  Campaigns: 4 (all ACTIVE)`);
  console.log(`  Stories  : 4 (all PUBLISHED)`);
  console.log(`  QR codes : 4`);
  console.log(`  FAQ items: ${FAQ_ITEMS.length}`);
  console.log('  Transparency: 1 (March 2026, PUBLISHED)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  Next steps:');
  console.log('  • Add campaign/story images via the Admin panel → Donations');
  console.log('  • Set FRONTEND_URL in .env before running to embed correct QR target URLs');
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
