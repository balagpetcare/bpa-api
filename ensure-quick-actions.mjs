import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Same coverage heuristics as the Flutter client's _ensureEssentialActions
// (lib/features/home/widgets/quick_access_section.dart), applied here so
// the backend only ever adds a record when the destination is genuinely
// missing from admin-authored data - never touches existing rows.
function matchText(action) {
  return `${action.title ?? ''} ${action.destinationValue ?? ''}`.toLowerCase();
}

const essentials = [
  {
    key: 'vaccination',
    matches: (a) => a.destinationType === 'CAMPAIGN' || matchText(a).includes('vaccin'),
    id: '20000000-0000-0000-0000-000000000511',
    title: 'Book Vaccination',
    subtitle: 'Register for a BPA vaccination campaign',
    ctaText: 'Book now',
    destinationType: 'CAMPAIGN',
    destinationValue: null,
  },
  {
    key: 'membership',
    matches: (a) => a.destinationType === 'MEMBERSHIP' || matchText(a).includes('member'),
    id: '20000000-0000-0000-0000-000000000512',
    title: 'Membership',
    subtitle: 'View or renew your BPA membership',
    ctaText: 'View',
    destinationType: 'MEMBERSHIP',
    destinationValue: null,
  },
  {
    key: 'pet_summary',
    matches: (a) => a.destinationType === 'PET_CENSUS' || matchText(a).includes('pet'),
    id: '20000000-0000-0000-0000-000000000513',
    title: 'Pet Summary',
    subtitle: 'Manage your registered pets',
    ctaText: 'View pets',
    destinationType: 'PET_CENSUS',
    destinationValue: null,
  },
  {
    key: 'certificates',
    matches: (a) => matchText(a).includes('cert'),
    id: '20000000-0000-0000-0000-000000000514',
    title: 'Certificates',
    subtitle: 'Download your pet certificates',
    ctaText: 'View certificates',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'certificates',
  },
  {
    key: 'find_clinics',
    matches: (a) => matchText(a).includes('clinic'),
    id: '20000000-0000-0000-0000-000000000515',
    title: 'Find Clinics',
    subtitle: 'Locate partner veterinary clinics',
    ctaText: 'Find clinics',
    destinationType: 'INTERNAL_PAGE',
    destinationValue: 'partner_clinics',
  },
];

async function main() {
  const now = new Date();
  const active = await prisma.appQuickAction.findMany({
    where: { isActive: true, status: 'published' },
  });

  const created = [];
  const skipped = [];

  for (const essential of essentials) {
    if (active.some(essential.matches)) {
      skipped.push(essential.key);
      continue;
    }

    await prisma.appQuickAction.upsert({
      where: { id: essential.id },
      update: {},
      create: {
        id: essential.id,
        title: essential.title,
        subtitle: essential.subtitle,
        ctaText: essential.ctaText,
        destinationType: essential.destinationType,
        destinationValue: essential.destinationValue,
        sortOrder: 100,
        isActive: true,
        targetAudience: 'all',
        status: 'published',
        startsAt: now,
        endsAt: null,
      },
    });
    created.push(essential.key);
  }

  console.log(`Created (genuinely missing): ${created.length ? created.join(', ') : 'none'}`);
  console.log(`Already covered by admin data: ${skipped.length ? skipped.join(', ') : 'none'}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
