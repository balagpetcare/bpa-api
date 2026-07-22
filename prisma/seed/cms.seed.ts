import { PrismaClient } from '@prisma/client';

const NEWS_CATEGORIES = [
  { name: 'Association News', slug: 'association-news' },
  { name: 'Pet Health', slug: 'pet-health' },
  { name: 'Events & Activities', slug: 'events-activities' },
  { name: 'Adoption', slug: 'adoption' },
  { name: 'Announcements', slug: 'announcements' },
  { name: 'Campaigns', slug: 'campaigns' },
  { name: 'Welfare', slug: 'welfare' },
];

const NEWS_TAGS = [
  { name: 'dogs', slug: 'dogs' }, { name: 'cats', slug: 'cats' },
  { name: 'birds', slug: 'birds' }, { name: 'rabbits', slug: 'rabbits' },
  { name: 'veterinary', slug: 'veterinary' }, { name: 'adoption', slug: 'adoption' },
  { name: 'welfare', slug: 'welfare' }, { name: 'training', slug: 'training' },
  { name: 'vaccination', slug: 'vaccination' }, { name: 'community-care', slug: 'community-care' },
];

const HERO_SLIDES = [
  {
    title: 'Hero Slide 1 — BPA Welcome',
    locale: 'en',
    badgeText: 'Bangladesh Pet Association',
    eyebrow: 'Caring for Pets Since 2020',
    headline: 'A National Platform for Responsible Pet Care',
    body: 'BPA connects pet owners, veterinary professionals, volunteers, and partners through campaigns, education, events, and welfare programs across Bangladesh.',
    ctaType: 'internal' as const,
    ctaLabel: 'Become a Member',
    ctaHref: '/membership',
    secondaryCtaType: 'internal' as const,
    secondaryCtaLabel: 'View Campaigns',
    secondaryCtaHref: '/campaigns',
    status: 'published' as const,
    isActive: true,
    sortOrder: 1,
    placeholderImageUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920&q=80',
    placeholderAlt: 'Happy dog — BPA homepage hero',
  },
  {
    title: 'Hero Slide 2 — Community Care',
    locale: 'en',
    badgeText: 'Community Care Partner Card',
    eyebrow: 'Founding Member Offer',
    headline: 'Get Your BPA Community Care Partner Card',
    body: 'Become a founding member today and unlock long-term pet care benefits. Primary, Premium, and Enterprise tiers available.',
    ctaType: 'internal' as const,
    ctaLabel: 'Get Your Card',
    ctaHref: '/community-pet-care',
    secondaryCtaType: 'internal' as const,
    secondaryCtaLabel: 'Learn More',
    secondaryCtaHref: '/community-pet-care#tiers',
    status: 'published' as const,
    isActive: true,
    sortOrder: 2,
    placeholderImageUrl: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=1920&q=80',
    placeholderAlt: 'Pets and owner — community care',
  },
  {
    title: 'Hero Slide 3 — Vaccination Campaigns',
    locale: 'en',
    badgeText: 'Free Vaccination Drive',
    eyebrow: 'Across 64 Districts',
    headline: 'Protecting Pets Across Bangladesh',
    body: 'Join our nationwide vaccination campaigns. Free rabies and multi-disease vaccines for registered pet owners in all districts.',
    ctaType: 'internal' as const,
    ctaLabel: 'View Campaigns',
    ctaHref: '/campaigns',
    secondaryCtaType: 'internal' as const,
    secondaryCtaLabel: 'Register Your Pet',
    secondaryCtaHref: '/membership',
    status: 'published' as const,
    isActive: true,
    sortOrder: 3,
    placeholderImageUrl: 'https://images.unsplash.com/photo-1548681528-6a5c45b66b42?w=1920&q=80',
    placeholderAlt: 'Veterinarian with dog — vaccination campaign',
  },
];

