import { PrismaClient } from '@prisma/client';

export async function seedMailSystem(prisma: PrismaClient) {
  // 1. Seed Email Layouts
  const defaultLayoutEn = {
    name: 'Central Layout',
    isDefault: true,
    status: 'active',
    locale: 'en',
    headerLogoUrl: 'https://bangladeshpetassociation.com/images/logo.png',
    headerTitle: 'Bangladesh Pet Association',
    headerSubtitle: 'Empowering Pet Owners, Protecting Pet Welfare',
    headerBackgroundColor: '#1e3a8a',
    headerTextColor: '#ffffff',
    footerLogoUrl: 'https://bangladeshpetassociation.com/images/logo.png',
    footerText: 'Bangladesh Pet Association',
    footerSupportEmail: 'support@bangladeshpetassociation.com',
    footerPhonePrimary: '+8809612345678',
    footerPhoneSecondary: '+8809612345678',
    footerAddress: 'Dhaka, Bangladesh',
    footerBackgroundColor: '#1f2937',
    footerTextColor: '#9ca3af',
    buttonPrimaryColor: '#2563eb',
    buttonTextColor: '#ffffff',
    legalNote: 'You received this email because you are registered with Bangladesh Pet Association.',
  };

  const defaultLayoutBn = {
    name: 'Central Layout (Bangla)',
    isDefault: false,
    status: 'active',
    locale: 'bn',
    headerLogoUrl: 'https://bangladeshpetassociation.com/images/logo.png',
    headerTitle: 'বাংলাদেশ পেট অ্যাসোসিয়েশন',
    headerSubtitle: 'পোষ্য মালিকদের ক্ষমতায়ন, পোষ্য কল্যাণের সুরক্ষা',
    headerBackgroundColor: '#0f766e',
    headerTextColor: '#ffffff',
    footerLogoUrl: 'https://bangladeshpetassociation.com/images/logo.png',
    footerText: 'বাংলাদেশ পেট অ্যাসোসিয়েশন',
    footerSupportEmail: 'support@bangladeshpetassociation.com',
    footerPhonePrimary: '+8809612345678',
    footerPhoneSecondary: '+8809612345678',
    footerAddress: 'ঢাকা, বাংলাদেশ',
    footerBackgroundColor: '#111827',
    footerTextColor: '#9ca3af',
    buttonPrimaryColor: '#0d9488',
    buttonTextColor: '#ffffff',
    legalNote: 'বাংলাদেশ পেট অ্যাসোসিয়েশন-এর পরিষেবায় অংশ নেওয়ার জন্য আপনি এই ইমেলটি পেয়েছেন।',
  };

  const existingEn = await prisma.emailLayoutSetting.findFirst({
    where: { locale: 'en', name: defaultLayoutEn.name },
  });
  if (!existingEn) {
    await prisma.emailLayoutSetting.create({ data: defaultLayoutEn });
  }

  const existingBn = await prisma.emailLayoutSetting.findFirst({
    where: { locale: 'bn', name: defaultLayoutBn.name },
  });
  if (!existingBn) {
    await prisma.emailLayoutSetting.create({ data: defaultLayoutBn });
  }

  // 2. Seed Mail Accounts
  const defaultAccounts = [
    {
      displayName: 'BPA Info',
      emailAddress: 'info@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'info@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Info',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Admin',
      emailAddress: 'admin@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'admin@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Admin',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Support',
      emailAddress: 'support@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'support@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Support',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Accounts',
      emailAddress: 'accounts@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'accounts@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Accounts',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Media',
      emailAddress: 'media@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'media@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Media',
      status: 'inactive',
      isDefault: false,
    },
    {
      displayName: 'BPA Vaccination 2026',
      emailAddress: 'vaccination2026@bangladeshpetassociation.com',
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
      imapHost: null,
      imapPort: null,
      imapSecure: null,
      username: 'vaccination2026@bangladeshpetassociation.com',
      encryptedPassword: null,
      fromName: 'BPA Vaccination 2026',
      status: 'inactive',
      isDefault: false,
    },
  ];

  let upsertedCount = 0;
  for (const acc of defaultAccounts) {
    await prisma.mailAccount.upsert({
      where: { emailAddress: acc.emailAddress },
      update: {
        displayName: acc.displayName,
        smtpHost: acc.smtpHost,
        smtpPort: acc.smtpPort,
        smtpSecure: acc.smtpSecure,
        imapHost: acc.imapHost,
        imapPort: acc.imapPort,
        imapSecure: acc.imapSecure,
        username: acc.username,
        fromName: acc.fromName,
        status: acc.status,
        isDefault: acc.isDefault,
      },
      create: acc,
    });
    upsertedCount++;
  }

  return { emailLayouts: 2, mailAccounts: upsertedCount };
}
