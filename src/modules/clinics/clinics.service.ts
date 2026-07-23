import { Prisma } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { uniqueClinicBranchSlug } from '../../utils/slug';
import * as repo from './clinics.repository';
import type {
  CreateClinicOrganizationDto,
  UpdateClinicOrganizationDto,
  ClinicOrganizationListQuery,
  CreateClinicBranchDto,
  UpdateClinicBranchDto,
  ClinicBranchListQuery,
  UpdateClinicBranchRelatedDto,
} from './clinics.types';

function normalizeForPrisma<T extends Record<string, unknown>>(dto: T): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    input[k] = v === null ? null : v === undefined ? undefined : v;
  }
  return input;
}

/**
 * Validates a Media Library reference before it's newly assigned to a
 * clinic (logo, cover, or a gallery image): the record must exist and must
 * be an image. A `null`/`undefined` id is always fine — it means "no media
 * selected" (or "keep the legacy URL as-is" on update).
 */
async function assertValidImageMedia(mediaFileId: string | null | undefined): Promise<void> {
  if (!mediaFileId) return;
  const media = await repo.getMediaFileById(mediaFileId);
  if (!media) throw AppError.badRequest('Selected media file does not exist');
  if (!media.mimeType.startsWith('image/')) {
    throw AppError.badRequest('Selected media file is not an image');
  }
}

function isUniqueConstraintError(err: unknown, target: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    (Array.isArray(err.meta?.target) ? (err.meta!.target as string[]).includes(target) : String(err.meta?.target ?? '').includes(target))
  );
}

// ─── Organizations ──────────────────────────────────────────────────────────

export async function createOrganization(dto: CreateClinicOrganizationDto, createdById: string) {
  const existing = await repo.getOrganizationBySlug(dto.slug);
  if (existing) throw AppError.conflict(`Slug "${dto.slug}" is already in use`);
  await assertValidImageMedia(dto.logoMediaId);
  await assertValidImageMedia(dto.coverMediaId);
  return repo.createOrganization(normalizeForPrisma(dto as unknown as Record<string, unknown>), createdById);
}

export async function listOrganizations(query: ClinicOrganizationListQuery) {
  return repo.listOrganizations(query);
}

export async function getOrganization(id: string) {
  const org = await repo.getOrganizationById(id);
  if (!org) throw AppError.notFound('Clinic organization not found');
  return org;
}

export async function updateOrganization(
  id: string,
  dto: UpdateClinicOrganizationDto,
  updatedById: string,
) {
  await getOrganization(id);
  if (dto.slug) {
    const existing = await repo.getOrganizationBySlug(dto.slug);
    if (existing && existing.id !== id) throw AppError.conflict(`Slug "${dto.slug}" is already in use`);
  }
  if (dto.logoMediaId !== undefined) await assertValidImageMedia(dto.logoMediaId);
  if (dto.coverMediaId !== undefined) await assertValidImageMedia(dto.coverMediaId);
  return repo.updateOrganization(id, normalizeForPrisma(dto as unknown as Record<string, unknown>), updatedById);
}

export async function setOrganizationPublished(id: string, published: boolean, updatedById: string) {
  await getOrganization(id);
  return repo.updateOrganization(id, { published }, updatedById);
}

export async function setOrganizationArchived(id: string, archived: boolean, actorId: string) {
  await getOrganization(id);
  await repo.setOrganizationArchived(id, archived, actorId);
  return getOrganization(id);
}

/**
 * Permanent deletion must never silently take active branches with it.
 * Callers are expected to archive/reassign/delete branches individually
 * first; this only reports what's blocking so the admin UI can show it.
 */
export async function assertOrganizationDeletable(id: string): Promise<void> {
  const activeBranchCount = await repo.countActiveBranches(id);
  if (activeBranchCount > 0) {
    const sample = await repo.listBranchNamesForOrganization(id, 10);
    throw AppError.conflict(
      `Cannot permanently delete this organization: it still has ${activeBranchCount} active branch(es) ` +
        `(${sample.join(', ')}${activeBranchCount > sample.length ? ', …' : ''}). ` +
        'Archive or delete those branches first.',
    );
  }
}

export async function deleteOrganization(id: string) {
  await getOrganization(id);
  await assertOrganizationDeletable(id);
  return repo.deleteOrganization(id);
}

export async function bulkSetOrganizationPublished(ids: string[], published: boolean, updatedById: string) {
  return repo.bulkSetOrganizationPublished(ids, published, updatedById);
}

export async function bulkSetOrganizationArchived(ids: string[], archived: boolean, actorId: string) {
  return repo.bulkSetOrganizationArchived(ids, archived, actorId);
}

// ─── Branches ────────────────────────────────────────────────────────────────

export async function createBranch(dto: CreateClinicBranchDto, createdById: string) {
  const organization = await getOrganization(dto.organizationId);
  const slug = await uniqueClinicBranchSlug(organization.slug, dto.area ?? dto.branchName);
  if (dto.published) {
    assertBranchPublishable({ ...dto, phones: [], organizationId: dto.organizationId });
  }
  return repo.createBranch(
    normalizeForPrisma({ ...dto, slug } as unknown as Record<string, unknown>),
    createdById,
  );
}

export async function listBranches(query: ClinicBranchListQuery) {
  return repo.listBranches(query);
}

export async function getBranch(id: string) {
  const branch = await repo.getBranchById(id);
  if (!branch) throw AppError.notFound('Clinic branch not found');
  return branch;
}

