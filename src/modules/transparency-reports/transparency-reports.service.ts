import { AppError } from '../../utils/AppError';
import * as repo from './transparency-reports.repository';
import type { CreateTransparencyReportDto, UpdateTransparencyReportDto, ReportListQuery } from './transparency-reports.types';

function calculateBalance(collected: number, spent: number): number {
  return Number((collected - spent).toFixed(2));
}

export async function createReport(dto: CreateTransparencyReportDto) {
  const existing = await repo.findReportBySlug(dto.slug);
  if (existing) throw AppError.conflict('A transparency report with this slug already exists');
  return repo.createReport({
    ...dto,
    balanceBdt: dto.balanceBdt ?? calculateBalance(dto.totalCollectedBdt, dto.totalSpentBdt),
  });
}

export async function listReports(query: ReportListQuery) {
  return repo.listReports(query);
}

export async function listPublishedReports(query: { page?: number; limit?: number }) {
  return repo.listPublishedReports(query);
}

export async function getPublicSummary() {
  return repo.getPublicTransparencySummary();
}

export async function getReport(id: string) {
  const r = await repo.getReportById(id);
  if (!r) throw AppError.notFound('Transparency report');
  return r;
}

export async function getReportBySlug(slug: string) {
  const r = await repo.getReportBySlug(slug);
  if (!r || r.status !== 'published') throw AppError.notFound('Transparency report');
  return r;
}

export async function updateReport(id: string, dto: UpdateTransparencyReportDto) {
  const current = await getReport(id);
  if (dto.slug && dto.slug !== current.slug) {
    const existing = await repo.findReportBySlug(dto.slug);
    if (existing && existing.id !== id) throw AppError.conflict('A transparency report with this slug already exists');
  }

  const nextCollected = dto.totalCollectedBdt ?? Number(current.totalCollectedBdt);
  const nextSpent = dto.totalSpentBdt ?? Number(current.totalSpentBdt);
  const shouldRecalculateBalance =
    dto.balanceBdt === undefined &&
    (dto.totalCollectedBdt !== undefined || dto.totalSpentBdt !== undefined);

  return repo.updateReport(id, {
    ...dto,
    ...(shouldRecalculateBalance ? { balanceBdt: calculateBalance(nextCollected, nextSpent) } : {}),
  });
}

export async function publishReport(id: string) {
  const report = await getReport(id);
  if (report.status === 'published') throw AppError.badRequest('Report is already published');
  return repo.publishReport(id);
}

export async function unpublishReport(id: string) {
  const report = await getReport(id);
  if (report.status !== 'published') throw AppError.badRequest('Only published reports can be unpublished');
  return repo.unpublishReport(id);
}

export async function deleteReport(id: string) {
  await getReport(id);
  await repo.deleteReport(id);
}