const HOMEPAGE_SECTIONS = [
  { type: 'hero' as const, source: 'automatic' as const, title: 'Hero Slider', isVisible: true, sortOrder: 1 },
  { type: 'stats' as const, source: 'static' as const, title: 'Impact Statistics', isVisible: true, sortOrder: 2 },
  { type: 'mission' as const, source: 'static' as const, title: 'Our Mission', isVisible: true, sortOrder: 3 },
  { type: 'campaigns' as const, source: 'automatic' as const, title: 'Active Campaigns', isVisible: true, sortOrder: 4, itemLimit: 3 },
  { type: 'community_pet_care' as const, source: 'static' as const, title: 'Community Pet Care', isVisible: true, sortOrder: 5 },
  { type: 'zone_progress' as const, source: 'automatic' as const, title: 'Zone Progress', isVisible: true, sortOrder: 6 },
  { type: 'news' as const, source: 'automatic' as const, title: 'Latest News', isVisible: true, sortOrder: 7, itemLimit: 3 },
  { type: 'transparency' as const, source: 'automatic' as const, title: 'Financial Transparency', isVisible: true, sortOrder: 8 },
  { type: 'cta' as const, source: 'static' as const, title: 'Call to Action — Donate', isVisible: true, sortOrder: 9 },
  { type: 'partners' as const, source: 'automatic' as const, title: 'Partners & Sponsors', isVisible: false, sortOrder: 10 },
];

