import { PrismaClient } from '@prisma/client';

const MEMBERSHIP_BENEFITS = [
  {
    titleEn: 'Digital BPA Community Care Partner Card',
    titleBn: 'ডিজিটাল BPA কমিউনিটি কেয়ার পার্টনার কার্ড',
    icon: 'mdi:card-account-details',
    sortOrder: 1,
    planCodes: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'QR Code Verification',
    titleBn: 'কিউআর কোড ভেরিফিকেশন',
    icon: 'mdi:qrcode',
    sortOrder: 2,
    planCodes: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Preferred Clinic Zone Vote',
    titleBn: 'পছন্দের ক্লিনিক জোন ভোট',
    icon: 'mdi:vote-outline',
    sortOrder: 3,
    planCodes: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Partner Clinic Service Discounts',
    titleBn: 'পার্টনার ক্লিনিক সেবা ডিসকাউন্ট',
    icon: 'mdi:percent',
    sortOrder: 4,
    planCodes: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: '5-Year Card Validity',
    titleBn: '৫ বছরের কার্ড মেয়াদ',
    icon: 'mdi:calendar-check',
    sortOrder: 5,
    planCodes: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Higher Service Discount',
    titleBn: 'উচ্চতর সেবা ডিসকাউন্ট',
    icon: 'mdi:sale',
    sortOrder: 6,
    planCodes: ['PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Priority Service Support',
    titleBn: 'অগ্রাধিকার সেবা সহায়তা',
    icon: 'mdi:headphones',
    sortOrder: 7,
    planCodes: ['PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Coverage for Up to 10 Pets',
    titleBn: 'সর্বোচ্চ ১০টি পোষা প্রাণীর কভারেজ',
    icon: 'mdi:paw',
    sortOrder: 8,
    planCodes: ['PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Preferred Clinic/Branch Priority',
    titleBn: 'পছন্দের ক্লিনিক/শাখা অগ্রাধিকার',
    icon: 'mdi:hospital-box',
    sortOrder: 9,
    planCodes: ['PREMIUM', 'ENTERPRISE'] as const,
  },
  {
    titleEn: 'Highest Service Discount',
    titleBn: 'সর্বোচ্চ সেবা ডিসকাউন্ট',
    icon: 'mdi:sale',
    sortOrder: 10,
    planCodes: ['ENTERPRISE'] as const,
  },
  {
    titleEn: 'Multi-Pet/Family/Shelter Support',
    titleBn: 'একাধিক পোষা/পরিবার/শেল্টার সহায়তা',
    icon: 'mdi:home-heart',
    sortOrder: 11,
    planCodes: ['ENTERPRISE'] as const,
  },
  {
    titleEn: 'Priority Branch Service',
    titleBn: 'অগ্রাধিকার শাখা সেবা',
    icon: 'mdi:star',
    sortOrder: 12,
    planCodes: ['ENTERPRISE'] as const,
  },
  {
    titleEn: 'Extended Pet Coverage',
    titleBn: 'বর্ধিত পোষা প্রাণী কভারেজ',
    icon: 'mdi:shield-check',
    sortOrder: 13,
    planCodes: ['ENTERPRISE'] as const,
  },
] as const;

const MEMBERSHIP_FAQS = [
  {
    questionEn: 'Who can apply for BPA membership?',
    questionBn: 'কে BPA মেম্বারশিপের জন্য আবেদন করতে পারবেন?',
    answerEn: 'Any eligible pet owner can apply. Pets are linked later at an authorized clinic when service is used.',
    answerBn: 'যোগ্য যে কোনো পোষা প্রাণীর মালিক আবেদন করতে পারবেন। সেবা নেওয়ার সময় অনুমোদিত ক্লিনিকে পরে পোষা প্রাণী লিঙ্ক করা হবে।',
    sortOrder: 1,
  },
  {
    questionEn: 'Are pets selected during the application?',
    questionBn: 'আবেদনের সময় কি পোষা প্রাণী নির্বাচন করা হয়?',
    answerEn: 'No. Membership is purchased first. Covered pets are linked later through the clinic workflow.',
    answerBn: 'না। আগে মেম্বারশিপ নেওয়া হয়। পরে ক্লিনিক ওয়ার্কফ্লোর মাধ্যমে কভার্ড পোষা প্রাণী লিঙ্ক করা হয়।',
    sortOrder: 2,
  },
  {
    questionEn: 'Can a linked pet be replaced later?',
    questionBn: 'লিঙ্ক করা পোষা প্রাণী কি পরে পরিবর্তন করা যাবে?',
    answerEn: 'Replacement is allowed only under BPA policy, typically for a deceased or permanently lost pet after approval.',
    answerBn: 'শুধু BPA নীতিমালা অনুযায়ী, সাধারণত মৃত বা স্থায়ীভাবে হারিয়ে যাওয়া পোষা প্রাণীর ক্ষেত্রে অনুমোদনের পর পরিবর্তন করা যাবে।',
    sortOrder: 3,
  },
  {
    questionEn: 'How long is membership valid?',
    questionBn: 'মেম্বারশিপ কতদিন বৈধ থাকে?',
    answerEn: 'The seeded membership plans are configured for five years.',
    answerBn: 'সিড করা মেম্বারশিপ প্ল্যানগুলো পাঁচ বছরের জন্য কনফিগার করা আছে।',
    sortOrder: 4,
  },
] as const;

export async function seedMembershipReferenceData(prisma: PrismaClient) {
  const campaign = await prisma.membershipCampaign.findUnique({
    where: { slug: 'bpa-membership-2026' },
    select: { id: true },
  });

  if (!campaign) {
    throw new Error('Membership reference seeding requires campaign "bpa-membership-2026"');
  }

  const plans = await prisma.membershipPlan.findMany({
    where: { campaignId: campaign.id, code: { in: ['PRIMARY', 'PREMIUM', 'ENTERPRISE'] } },
    select: { id: true, code: true },
  });

  const planByCode = new Map(plans.map((plan) => [plan.code, plan.id]));

  for (const code of ['PRIMARY', 'PREMIUM', 'ENTERPRISE']) {
    if (!planByCode.has(code)) {
      throw new Error(`Membership reference seeding could not resolve plan code "${code}"`);
    }
  }

  let benefits = 0;
  let planBenefits = 0;
  let faqs = 0;

  for (const item of MEMBERSHIP_BENEFITS) {
    const benefit = await prisma.membershipBenefit.upsert({
      where: {
        campaignId_titleEn: {
          campaignId: campaign.id,
          titleEn: item.titleEn,
        },
      },
      update: {
        titleBn: item.titleBn,
        icon: item.icon,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      create: {
        campaignId: campaign.id,
        code: item.titleEn.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
        titleEn: item.titleEn,
        titleBn: item.titleBn,
        icon: item.icon,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      select: { id: true },
    });
    benefits++;

    for (const code of item.planCodes) {
      const planId = planByCode.get(code);
      if (!planId) {
        throw new Error(`Membership reference seeding could not resolve plan code "${code}"`);
      }

      await prisma.membershipPlanBenefit.upsert({
        where: {
          planId_benefitId: {
            planId,
            benefitId: benefit.id,
          },
        },
        update: {},
        create: {
          planId,
          benefitId: benefit.id,
        },
      });
      planBenefits++;
    }
  }

  for (const item of MEMBERSHIP_FAQS) {
    const existing = await prisma.membershipFaq.findFirst({
      where: {
        campaignId: campaign.id,
        questionEn: item.questionEn,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.membershipFaq.update({
        where: { id: existing.id },
        data: {
          questionBn: item.questionBn,
          answerEn: item.answerEn,
          answerBn: item.answerBn,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.membershipFaq.create({
        data: {
          campaignId: campaign.id,
          questionEn: item.questionEn,
          questionBn: item.questionBn,
          answerEn: item.answerEn,
          answerBn: item.answerBn,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }

    faqs++;
  }

  return { benefits, planBenefits, faqs };
}
