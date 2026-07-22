import { PrismaClient } from '@prisma/client';

const DEFAULT_FAQS = [
  {
    questionEn: 'Who can register for the campaign?',
    questionBn: 'কে এই ক্যাম্পেইনে নিবন্ধন করতে পারেন?',
    answerEn: 'Any pet owner residing in Dhaka can register their pets for this campaign. No prior membership is required, and registration is open to all.',
    answerBn: 'ঢাকায় বসবাসকারী যেকোনো পোষা প্রাণীর মালিক তাদের পোষা প্রাণীদের জন্য নিবন্ধন করতে পারেন। পূর্বের সদস্যপদের প্রয়োজন নেই এবং নিবন্ধন সবার জন্য উন্মুক্ত।',
    category: 'Registration',
  },
  {
    questionEn: 'Which pets are eligible for vaccination?',
    questionBn: 'কোন পোষা প্রাণী টিকা দেওয়ার জন্য উপযুক্ত?',
    answerEn: 'Healthy cats and dogs aged 8 weeks and above are eligible. Pregnant or nursing animals should consult a veterinarian before vaccination.',
    answerBn: '৮ সপ্তাহ ও তার বেশি বয়সী সুস্থ বিড়াল ও কুকুর উপযুক্ত। গর্ভবতী বা দুধ খাওয়ানো প্রাণীদের টিকা দেওয়ার আগে একজন ভেটেরিনারিয়ানের সাথে পরামর্শ করা উচিত।',
    category: 'Eligibility',
  },
  {
    questionEn: 'What vaccines are included in the campaign?',
    questionBn: 'এই ক্যাম্পেইনে কী কী টিকা অন্তর্ভুক্ত?',
    answerEn: 'The campaign includes core vaccines such as Rabies, DHPP (Distemper, Hepatitis, Parainfluenza, Parvovirus) for dogs, and FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia) for cats. Additional vaccines may be available at selected sessions.',
    answerBn: 'ক্যাম্পেইনে কোর টিকা যেমন কুকুরের জন্য রেবিজ, ডিএইচপিপি (ডিস্টেম্পার, হেপাটাইটিস, প্যারাইনফ্লুয়েঞ্জা, পারভোভাইরাস) এবং বিড়ালের জন্য এফভিআরসিপি (ফেলাইন ভাইরাল রাইনোট্রাকাইটিস, ক্যালিসিভাইরাস, প্যানলিউকোপেনিয়া) অন্তর্ভুক্ত। নির্বাচিত সেশনে অতিরিক্ত টিকা উপলব্ধ থাকতে পারে।',
    category: 'Vaccination',
  },
  {
    questionEn: 'Is payment required for registration?',
    questionBn: 'নিবন্ধনের জন্য কি অর্থপ্রদান প্রয়োজন?',
    answerEn: 'Yes, a nominal registration fee applies per pet. This covers the cost of vaccines, administrative processing, and the digital certificate. Payment can be made online via card, mobile banking, or internet banking.',
    answerBn: 'হ্যাঁ, প্রতি পোষা প্রাণীর জন্য একটি নামমাত্র নিবন্ধন ফি প্রযোজ্য। এটি টিকা, প্রশাসনিক প্রক্রিয়াকরণ এবং ডিজিটাল সার্টিফিকেটের খরচ কভার করে। কার্ড, মোবাইল ব্যাংকিং বা ইন্টারনেট ব্যাংকিংয়ের মাধ্যমে অনলাইনে পেমেন্ট করা যেতে পারে।',
    category: 'Payment',
  },
  {
    questionEn: 'What should I bring to the campaign?',
    questionBn: 'ক্যাম্পেইনে কী কী আনতে হবে?',
    answerEn: 'Please bring your booking confirmation (QR code), your pet in a carrier or on a leash, and any previous vaccination records if available.',
    answerBn: 'অনুগ্রহ করে আপনার বুকিং নিশ্চিতকরণ (কিউআর কোড), আপনার পোষা প্রাণী ক্যারিয়ার বা পাঁশে এবং আগের টিকার রেকর্ড (যদি থাকে) নিয়ে আসুন।',
    category: 'Preparation',
  },
  {
    questionEn: 'How does QR check-in work?',
    questionBn: 'কিউআর চেক-ইন কিভাবে কাজ করে?',
    answerEn: 'After registration, you receive a unique QR code via email/SMS. At the venue, staff scan your QR code to verify your booking, check you in, and guide you to the vaccination station.',
    answerBn: 'নিবন্ধনের পরে, আপনি ইমেল/এসএমএসের মাধ্যমে একটি অনন্য QR কোড পাবেন। ভেন্যুতে, কর্মীরা আপনার বুকিং যাচাই করতে, আপনাকে চেক-ইন করতে এবং টিকা স্টেশনে গাইড করতে আপনার QR কোড স্ক্যান করবেন।',
    category: 'Check-in',
  },
  {
    questionEn: 'Will I get a vaccination certificate?',
    questionBn: 'আমি কি একটি টিকা সার্টিফিকেট পাব?',
    answerEn: 'Yes, each vaccinated pet receives a digital certificate with a unique QR code that can be verified online at any time. The certificate serves as official proof of vaccination.',
    answerBn: 'হ্যাঁ, প্রতিটি টিকাপ্রাপ্ত পোষা প্রাণী একটি অনন্য QR কোড সহ একটি ডিজিটাল সার্টিফিকেট পাবে যা যেকোনো সময় অনলাইনে যাচাই করা যাবে। সার্টিফিকেটটি টিকার অফিসিয়াল প্রমাণ হিসাবে কাজ করে।',
    category: 'Certificate',
  },
  {
    questionEn: 'Can I register multiple pets?',
    questionBn: 'আমি কি একাধিক পোষা প্রাণী নিবন্ধন করতে পারি?',
    answerEn: 'Yes, you can register up to 10 pets per booking. Simply add each pet during registration. Each pet receives its own QR code and certificate.',
    answerBn: 'হ্যাঁ, আপনি প্রতি বুকিংয়ে সর্বোচ্চ ১০টি পোষা প্রাণী নিবন্ধন করতে পারেন। নিবন্ধনের সময় প্রতিটি পোষা প্রাণী যোগ করুন। প্রতিটি পোষা প্রাণী তার নিজস্ব QR কোড এবং সার্টিফিকেট পায়।',
    category: 'Registration',
  },
  {
    questionEn: 'What if my pet is sick on campaign day?',
    questionBn: 'ক্যাম্পেইনের দিন যদি আমার পোষা প্রাণী অসুস্থ হয়?',
    answerEn: 'If your pet is unwell, please do not bring them to the session. Contact our support team to reschedule or transfer your booking to another session. Vaccinating a sick animal may cause complications.',
    answerBn: 'যদি আপনার পোষা প্রাণী অসুস্থ হয় তবে অনুগ্রহ করে সেশনে আনবেন না। পুনরায় সময় নির্ধারণ করতে বা আপনার বুকিং অন্য সেশনে স্থানান্তর করতে আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন। অসুস্থ প্রাণীকে টিকা দিলে জটিলতা হতে পারে।',
    category: 'Health',
  },
  {
    questionEn: 'How can I verify the vaccination certificate?',
    questionBn: 'আমি কিভাবে টিকা সার্টিফিকেট যাচাই করতে পারি?',
    answerEn: 'Visit the BPA website and go to the "Verify Certificate" page. Enter the certificate number or scan the QR code to instantly verify the authenticity of the certificate.',
    answerBn: 'বিপিএ ওয়েবসাইটে যান এবং "সার্টিফিকেট যাচাই করুন" পৃষ্ঠায় যান। সার্টিফিকেট নম্বর লিখুন অথবা QR কোড স্ক্যান করুন যাতে তাৎক্ষণিকভাবে সার্টিফিকেটের সত্যতা যাচাই করা যায়।',
    category: 'Certificate',
  },
];

