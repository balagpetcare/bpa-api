import { PrismaClient } from '@prisma/client';

const PURPOSES = [
  { titleEn: 'Street Animal Vaccination', titleBn: 'পথ-প্রাণী টিকাদান', slug: 'street-animal-vaccination', icon: 'solar:syringe-bold-duotone', shortDescriptionEn: 'Fund mass vaccination drives for street dogs and cats against rabies, distemper, parvovirus, and more.', shortDescriptionBn: 'রেবিজ, ডিস্টেম্পার, পারভোভাইরাস এবং আরও অনেক রোগের বিরুদ্ধে পথ-কুকুর ও বিড়ালদের জন্য গণ টিকাদান অভিযানে অর্থায়ন করুন।', impactTextEn: '৳500 vaccinates 5 street animals against rabies.', impactTextBn: '৳৫০০ রেবিজের বিরুদ্ধে ৫টি পথ-প্রাণীকে টিকা দেয়।', suggestedAmounts: [200, 500, 1000, 2500, 5000], sortOrder: 1 },
  { titleEn: 'Food Support', titleBn: 'খাদ্য সহায়তা', slug: 'food-support', icon: 'solar:bowl-spoon-bold-duotone', shortDescriptionEn: 'Provide daily nutritional meals to abandoned and stray dogs and cats across Dhaka and beyond.', shortDescriptionBn: 'ঢাকা ও আশেপাশে পরিত্যক্ত এবং পথ-কুকুর ও বিড়ালদের প্রতিদিনের পুষ্টিকর খাবার সরবরাহ করুন।', impactTextEn: '৳300 feeds 10 street animals for one day.', impactTextBn: '৳৩০০ একদিনের জন্য ১০টি পথ-প্রাণীকে খাওয়ায়।', suggestedAmounts: [100, 300, 500, 1000, 3000], sortOrder: 2 },
  { titleEn: 'Rescue & Emergency Treatment', titleBn: 'উদ্ধার ও জরুরি চিকিৎসা', slug: 'rescue-emergency-treatment', icon: 'solar:ambulance-bold-duotone', shortDescriptionEn: 'Support emergency rescue operations and urgent medical treatment for injured and critically ill street animals.', shortDescriptionBn: 'আহত এবং গুরুতর অসুস্থ পথ-প্রাণীদের জন্য জরুরি উদ্ধার অভিযান এবং জরুরি চিকিৎসা সহায়তা করুন।', impactTextEn: '৳1,000 covers one emergency rescue and initial treatment.', impactTextBn: '৳১,০০০ একটি জরুরি উদ্ধার ও প্রাথমিক চিকিৎসা বহন করে।', suggestedAmounts: [500, 1000, 2500, 5000, 10000], sortOrder: 3 },
  { titleEn: 'Spay / Neuter Program', titleBn: 'স্পে / নিউটার প্রোগ্রাম', slug: 'spay-neuter-program', icon: 'solar:scissors-bold-duotone', shortDescriptionEn: 'Fund spay and neuter surgeries to humanely control the street animal population and reduce suffering.', shortDescriptionBn: 'পথ-প্রাণীর সংখ্যা মানবিকভাবে নিয়ন্ত্রণ করতে এবং কষ্ট কমাতে স্পে ও নিউটার অস্ত্রোপচারে অর্থায়ন করুন।', impactTextEn: '৳2,000 covers one spay or neuter surgery.', impactTextBn: '৳২,০০০ একটি স্পে বা নিউটার অস্ত্রোপচারের খরচ বহন করে।', suggestedAmounts: [500, 1000, 2000, 5000, 10000], sortOrder: 4 },
  { titleEn: 'Rescue Team Support', titleBn: 'উদ্ধার দল সহায়তা', slug: 'rescue-team-support', icon: 'solar:users-group-two-rounded-bold-duotone', shortDescriptionEn: 'Equip and support BPA volunteer rescue teams with transport, protective gear, and medical supplies.', shortDescriptionBn: 'বিপিএ স্বেচ্ছাসেবক উদ্ধার দলগুলিকে পরিবহন, সুরক্ষামূলক সরঞ্জাম এবং চিকিৎসা সামগ্রী দিয়ে সজ্জিত ও সহায়তা করুন।', impactTextEn: '৳500 funds one rescue team field operation.', impactTextBn: '৳৫০০ একটি উদ্ধার দলের মাঠ অভিযানে অর্থায়ন করে।', suggestedAmounts: [200, 500, 1000, 2500, 5000], sortOrder: 5 },
  { titleEn: '24/7 Emergency Clinic Fund', titleBn: '২৪/৭ জরুরি ক্লিনিক ফান্ড', slug: 'emergency-clinic-fund', icon: 'solar:hospital-bold-duotone', shortDescriptionEn: 'Help establish and operate BPA\'s round-the-clock community veterinary clinics across Dhaka.', shortDescriptionBn: 'ঢাকা জুড়ে বিপিএ-র সার্বক্ষণিক কমিউনিটি ভেটেরিনারি ক্লিনিক স্থাপন ও পরিচালনায় সহায়তা করুন।', impactTextEn: '৳5,000 contributes to one day of 24/7 clinic operations.', impactTextBn: '৳৫,০০০ ২৪/৭ ক্লিনিক পরিচালনার একদিনে অবদান রাখে।', suggestedAmounts: [1000, 2500, 5000, 10000, 25000], sortOrder: 6 },
  { titleEn: 'General Animal Welfare Fund', titleBn: 'সাধারণ পশু কল্যাণ তহবিল', slug: 'general-animal-welfare-fund', icon: 'solar:heart-bold-duotone', shortDescriptionEn: 'Support BPA\'s overall mission — funds are allocated to wherever the need is greatest.', shortDescriptionBn: 'বিপিএ-র সামগ্রিক লক্ষ্য সমর্থন করুন — যেকোনো সময় সবচেয়ে বেশি প্রয়োজন সেখানে তহবিল বরাদ্দ করা হয়।', impactTextEn: 'Every taka goes directly to animal care programs.', impactTextBn: 'প্রতিটি টাকা সরাসরি পশু সেবা কর্মসূচিতে যায়।', suggestedAmounts: [100, 300, 500, 1000, 5000], sortOrder: 7 },
];

