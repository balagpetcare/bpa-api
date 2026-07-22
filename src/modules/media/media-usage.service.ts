import { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../utils/AppError';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface MediaUsageReferenceItem {
  id: string;
  label?: string | null;
  extra?: Record<string, unknown>;
}

export interface MediaUsageReference {
  type: string;
  label: string;
  count: number;
  items: MediaUsageReferenceItem[];
}

export interface MediaUsageReport {
  mediaFileId: string;
  totalReferences: number;
  references: MediaUsageReference[];
}

function compactReferences(
  type: string,
  label: string,
  rows: MediaUsageReferenceItem[],
): MediaUsageReference | null {
  if (rows.length === 0) return null;
  return { type, label, count: rows.length, items: rows };
}

export async function getMediaUsageReport(
  db: DbClient,
  mediaFileId: string,
): Promise<MediaUsageReport> {
  const [
    campaignMedia,
    campaignCovers,
    newsCovers,
    eventCovers,
    committeePhotos,
    seoImages,
    homepageSectionItems,
    heroDesktopImages,
    heroMobileImages,
    heroVideos,
    partnerLogos,
    footerLogos,
    communityZoneCovers,
    transparencyReportCovers,
    petPhotos,
    petCensusPhotos,
  ] = await Promise.all([
    db.campaignMedia.findMany({
      where: { mediaFileId },
      select: {
        id: true,
        role: true,
        campaign: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.campaign.findMany({
      where: { coverImageId: mediaFileId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.news.findMany({
      where: { coverImageId: mediaFileId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.event.findMany({
      where: { coverImageId: mediaFileId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.committeeMember.findMany({
      where: { photoId: mediaFileId },
      select: { id: true, name: true, designation: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.seoMetadata.findMany({
      where: { ogImageId: mediaFileId },
      select: { id: true, route: true, title: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.homepageSectionItem.findMany({
      where: { mediaId: mediaFileId },
      select: {
        id: true,
        title: true,
        section: {
          select: {
            id: true,
            type: true,
            homepage: { select: { id: true, locale: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.heroSlide.findMany({
      where: { desktopImageId: mediaFileId },
      select: { id: true, title: true, locale: true, status: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.heroSlide.findMany({
      where: { mobileImageId: mediaFileId },
      select: { id: true, title: true, locale: true, status: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.heroSlide.findMany({
      where: { videoId: mediaFileId },
      select: { id: true, title: true, locale: true, status: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.partner.findMany({
      where: { logoId: mediaFileId },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.footerConfig.findMany({
      where: { logoId: mediaFileId },
      select: { id: true, locale: true, brandName: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.communityZone.findMany({
      where: { coverImageId: mediaFileId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.transparencyReport.findMany({
      where: { coverImageId: mediaFileId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.pet.findMany({
      where: { photoId: mediaFileId },
      select: { id: true, name: true, owner: { select: { ownerName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.petCensusSubmission.findMany({
      where: { photoMediaId: mediaFileId },
      select: { id: true, ownerName: true, petName: true, status: true },
      orderBy: { submittedAt: 'asc' },
    }),
  ]);

  const references = [
    compactReferences(
      'campaign_media',
      'Campaign media',
      campaignMedia.map((row) => ({
        id: row.id,
        label: row.campaign.title,
        extra: {
          campaignId: row.campaign.id,
          campaignTitle: row.campaign.title,
          role: row.role,
        },
      })),
    ),
    compactReferences(
      'campaign_cover',
      'Campaign cover image',
      campaignCovers.map((row) => ({
        id: row.id,
        label: row.title,
        extra: { campaignId: row.id, campaignTitle: row.title },
      })),
    ),
    compactReferences(
      'news_cover',
      'News cover image',
      newsCovers.map((row) => ({ id: row.id, label: row.title })),
    ),
    compactReferences(
      'event_cover',
      'Event cover image',
      eventCovers.map((row) => ({ id: row.id, label: row.title })),
    ),
    compactReferences(
      'committee_photo',
      'Committee member photo',
      committeePhotos.map((row) => ({
        id: row.id,
        label: row.name,
        extra: { designation: row.designation },
      })),
    ),
    compactReferences(
      'seo_image',
      'SEO OG image',
      seoImages.map((row) => ({
        id: row.id,
        label: row.title ?? row.route,
        extra: { route: row.route },
      })),
    ),
    compactReferences(
      'homepage_section_item_media',
      'Homepage section media',
      homepageSectionItems.map((row) => ({
        id: row.id,
        label: row.title ?? row.section.type,
        extra: {
          homepageId: row.section.homepage.id,
          homepageLocale: row.section.homepage.locale,
          sectionId: row.section.id,
          sectionType: row.section.type,
        },
      })),
    ),
    compactReferences(
      'hero_desktop_image',
      'Hero slide desktop image',
      heroDesktopImages.map((row) => ({
        id: row.id,
        label: row.title,
        extra: { locale: row.locale, status: row.status },
      })),
    ),
    compactReferences(
      'hero_mobile_image',
      'Hero slide mobile image',
      heroMobileImages.map((row) => ({
        id: row.id,
        label: row.title,
        extra: { locale: row.locale, status: row.status },
      })),
    ),
    compactReferences(
      'hero_video',
      'Hero slide video',
      heroVideos.map((row) => ({
        id: row.id,
        label: row.title,
        extra: { locale: row.locale, status: row.status },
      })),
    ),
    compactReferences(
      'partner_logo',
      'Partner logo',
      partnerLogos.map((row) => ({ id: row.id, label: row.name })),
    ),
    compactReferences(
      'footer_logo',
      'Footer logo',
      footerLogos.map((row) => ({
        id: row.id,
        label: row.brandName ?? row.locale,
        extra: { locale: row.locale },
      })),
    ),
    compactReferences(
      'community_zone_cover',
      'Community zone cover',
      communityZoneCovers.map((row) => ({ id: row.id, label: row.name })),
    ),
    compactReferences(
      'transparency_report_cover',
      'Transparency report cover',
      transparencyReportCovers.map((row) => ({ id: row.id, label: row.title })),
    ),
    compactReferences(
      'pet_photo',
      'Pet photo',
      petPhotos.map((row) => ({
        id: row.id,
        label: row.name,
        extra: { ownerName: row.owner.ownerName },
      })),
    ),
    compactReferences(
      'pet_census_photo',
      'Pet census photo',
      petCensusPhotos.map((row) => ({
        id: row.id,
        label: row.petName || row.ownerName,
        extra: { ownerName: row.ownerName, status: row.status },
      })),
    ),
  ].filter((value): value is MediaUsageReference => Boolean(value));

  return {
    mediaFileId,
    totalReferences: references.reduce((sum, ref) => sum + ref.count, 0),
    references,
  };
}

export function buildMediaInUseError(report: MediaUsageReport): AppError {
  const campaignRefs = report.references
    .filter((ref) => ref.type === 'campaign_media' || ref.type === 'campaign_cover')
    .flatMap((ref) =>
      ref.items
        .map((item) => ({
          campaignId: String(item.extra?.campaignId ?? item.id),
          campaignTitle:
            typeof item.extra?.campaignTitle === 'string'
              ? item.extra.campaignTitle
              : item.label ?? null,
          role:
            typeof item.extra?.role === 'string'
              ? item.extra.role
              : ref.type === 'campaign_cover'
                ? 'cover'
                : null,
        })),
    );

  return new AppError(
    409,
    'MEDIA_FILE_IN_USE',
    'This media file is currently used by one or more campaigns or content modules. Remove those references before deleting it from the media library.',
    [
      {
        mediaFileId: report.mediaFileId,
        referenceCount: report.totalReferences,
        referenceTypes: report.references.map((ref) => ({
          type: ref.type,
          label: ref.label,
          count: ref.count,
          items: ref.items,
        })),
        campaigns: campaignRefs,
      },
    ],
  );
}