export async function seedCampaignFaqs(prisma: PrismaClient) {
  const campaign = await prisma.campaign.findFirst({
    where: { slug: 'cat-vaccination-dhaka-2026' },
  });

  if (!campaign) {
    console.log('  ⚠  Cat Vaccination Campaign not found — FAQ seed skipped.');
    return { created: 0, skipped: 0, total: 0 };
  }

  const existingCount = await prisma.campaignFaq.count({
    where: { campaignId: campaign.id },
  });

  if (existingCount > 0) {
    console.log(`  ✓ Skipped — ${existingCount} FAQ(s) already exist for this campaign`);
    return { created: 0, skipped: existingCount, total: existingCount };
  }

  await prisma.campaignFaq.createMany({
    data: DEFAULT_FAQS.map((faq, idx) => ({
      campaignId: campaign.id,
      questionEn: faq.questionEn,
      questionBn: faq.questionBn,
      answerEn: faq.answerEn,
      answerBn: faq.answerBn,
      category: faq.category,
      sortOrder: idx,
      isActive: true,
    })),
  });

  console.log(`  ✓ Seeded ${DEFAULT_FAQS.length} default FAQs for campaign: ${campaign.title}`);
  return { created: DEFAULT_FAQS.length, skipped: 0, total: DEFAULT_FAQS.length };
}