export async function updateBranch(id: string, dto: UpdateClinicBranchDto, updatedById: string) {
  const existing = await getBranch(id);
  if (dto.published) {
    assertBranchPublishable({ ...existing, ...dto, phones: existing.phones });
  }
  return repo.updateBranch(id, normalizeForPrisma(dto as unknown as Record<string, unknown>), updatedById);
}

export async function setBranchPublished(id: string, published: boolean, updatedById: string) {
  const existing = await getBranch(id);
  if (published) {
    assertBranchPublishable(existing);
  }
  return repo.updateBranch(id, { published }, updatedById);
}

export async function setBranchArchived(id: string, archived: boolean, actorId: string) {
  await getBranch(id);
  await repo.setBranchArchived(id, archived, actorId);
  return getBranch(id);
}

export async function deleteBranch(id: string) {
  await getBranch(id);
  return repo.deleteBranch(id);
}

/**
 * Bulk-publish must apply the same publishing prerequisites as a single
 * publish — silently skips (rather than force-publishes) any branch that
 * doesn't meet them, and reports which ones were skipped.
 */
export async function bulkSetBranchPublished(
  ids: string[],
  published: boolean,
  updatedById: string,
): Promise<{ count: number; skipped: string[] }> {
  if (!published) {
    const count = await repo.bulkSetBranchPublished(ids, false, updatedById);
    return { count, skipped: [] };
  }
  const branches = await Promise.all(ids.map((id) => repo.getBranchById(id)));
  const publishable: string[] = [];
  const skipped: string[] = [];
  for (const branch of branches) {
    if (!branch) continue;
    try {
      assertBranchPublishable(branch);
      publishable.push(branch.id);
    } catch {
      skipped.push(branch.id);
    }
  }
  const count = publishable.length > 0 ? await repo.bulkSetBranchPublished(publishable, true, updatedById) : 0;
  return { count, skipped };
}

export async function bulkSetBranchArchived(ids: string[], archived: boolean, actorId: string) {
  return repo.bulkSetBranchArchived(ids, archived, actorId);
}

/**
 * Clones a branch's fields and phones/services/facilities/etc. as an
 * unpublished, unverified draft — never carries over `published`/
 * `verificationStatus`/`lastVerifiedAt`, since a duplicate is a new
 * physical location an admin still has to confirm independently.
 */
export async function duplicateBranch(id: string, createdById: string) {
  const source = await getBranch(id);
  const organization = await getOrganization(source.organizationId);
  const branchName = `${source.branchName} (Copy)`;
  const slug = await uniqueClinicBranchSlug(organization.slug, source.area ?? branchName);
  return repo.duplicateBranch(source, { branchName, slug }, createdById);
}

/**
 * Publishing a branch has real prerequisites — a branch that fails these
 * must never end up `published: true` even if the caller passes
 * `published: true` explicitly (e.g. via a bulk action or a stale form).
 */
export function assertBranchPublishable(branch: {
  branchName?: string | null;
  address?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  email?: string | null;
  phones: { phoneNumber: string }[];
  organizationId?: string | null;
}): void {
  if (!branch.branchName || !branch.branchName.trim()) {
    throw AppError.badRequest('Branch name is required before publishing');
  }
  if (!branch.organizationId) {
    throw AppError.badRequest('Branch must belong to an organization before publishing');
  }
  const hasLocation = Boolean(branch.address?.trim()) || (branch.latitude != null && branch.longitude != null);
  if (!hasLocation) {
    throw AppError.badRequest('Branch needs an address or map coordinates before publishing');
  }
  const hasContact = branch.phones.length > 0 || Boolean(branch.email?.trim());
  if (!hasContact) {
    throw AppError.badRequest('Branch needs at least one phone number or an email before publishing');
  }
}

export async function updateBranchRelated(id: string, dto: UpdateClinicBranchRelatedDto) {
  await getBranch(id);
  if (dto.images) {
    const mediaIds = dto.images.map((i) => i.mediaFileId).filter((v): v is string => Boolean(v));
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw AppError.conflict('The same Media Library image cannot be added to the gallery twice');
    }
    for (const mediaFileId of new Set(mediaIds)) {
      await assertValidImageMedia(mediaFileId);
    }
  }
  return repo.replaceBranchRelated(id, dto);
}

export async function addBranchImage(
  id: string,
  image: { url: string; mediaFileId?: string | null; isCover: boolean; sortOrder: number; altText?: string | null },
) {
  await getBranch(id);
  await assertValidImageMedia(image.mediaFileId);
  try {
    return await repo.addBranchImage(id, image);
  } catch (err) {
    if (isUniqueConstraintError(err, 'media_file_id')) {
      throw AppError.conflict('This image is already in the gallery');
    }
    throw err;
  }
}

export async function removeBranchImage(id: string, imageId: string) {
  await getBranch(id);
  return repo.removeBranchImage(id, imageId);
}

export async function reorderBranchImages(id: string, order: string[]) {
  await getBranch(id);
  return repo.reorderBranchImages(id, order);
}

/**
 * Data-quality signal for the admin directory: flags branches missing
 * information an admin would want to fix before publishing, without ever
 * inferring or defaulting the missing value itself.
 */
export function branchDataQualityWarnings(branch: {
  latitude: unknown;
  longitude: unknown;
  phones: unknown[];
  openingHours: unknown[];
  verificationStatus: string;
}): string[] {
  const warnings: string[] = [];
  if (branch.latitude == null || branch.longitude == null) warnings.push('missing_coordinates');
  if (branch.phones.length === 0) warnings.push('missing_phone');
  if (branch.openingHours.length === 0) warnings.push('missing_hours');
  if (branch.verificationStatus !== 'VERIFIED') warnings.push('not_verified');
  return warnings;
}