const FAQ_ITEMS = [
  { questionEn: 'Is my donation tax-deductible?', questionBn: 'আমার দান কি করমুক্ত?', answerEn: 'BPA is a registered non-profit animal welfare organization in Bangladesh. Please consult your tax advisor regarding deductibility in your jurisdiction.', answerBn: 'বিপিএ বাংলাদেশে একটি নিবন্ধিত অলাভজনক পশু কল্যাণ সংস্থা।' },
  { questionEn: 'How is my donation used?', questionBn: 'আমার দান কীভাবে ব্যবহার করা হয়?', answerEn: 'Your donation is split across our core programs: 45% veterinary care & treatment, 25% food & nutrition support, 20% rescue operations, and 10% administration & operations.', answerBn: 'আপনার দান আমাদের মূল কর্মসূচিগুলিতে ভাগ করা হয়: ৪৫% ভেটেরিনারি সেবা ও চিকিৎসা, ২৫% খাদ্য ও পুষ্টি সহায়তা, ২০% উদ্ধার অভিযান এবং ১০% প্রশাসন ও পরিচালনা।' },
  { questionEn: 'Will I receive a receipt for my donation?', questionBn: 'আমি কি আমার দানের রসিদ পাব?', answerEn: 'Yes. Immediately after your payment is confirmed, an official receipt will be sent to your email.', answerBn: 'হ্যাঁ। আপনার পেমেন্ট নিশ্চিত হওয়ার পরপরই একটি অফিসিয়াল রসিদ আপনার ইমেইলে পাঠানো হবে।' },
  { questionEn: 'Can I donate anonymously?', questionBn: 'আমি কি বেনামে দান করতে পারি?', answerEn: 'Absolutely. Select the "Donate Anonymously" option at checkout. Your name will not appear on the donor wall or in any public communications.', answerBn: 'অবশ্যই। পেমেন্টের সময় "বেনামে দান করুন" বিকল্পটি নির্বাচন করুন।' },
  { questionEn: 'Is it safe to donate online?', questionBn: 'অনলাইনে দান করা কি নিরাপদ?', answerEn: "Yes. All transactions are processed securely through EPS (Electronic Payment System), Bangladesh's certified payment gateway.", answerBn: 'হ্যাঁ। সমস্ত লেনদেন বাংলাদেশের সার্টিফাইড পেমেন্ট গেটওয়ে ইপিএসের মাধ্যমে নিরাপদে প্রক্রিয়া করা হয়।' },
  { questionEn: 'What payment methods are accepted?', questionBn: 'কোন পেমেন্ট পদ্ধতি গ্রহণ করা হয়?', answerEn: 'We accept all major payment methods through EPS: bKash, Nagad, Rocket, credit/debit cards, and bank transfers.', answerBn: 'আমরা ইপিএসের মাধ্যমে সমস্ত প্রধান পেমেন্ট পদ্ধতি গ্রহণ করি: বিকাশ, নগদ, রকেট, ক্রেডিট/ডেবিট কার্ড এবং ব্যাংক ট্রান্সফার।' },
];