export async function seedCms(prisma: PrismaClient) {
  const counts = { categories: 0, tags: 0, slides: 0, homepage: 0, sections: 0, footer: 0, petCensus: 0 };

  // ── 1. News Categories ────────────────────────────────────────────────────
  for (const cat of NEWS_CATEGORIES) {
    await prisma.newsCategory.upsert({ where: { slug: cat.slug }, update: { name: cat.name }, create: cat });
    counts.categories++;
  }

  // ── 2. News Tags ──────────────────────────────────────────────────────────
  for (const tag of NEWS_TAGS) {
    await prisma.newsTag.upsert({ where: { slug: tag.slug }, update: { name: tag.name }, create: tag });
    counts.tags++;
  }

  // ── 3. Homepage Record ────────────────────────────────────────────────────
  const homepage = await prisma.homepage.upsert({
    where: { locale: 'en' },
    update: { status: 'published' },
    create: {
      locale: 'en',
      title: 'BPA Homepage',
      description: 'Bangladesh Pet Association — Official Homepage',
      status: 'published',
      publishedAt: new Date(),
    },
  });
  counts.homepage++;

  // ── 4. Homepage Sections ──────────────────────────────────────────────────
  for (const section of HOMEPAGE_SECTIONS) {
    const existing = await prisma.homepageSection.findFirst({
      where: { homepageId: homepage.id, type: section.type },
    });
    if (!existing) {
      await prisma.homepageSection.create({
        data: {
          homepageId: homepage.id,
          type: section.type,
          source: section.source,
          title: section.title,
          isVisible: section.isVisible,
          sortOrder: section.sortOrder,
          itemLimit: 'itemLimit' in section ? section.itemLimit : undefined,
        },
      });
      counts.sections++;
    }
  }

  // ── 5. Hero Slides ────────────────────────────────────────────────────────
  const existingImages = await prisma.mediaFile.findMany({
    where: { mimeType: { startsWith: 'image/' } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (let i = 0; i < HERO_SLIDES.length; i++) {
    const def = HERO_SLIDES[i];
    const existing = await prisma.heroSlide.findFirst({ where: { title: def.title } });
    if (existing) continue;

    let desktopImageId: string;
    if (existingImages.length > 0) {
      desktopImageId = existingImages[i % existingImages.length].id;
    } else {
      const placeholder = await prisma.mediaFile.create({
        data: {
          filename: `placeholder-hero-${i + 1}.jpg`,
          originalName: `placeholder-hero-${i + 1}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          url: def.placeholderImageUrl,
          altText: def.placeholderAlt,
        },
      });
      desktopImageId = placeholder.id;
    }

    await prisma.heroSlide.create({
      data: {
        title: def.title,
        locale: def.locale,
        badgeText: def.badgeText,
        eyebrow: def.eyebrow,
        headline: def.headline,
        body: def.body,
        ctaType: def.ctaType,
        ctaLabel: def.ctaLabel,
        ctaHref: def.ctaHref,
        secondaryCtaType: def.secondaryCtaType,
        secondaryCtaLabel: def.secondaryCtaLabel,
        secondaryCtaHref: def.secondaryCtaHref,
        status: def.status,
        isActive: def.isActive,
        sortOrder: def.sortOrder,
        desktopImage: { connect: { id: desktopImageId } },
      },
    });
    counts.slides++;
  }

  // ── 6. Footer Config ──────────────────────────────────────────────────────
  const footerExisting = await prisma.footerConfig.findFirst({ where: { locale: 'en' } });
  if (!footerExisting) {
    const footer = await prisma.footerConfig.create({
      data: {
        locale: 'en',
        brandName: 'Bangladesh Pet Association',
        brandText: 'Dedicated to improving the lives of pets and their owners across Bangladesh.',
        email: 'info@bangladeshpetassociation.com',
        phone: '+8809612345678',
        address: 'Dhaka, Bangladesh',
        copyrightText: `© ${new Date().getFullYear()} Bangladesh Pet Association. All rights reserved.`,
        socialLinks: {
          facebook: 'https://facebook.com/bangladeshpetassociation',
          youtube: 'https://youtube.com/@bangladeshpetassociation',
          linkedin: 'https://linkedin.com/company/bangladeshpetassociation',
        },
        isActive: true,
      },
    });
    counts.footer++;

    // Footer link groups
    const groups = [
      { title: 'About BPA', links: [{ label: 'About Us', href: '/about' }, { label: 'Our Mission', href: '/about#mission' }, { label: 'Roadmap', href: '/about#roadmap' }, { label: 'Contact', href: '/contact' }] },
      { title: 'Programs', links: [{ label: 'Campaigns', href: '/campaigns' }, { label: 'Community Pet Care', href: '/community-pet-care' }, { label: 'Donate', href: '/donate' }, { label: 'Pet Census', href: '/pet-census' }] },
      { title: 'Legal', links: [{ label: 'Privacy Policy', href: '/privacy-policy' }, { label: 'Terms of Service', href: '/terms' }, { label: 'Refund Policy', href: '/refund-policy' }] },
    ];

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const group = await prisma.footerLinkGroup.create({
        data: { footerId: footer.id, title: g.title, sortOrder: gi + 1, isVisible: true },
      });
      for (let li = 0; li < g.links.length; li++) {
        await prisma.footerLink.create({
          data: { groupId: group.id, label: g.links[li].label, href: g.links[li].href, sortOrder: li + 1, isVisible: true },
        });
      }
    }
  }

  // ── 7. Pet Census Campaign Default ───────────────────────────────────────
  const existingCensus = await prisma.petCensusCampaign.findFirst({ where: { status: 'registration_open' } });
  if (!existingCensus) {
    const allCensus = await prisma.petCensusCampaign.findFirst();
    if (!allCensus) {
      await prisma.petCensusCampaign.create({
        data: {
          title: 'Pet Census 2026 — Dhaka Household Survey',
          description:
            'Help BPA map pet ownership across Dhaka. Submit your pet information to help us plan community clinics and vaccination campaigns in your area.',
          status: 'registration_open',
          registrationStartAt: new Date('2026-01-01'),
          registrationEndAt: new Date('2026-12-31'),
          countdownTargetAt: new Date('2026-12-31'),
          targetSubmissions: 50000,
          currentSubmissions: 0,
          isActive: true,
          settings: { showCountdown: true, requireVerification: false },
        },
      });
      counts.petCensus++;
    }
  }

  return counts;
}
