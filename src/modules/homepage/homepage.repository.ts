import {
  HeroSlideStatus,
  HomepageSectionType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import type {
  HeroSlideListQuery,
  PartnerListQuery,
  SectionListQuery,
} from './homepage.types';

export const mediaSelect = {
  id: true,
  url: true,
  mimeType: true,
  altText: true,
} as const;

export const sectionInclude = {
  items: {
    where: { isVisible: true },
    orderBy: { sortOrder: 'asc' as const },
    include: { media: { select: mediaSelect } },
  },
} as const;

export const heroInclude = {
  desktopImage: { select: mediaSelect },
  mobileImage: { select: mediaSelect },
  video: { select: mediaSelect },
} as const;

export const partnerInclude = {
  logo: { select: mediaSelect },
} as const;

export const footerInclude = {
  logo: { select: mediaSelect },
  groups: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      links: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} as const;

export async function ensureHomepage(locale = 'en') {
  try {
    return await prisma.homepage.upsert({
      where: { locale },
      update: {},
      create: { locale, title: 'BPA Homepage' },
    });
  } catch (e: any) {
    // P2002: unique constraint — another concurrent request already created it
    if (e?.code === 'P2002') {
      const existing = await prisma.homepage.findUnique({ where: { locale } });
      if (existing) return existing;
    }
    throw e;
  }
}

export async function getHomepage(locale = 'en') {
  return prisma.homepage.findUnique({
    where: { locale },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: sectionInclude,
      },
    },
  });
}

export async function updateHomepage(locale: string, data: Prisma.HomepageUpdateInput) {
  await ensureHomepage(locale);
  return prisma.homepage.update({
    where: { locale },
    data,
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: sectionInclude,
      },
    },
  });
}

export async function listSections(query: SectionListQuery) {
  const homepage = await ensureHomepage(query.locale ?? 'en');
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.HomepageSectionWhereInput = {
    homepageId: homepage.id,
    ...(query.type ? { type: query.type as HomepageSectionType } : {}),
    ...(query.isVisible ? { isVisible: query.isVisible === 'true' } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.homepageSection.findMany({
      where,
      skip,
      take: limit,
      orderBy: { sortOrder: 'asc' },
      include: sectionInclude,
    }),
    prisma.homepageSection.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getSectionById(id: string) {
  return prisma.homepageSection.findUnique({ where: { id }, include: sectionInclude });
}

export async function createSection(data: Prisma.HomepageSectionCreateInput) {
  return prisma.homepageSection.create({ data, include: sectionInclude });
}

export async function updateSection(id: string, data: Prisma.HomepageSectionUpdateInput) {
  return prisma.homepageSection.update({ where: { id }, data, include: sectionInclude });
}

export async function deleteSection(id: string) {
  return prisma.homepageSection.delete({ where: { id } });
}

export async function reorderSections(items: { id: string; sortOrder: number }[]) {
  await prisma.$transaction(
    items.map((item) =>
      prisma.homepageSection.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}

export async function createSectionItem(sectionId: string, data: Prisma.HomepageSectionItemCreateWithoutSectionInput) {
  return prisma.homepageSectionItem.create({
    data: { ...data, section: { connect: { id: sectionId } } },
    include: { media: { select: mediaSelect } },
  });
}

export async function updateSectionItem(id: string, data: Prisma.HomepageSectionItemUpdateInput) {
  return prisma.homepageSectionItem.update({
    where: { id },
    data,
    include: { media: { select: mediaSelect } },
  });
}

export async function deleteSectionItem(id: string) {
  return prisma.homepageSectionItem.delete({ where: { id } });
}

export async function listHeroSlides(query: HeroSlideListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.HeroSlideWhereInput = {
    ...(query.locale ? { locale: query.locale } : {}),
    ...(query.status ? { status: query.status as HeroSlideStatus } : {}),
    ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { headline: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.heroSlide.findMany({ where, skip, take: limit, orderBy: { sortOrder: 'asc' }, include: heroInclude }),
    prisma.heroSlide.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listPublicHeroSlides(locale = 'en') {
  const now = new Date();
  return prisma.heroSlide.findMany({
    where: {
      locale,
      status: 'published',
      isActive: true,
      AND: [
        // start window: not yet started slides are excluded
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        // end window: expired slides are excluded
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
    orderBy: { sortOrder: 'asc' },
    include: heroInclude,
  });
}

export async function getHeroSlideById(id: string) {
  return prisma.heroSlide.findUnique({ where: { id }, include: heroInclude });
}

export async function createHeroSlide(data: Prisma.HeroSlideCreateInput) {
  return prisma.heroSlide.create({ data, include: heroInclude });
}

export async function updateHeroSlide(id: string, data: Prisma.HeroSlideUpdateInput) {
  return prisma.heroSlide.update({ where: { id }, data, include: heroInclude });
}

export async function deleteHeroSlide(id: string) {
  return prisma.heroSlide.delete({ where: { id } });
}

export async function listPartners(query: PartnerListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.PartnerWhereInput = {
    ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.partner.findMany({ where, skip, take: limit, orderBy: { sortOrder: 'asc' }, include: partnerInclude }),
    prisma.partner.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listPublicPartners() {
  const now = new Date();
  return prisma.partner.findMany({
    where: {
      isActive: true,
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    orderBy: { sortOrder: 'asc' },
    include: partnerInclude,
  });
}

export async function getPartnerById(id: string) {
  return prisma.partner.findUnique({ where: { id }, include: partnerInclude });
}

export async function createPartner(data: Prisma.PartnerCreateInput) {
  return prisma.partner.create({ data, include: partnerInclude });
}

export async function updatePartner(id: string, data: Prisma.PartnerUpdateInput) {
  return prisma.partner.update({ where: { id }, data, include: partnerInclude });
}

export async function deletePartner(id: string) {
  return prisma.partner.delete({ where: { id } });
}

export async function getFooter(locale = 'en') {
  return prisma.footerConfig.findUnique({ where: { locale }, include: footerInclude });
}

export async function upsertFooter(locale: string, data: Prisma.FooterConfigCreateInput, update: Prisma.FooterConfigUpdateInput) {
  return prisma.footerConfig.upsert({
    where: { locale },
    create: data,
    update,
    include: footerInclude,
  });
}

export async function replaceFooterGroups(footerId: string, groups: Array<{
  title: string;
  sortOrder: number;
  isVisible: boolean;
  links: Array<{ label: string; href: string; target: string; sortOrder: number; isVisible: boolean }>;
}>) {
  await prisma.$transaction(async (tx) => {
    await tx.footerLinkGroup.deleteMany({ where: { footerId } });
    for (const group of groups) {
      await tx.footerLinkGroup.create({
        data: {
          footerId,
          title: group.title,
          sortOrder: group.sortOrder,
          isVisible: group.isVisible,
          links: { create: group.links },
        },
      });
    }
  });
  return getFooterById(footerId);
}

export async function getFooterById(id: string) {
  return prisma.footerConfig.findUnique({ where: { id }, include: footerInclude });
}
