/**
 * seed-hero.ts — Idempotent seed for homepage hero slides.
 *
 * Run on production after first deploy (or any time you need fresh slides):
 *   npm run seed:hero
 *
 * Strategy:
 *  1. If existing image MediaFiles are present in the DB, reuse the first 3
 *     as desktop images.
 *  2. If the DB is empty, create placeholder MediaFile records pointing to
 *     free public images (Unsplash CDN), then use those.
 *  3. Only creates slides that do not already exist (matched by title).
 *  4. Sets status=published, isActive=true so they appear immediately.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Slide definitions — update text to match your brand
// ---------------------------------------------------------------------------

const SLIDE_DEFINITIONS = [
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
    // Fallback placeholder image — 1920×1080 dark green/navy suitable for overlay text
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

// ---------------------------------------------------------------------------

async function run() {
  console.log('[seed-hero] Starting hero slide seed…');

  // 1. Find existing image MediaFiles in the DB
  const existingImages = await prisma.mediaFile.findMany({
    where: { mimeType: { startsWith: 'image/' } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  console.log(`[seed-hero] Found ${existingImages.length} existing image(s) in media_files`);

  const createdSlides: string[] = [];
  const skippedSlides: string[] = [];

  for (let i = 0; i < SLIDE_DEFINITIONS.length; i++) {
    const def = SLIDE_DEFINITIONS[i];

    // Skip if a slide with this title already exists
    const existing = await prisma.heroSlide.findFirst({
      where: { title: def.title },
    });
    if (existing) {
      skippedSlides.push(def.title);
      console.log(`[seed-hero]   SKIP  "${def.title}" — already exists (id=${existing.id})`);
      continue;
    }

    // Resolve desktop image: prefer existing DB image (round-robin), else create placeholder
    let desktopImageId: string;

    if (existingImages.length > 0) {
      // Round-robin through existing images
      desktopImageId = existingImages[i % existingImages.length].id;
      console.log(`[seed-hero]   Using existing image id=${desktopImageId} for "${def.title}"`);
    } else {
      // No existing images — create a placeholder MediaFile
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
      console.log(`[seed-hero]   Created placeholder MediaFile id=${desktopImageId} → ${def.placeholderImageUrl}`);
    }

    // Create the hero slide
    const slide = await prisma.heroSlide.create({
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

    createdSlides.push(slide.id);
    console.log(`[seed-hero]   CREATED "${def.title}" id=${slide.id}`);
  }

  // 2. Ensure homepage record exists for locale=en (required by the public endpoint)
  await prisma.homepage.upsert({
    where: { locale: 'en' },
    update: {},
    create: {
      locale: 'en',
      title: 'BPA Homepage',
      status: 'published',
      publishedAt: new Date(),
    },
  });
  console.log('[seed-hero] Homepage record ensured (locale=en)');

  console.log(`\n[seed-hero] Done.`);
  console.log(`  Created : ${createdSlides.length} slide(s)`);
  console.log(`  Skipped : ${skippedSlides.length} slide(s) (already existed)`);

  if (createdSlides.length > 0) {
    console.log('\n  Next step: visit the production homepage to verify the slider renders.');
    console.log('  Or log in to the admin panel → CMS → Hero Slider to replace placeholder images with real ones.');
  }
}

run()
  .catch((err) => {
    console.error('[seed-hero] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