export async function seedDonations(prisma: PrismaClient) {
  const counts = { purposes: 0, campaigns: 0, stories: 0, qrCodes: 0, pageSetting: 0, transparency: 0 };

  // ── 1. Donation Purposes ──────────────────────────────────────────────────
  const purposeIds: Record<string, string> = {};
  for (const p of PURPOSES) {
    const record = await prisma.donationPurpose.upsert({
      where: { slug: p.slug },
      update: { titleEn: p.titleEn, titleBn: p.titleBn, shortDescriptionEn: p.shortDescriptionEn, shortDescriptionBn: p.shortDescriptionBn, icon: p.icon, impactTextEn: p.impactTextEn, impactTextBn: p.impactTextBn, suggestedAmounts: p.suggestedAmounts, sortOrder: p.sortOrder, isActive: true },
      create: { titleEn: p.titleEn, titleBn: p.titleBn, slug: p.slug, shortDescriptionEn: p.shortDescriptionEn, shortDescriptionBn: p.shortDescriptionBn, icon: p.icon, impactTextEn: p.impactTextEn, impactTextBn: p.impactTextBn, suggestedAmounts: p.suggestedAmounts, sortOrder: p.sortOrder, isActive: true },
    });
    purposeIds[p.slug] = record.id;
    counts.purposes++;
  }

  // ── 2. Donation Campaigns ─────────────────────────────────────────────────
  const campaignDefs = [
    { titleEn: 'Street Animal Vaccination Fund 2026', titleBn: 'পথ-প্রাণী টিকাদান তহবিল ২০২৬', slug: 'street-animal-vaccination-fund-2026', descriptionEn: 'Our flagship 2026 vaccination drive aims to vaccinate 10,000 street animals across 8 zones of Dhaka against rabies, distemper, and parvovirus.', descriptionBn: 'আমাদের ২০২৬ সালের প্রধান টিকাদান অভিযানের লক্ষ্য হল ঢাকার ৮টি জোন জুড়ে ১০,০০০ পথ-প্রাণীকে টিকা দেওয়া।', goalAmount: 2500000, defaultAmount: 500, suggestedAmounts: [200, 500, 1000, 2500, 5000], purposeSlug: 'street-animal-vaccination', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
    { titleEn: 'Emergency Rescue Treatment Fund', titleBn: 'জরুরি উদ্ধার চিকিৎসা তহবিল', slug: 'emergency-rescue-treatment-fund', descriptionEn: 'This fund ensures our rescue teams can respond immediately and provide critical emergency veterinary care with no delay.', descriptionBn: 'এই তহবিল নিশ্চিত করে যে আমাদের উদ্ধার দলগুলি অবিলম্বে সাড়া দিতে পারে।', goalAmount: 1500000, defaultAmount: 1000, suggestedAmounts: [500, 1000, 2500, 5000, 10000], purposeSlug: 'rescue-emergency-treatment', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
    { titleEn: 'Food for Street Animals', titleBn: 'পথ-প্রাণীদের জন্য খাদ্য', slug: 'food-for-street-animals', descriptionEn: 'Hundreds of stray dogs and cats across Dhaka go hungry every day. Our volunteer feeders operate daily feeding stations in 15 locations across the city.', descriptionBn: 'ঢাকা জুড়ে শত শত পথ-কুকুর ও বিড়াল প্রতিদিন অনাহারে থাকে।', goalAmount: 800000, defaultAmount: 300, suggestedAmounts: [100, 300, 500, 1000, 3000], purposeSlug: 'food-support', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
    { titleEn: 'BPA 24/7 Animal Clinic Fund', titleBn: 'বিপিএ ২৪/৭ পশু ক্লিনিক তহবিল', slug: 'bpa-24-7-animal-clinic-fund', descriptionEn: "Help us establish Dhaka's first round-the-clock community veterinary clinic.", descriptionBn: 'ঢাকার প্রথম সার্বক্ষণিক কমিউনিটি ভেটেরিনারি ক্লিনিক স্থাপনে আমাদের সাহায্য করুন।', goalAmount: 5000000, defaultAmount: 5000, suggestedAmounts: [1000, 2500, 5000, 10000, 25000], purposeSlug: 'emergency-clinic-fund', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
  ];

  const campaignIds: Record<string, string> = {};
  for (const c of campaignDefs) {
    const purposeId = purposeIds[c.purposeSlug] ?? null;
    const record = await prisma.donationCampaign.upsert({
      where: { slug: c.slug },
      update: { titleEn: c.titleEn, titleBn: c.titleBn, goalAmount: c.goalAmount, defaultAmount: c.defaultAmount, status: 'ACTIVE', purposeId, showOnDonatePage: true, allowCustomAmount: true },
      create: { titleEn: c.titleEn, titleBn: c.titleBn, slug: c.slug, descriptionEn: c.descriptionEn, descriptionBn: c.descriptionBn, goalAmount: c.goalAmount, defaultAmount: c.defaultAmount, suggestedAmounts: c.suggestedAmounts, status: 'ACTIVE', purposeId, startDate: c.startDate, endDate: c.endDate, allowCustomAmount: true, showOnDonatePage: true },
    });
    campaignIds[c.slug] = record.id;
    counts.campaigns++;
  }

  // ── 3. Donation Page Settings ─────────────────────────────────────────────
  const existingPage = await prisma.donationPageSetting.findFirst();
  if (existingPage) {
    await prisma.donationPageSetting.update({
      where: { id: existingPage.id },
      data: { heroTitleEn: 'Give Hope to Street Animals', heroTitleBn: 'পথ-প্রাণীদের আশার আলো দিন', heroSubtitleEn: 'Your donation funds life-saving veterinary care, daily feeding, emergency rescue, and vaccination programs for thousands of animals across Bangladesh.', heroSubtitleBn: 'আপনার দান বাংলাদেশ জুড়ে হাজার হাজার প্রাণীর জন্য জীবনরক্ষাকারী ভেটেরিনারি সেবা, দৈনন্দিন খাওয়ানো, জরুরি উদ্ধার এবং টিকাদান কর্মসূচি পরিচালনা করে।', primaryCtaTextEn: 'Donate Now', primaryCtaTextBn: 'এখনই দান করুন', secondaryCtaTextEn: 'See How It Works', secondaryCtaTextBn: 'কীভাবে কাজ করে দেখুন', goalAmount: 5000000, showImpactCounters: true, showPurposeCards: true, showCampaigns: true, showImpactStories: true, showDonorWall: true, showTransparency: true, showQrSection: true, faqJson: FAQ_ITEMS, seoTitle: 'Donate to Help Street Animals — Bangladesh Pet Association', seoDescription: "Support BPA's mission to rescue, vaccinate, feed, and provide emergency veterinary care for street animals across Bangladesh.", isActive: true },
    });
  } else {
    await prisma.donationPageSetting.create({
      data: { heroTitleEn: 'Give Hope to Street Animals', heroTitleBn: 'পথ-প্রাণীদের আশার আলো দিন', heroSubtitleEn: 'Your donation funds life-saving veterinary care, daily feeding, emergency rescue, and vaccination programs for thousands of animals across Bangladesh.', heroSubtitleBn: 'আপনার দান বাংলাদেশ জুড়ে হাজার হাজার প্রাণীর জন্য জীবনরক্ষাকারী ভেটেরিনারি সেবা, দৈনন্দিন খাওয়ানো, জরুরি উদ্ধার এবং টিকাদান কর্মসূচি পরিচালনা করে।', primaryCtaTextEn: 'Donate Now', primaryCtaTextBn: 'এখনই দান করুন', secondaryCtaTextEn: 'See How It Works', secondaryCtaTextBn: 'কীভাবে কাজ করে দেখুন', goalAmount: 5000000, showImpactCounters: true, showPurposeCards: true, showCampaigns: true, showImpactStories: true, showDonorWall: true, showTransparency: true, showQrSection: true, faqJson: FAQ_ITEMS, seoTitle: 'Donate to Help Street Animals — Bangladesh Pet Association', seoDescription: "Support BPA's mission to rescue, vaccinate, feed, and provide emergency veterinary care for street animals across Bangladesh.", isActive: true },
    });
  }
  counts.pageSetting++;

  // ── 4. Impact Stories ─────────────────────────────────────────────────────
  const stories = [
    { titleEn: 'Lucky Survived a Road Accident in Mirpur', titleBn: 'মিরপুরে সড়ক দুর্ঘটনায় ভাগ্যবান বেঁচে গেল', slug: 'lucky-survived-road-accident-mirpur', storyType: 'RESCUE' as const, location: 'Mirpur, Dhaka', animalType: 'dog', shortDescriptionEn: 'Lucky, a 2-year-old stray dog, was found unconscious on the road after being hit by a vehicle.', shortDescriptionBn: 'লাকি, একটি ২ বছর বয়সী পথ-কুকুর, যানবাহনের ধাক্কায় রাস্তায় অজ্ঞান অবস্থায় পাওয়া গিয়েছিল।', fullStoryEn: "In March 2026, BPA's hotline received a call from a resident of Mirpur Section 10 reporting a badly injured stray dog. Our rescue team arrived within 20 minutes. Lucky had a fractured leg and internal bruising. After three weeks of intensive care, Lucky made a full recovery.", fullStoryBn: '২০২৬ সালের মার্চ মাসে, বিপিএ-র হটলাইনে মিরপুর সেকশন ১০-এর একজন বাসিন্দার কাছ থেকে রাস্তার পাশে একটি গুরুতর আহত পথ-কুকুরের খবর পাওয়া যায়।', costUsed: 4500, storyDate: new Date('2026-03-15'), purposeSlug: 'rescue-emergency-treatment', campaignSlug: 'emergency-rescue-treatment-fund', status: 'PUBLISHED', sortOrder: 1 },
    { titleEn: '200 Street Dogs Vaccinated in Uttara in a Single Day', titleBn: 'একদিনে উত্তরায় ২০০ পথ-কুকুরকে টিকা দেওয়া হল', slug: '200-dogs-vaccinated-uttara', storyType: 'VACCINATION' as const, location: 'Uttara, Dhaka', animalType: 'dog', shortDescriptionEn: "BPA's largest single-day vaccination drive in early 2026 — 200 dogs protected against rabies and distemper in Uttara in just 8 hours.", shortDescriptionBn: '২০২৬ সালের শুরুতে বিপিএ-র বৃহত্তম একদিনের টিকাদান অভিযান — মাত্র ৮ ঘণ্টায় উত্তরায় ২০০টি কুকুরকে রেবিজ ও ডিস্টেম্পারের বিরুদ্ধে সুরক্ষিত করা হয়।', fullStoryEn: 'On February 10, 2026, BPA deployed 12 veterinarians and 30 volunteers across 6 feeding points in Uttara. Working from 7 AM to 3 PM, the team administered rabies, distemper, and parvovirus vaccines to 200 street dogs.', fullStoryBn: '১০ ফেব্রুয়ারি ২০২৬ তারিখে, বিপিএ উত্তরার ৬টি খাদ্য কেন্দ্রে ১২ জন পশুচিকিৎসক ও ৩০ জন স্বেচ্ছাসেবক মোতায়েন করে।', costUsed: 25000, storyDate: new Date('2026-02-10'), purposeSlug: 'street-animal-vaccination', campaignSlug: 'street-animal-vaccination-fund-2026', status: 'PUBLISHED', sortOrder: 2 },
    { titleEn: 'Mimi the Cat: From Malnourished to Thriving', titleBn: 'বিড়াল মিমি: অপুষ্টি থেকে সুস্থ জীবনে', slug: 'mimi-cat-malnourished-to-thriving', storyType: 'FOOD' as const, location: 'Dhanmondi, Dhaka', animalType: 'cat', shortDescriptionEn: 'Mimi was found severely malnourished near a restaurant in Dhanmondi. Regular feeding support from BPA helped her recover and gain a healthy weight.', shortDescriptionBn: 'মিমিকে ধানমন্ডির একটি রেস্তোরাঁর কাছে গুরুতর অপুষ্টিতে পাওয়া গিয়েছিল।', fullStoryEn: 'Mimi was discovered by one of our feeding volunteers in Dhanmondi in January 2026. She weighed just 1.2 kg. Our feeding team began providing high-protein wet food twice daily. Over six weeks, Mimi gained 800g.', fullStoryBn: 'মিমিকে ২০২৬ সালের জানুয়ারিতে ধানমন্ডিতে আমাদের একজন খাদ্য সরবরাহকারী স্বেচ্ছাসেবক আবিষ্কার করেন। তার ওজন মাত্র ১.২ কেজি ছিল।', costUsed: 1800, storyDate: new Date('2026-01-20'), purposeSlug: 'food-support', campaignSlug: 'food-for-street-animals', status: 'PUBLISHED', sortOrder: 3 },
  ];

  for (const s of stories) {
    const purposeId = purposeIds[s.purposeSlug] ?? null;
    const campaignId = campaignIds[s.campaignSlug] ?? null;
    const existing = await prisma.donationImpactStory.findUnique({ where: { slug: s.slug } });
    if (!existing) {
      await prisma.donationImpactStory.create({
        data: { titleEn: s.titleEn, titleBn: s.titleBn, slug: s.slug, storyType: s.storyType, location: s.location, animalType: s.animalType, shortDescriptionEn: s.shortDescriptionEn, shortDescriptionBn: s.shortDescriptionBn, fullStoryEn: s.fullStoryEn, fullStoryBn: s.fullStoryBn, costUsed: s.costUsed, storyDate: s.storyDate, status: s.status, showOnDonationPage: true, sortOrder: s.sortOrder, purposeId, campaignId },
      });
      counts.stories++;
    }
  }

  // ── 5. Transparency Report ────────────────────────────────────────────────
  const existingReport = await prisma.donationTransparencyReport.findFirst({ where: { reportMonth: '2026-03' } });
  if (!existingReport) {
    await prisma.donationTransparencyReport.create({
      data: { reportMonth: '2026-03', titleEn: 'March 2026 — Quarterly Donation Utilisation Report', titleBn: 'মার্চ ২০২৬ — ত্রৈমাসিক দান ব্যবহার প্রতিবেদন', totalReceived: 385000, totalUsed: 312000, openingBalance: 48000, closingBalance: 121000, vaccinationExpense: 112000, foodExpense: 78000, treatmentExpense: 95000, rescueTransportExpense: 22000, clinicFundAllocation: 0, adminAndProcessingExpense: 5000, status: 'PUBLISHED' },
    });
    counts.transparency++;
  }

  // ── 6. QR Codes ───────────────────────────────────────────────────────────
  const baseUrl = process.env['FRONTEND_URL'] ?? process.env['AUTH_PUBLIC_WEB_URL'] ?? 'https://bangladeshpetassociation.com';
  const qrDefs = [
    { name: 'General Donation QR', slug: 'general-donation', source: 'general', targetUrl: `${baseUrl}/donate`, purposeSlug: null, campaignSlug: null },
    { name: 'Vaccination Fund 2026 — Event Banner', slug: 'vaccination-2026-event', source: 'event-banner', targetUrl: `${baseUrl}/donate?campaign=street-animal-vaccination-fund-2026#donate-form`, purposeSlug: null, campaignSlug: 'street-animal-vaccination-fund-2026' },
    { name: 'Emergency Rescue Fund — Clinic Poster', slug: 'rescue-fund-clinic-poster', source: 'clinic-poster', targetUrl: `${baseUrl}/donate?campaign=emergency-rescue-treatment-fund#donate-form`, purposeSlug: null, campaignSlug: 'emergency-rescue-treatment-fund' },
    { name: '24/7 Clinic Fund — Social Media', slug: 'clinic-fund-social', source: 'social-media', targetUrl: `${baseUrl}/donate?campaign=bpa-24-7-animal-clinic-fund#donate-form`, purposeSlug: null, campaignSlug: 'bpa-24-7-animal-clinic-fund' },
  ];
  for (const q of qrDefs) {
    const campaignId = q.campaignSlug ? (campaignIds[q.campaignSlug] ?? null) : null;
    const existing = await prisma.donationQrCode.findUnique({ where: { slug: q.slug } });
    if (!existing) {
      await prisma.donationQrCode.create({ data: { name: q.name, slug: q.slug, source: q.source, targetUrl: q.targetUrl, campaignId, isActive: true } });
      counts.qrCodes++;
    }
  }

  return counts;
}
