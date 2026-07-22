import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';
import type { CreateTransparencyReportDto, UpdateTransparencyReportDto, ReportListQuery } from './transparency-reports.types';

const reportInclude = {
  coverImage: { select: { id: true, url: true, altText: true } },
} as const;

export async function createReport(dto: CreateTransparencyReportDto) {
  return prisma.transparencyReport.create({
    data: {
      title: dto.title,
      slug: dto.slug,
      reportType: dto.reportType,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      totalCollectedBdt: dto.totalCollectedBdt,
      totalSpentBdt: dto.totalSpentBdt,
      balanceBdt: dto.balanceBdt ?? dto.totalCollectedBdt - dto.totalSpentBdt,
      breakdownJson: dto.breakdownJson as Prisma.InputJsonValue ?? Prisma.JsonNull,
      summaryMd: dto.summaryMd,
      bodyMd: dto.bodyMd,
      attachmentUrl: dto.attachmentUrl,
      coverImageId: dto.coverImageId,
    },
    include: reportInclude,
  });
}

export async function listReports(query: ReportListQuery) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.TransparencyReportWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.reportType) where.reportType = query.reportType;
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
      { summaryMd: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.transparencyReport.findMany({ where, skip, take: limit, orderBy: { periodStart: 'desc' }, include: reportInclude }),
    prisma.transparencyReport.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function listPublishedReports(query: { page?: number; limit?: number }) {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const where: Prisma.TransparencyReportWhereInput = { status: 'published' };
  const [items, total] = await Promise.all([
    prisma.transparencyReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true, title: true, slug: true, reportType: true,
        periodStart: true, periodEnd: true,
        totalCollectedBdt: true, totalSpentBdt: true, balanceBdt: true,
        summaryMd: true, attachmentUrl: true, publishedAt: true,
        coverImage: { select: { id: true, url: true, altText: true } },
      },
    }),
    prisma.transparencyReport.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function getReportById(id: string) {
  return prisma.transparencyReport.findUnique({ where: { id }, include: reportInclude });
}

export async function getReportBySlug(slug: string) {
  return prisma.transparencyReport.findUnique({ where: { slug }, include: reportInclude });
}

export async function findReportBySlug(slug: string) {
  return prisma.transparencyReport.findUnique({ where: { slug }, select: { id: true } });
}

export async function updateReport(id: string, dto: UpdateTransparencyReportDto) {
  const { breakdownJson, periodStart, periodEnd, ...rest } = dto;
  const data: Prisma.TransparencyReportUpdateInput = { ...rest };
  if (periodStart) data.periodStart = new Date(periodStart);
  if (periodEnd) data.periodEnd = new Date(periodEnd);
  if (breakdownJson !== undefined) {
    data.breakdownJson = breakdownJson !== null
      ? (breakdownJson as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }
  return prisma.transparencyReport.update({ where: { id }, data, include: reportInclude });
}

export async function publishReport(id: string) {
  return prisma.transparencyReport.update({
    where: { id },
    data: { status: 'published', publishedAt: new Date() },
    include: reportInclude,
  });
}

export async function unpublishReport(id: string) {
  return prisma.transparencyReport.update({
    where: { id },
    data: { status: 'draft', publishedAt: null },
    include: reportInclude,
  });
}

export async function deleteReport(id: string) {
  return prisma.transparencyReport.delete({ where: { id } });
}

export async function getPublicTransparencySummary() {
  const paidContributionWhere: Prisma.CareContributionWhereInput = {
    status: 'paid',
    payment: {
      is: {
        status: 'success',
        purpose: 'CARE_PARTNER_CONTRIBUTION',
        entityType: 'care_partner',
      },
    },
  };

  const [
    totalContributors,
    totalAmountResult,
    zones,
    publishedSpendResult,
    publishedCollectedResult,
    publishedReportCount,
  ] = await Promise.all([
    prisma.careContribution.count({ where: paidContributionWhere }),
    prisma.careContribution.aggregate({ where: paidContributionWhere, _sum: { amountBdt: true } }),
    prisma.communityZone.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        targetContributors: true,
        targetAmountBdt: true,
        contributions: {
          where: paidContributionWhere,
          select: { amountBdt: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 8,
    }),
    prisma.transparencyReport.aggregate({
      where: { status: 'published' },
      _sum: { totalSpentBdt: true },
    }),
    prisma.transparencyReport.aggregate({
      where: { status: 'published' },
      _sum: { totalCollectedBdt: true },
    }),
    prisma.transparencyReport.count({ where: { status: 'published' } }),
  ]);

  const totalCollectedBdt = Number(totalAmountResult._sum.amountBdt ?? 0);
  const totalPublishedSpentBdt = Number(publishedSpendResult._sum.totalSpentBdt ?? 0);

  return {
    totalCollectedBdt,
    totalContributors,
    totalPublishedSpentBdt,
    totalPublishedReportCollectedBdt: Number(publishedCollectedResult._sum.totalCollectedBdt ?? 0),
    publishedReportCount,
    balanceBdt: totalCollectedBdt - totalPublishedSpentBdt,
    balanceLabel: 'Collected Care Partner contributions minus spending published in transparency reports',
    zones: zones.map((zone) => {
      const currentContributors = zone.contributions.length;
      const currentAmountBdt = zone.contributions.reduce((sum, item) => sum + Number(item.amountBdt), 0);
      return {
        id: zone.id,
        name: zone.name,
        slug: zone.slug,
        targetContributors: zone.targetContributors,
        currentContributors,
        targetAmountBdt: Number(zone.targetAmountBdt),
        currentAmountBdt,
        progressPercent: zone.targetContributors > 0
          ? Math.min(100, Math.round((currentContributors / zone.targetContributors) * 100))
          : 0,
      };
    }),
  };
}
