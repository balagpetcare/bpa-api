import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response';
import { auditContextFromRequest, auditCreate, auditUpdate, auditDelete, writeAuditLog } from '../../utils/audit';
import { AuditAction } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import * as svc from './clinics.service';
import type {
  CreateClinicOrganizationDto,
  UpdateClinicOrganizationDto,
  ClinicOrganizationListQuery,
  CreateClinicBranchDto,
  UpdateClinicBranchDto,
  ClinicBranchListQuery,
  UpdateClinicBranchRelatedDto,
  ArchiveEntityDto,
  PermanentDeleteDto,
  BulkClinicOrganizationActionDto,
  BulkClinicBranchActionDto,
} from './clinics.types';

// ─── Organizations ──────────────────────────────────────────────────────────

export async function createOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateClinicOrganizationDto;
    const org = await svc.createOrganization(dto, req.user!.sub);
    await auditCreate('clinic_organization', org.id, { name: dto.name, slug: dto.slug }, auditContextFromRequest(req));
    sendCreated(res, org);
  } catch (err) { next(err); }
}

export async function listOrganizationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listOrganizations(req.query as never as ClinicOrganizationListQuery);
    sendSuccess(res, result.items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await svc.getOrganization(req.params.id));
  } catch (err) { next(err); }
}

export async function updateOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateClinicOrganizationDto;
    const updated = await svc.updateOrganization(req.params.id, dto, req.user!.sub);
    await auditUpdate('clinic_organization', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function publishOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { published } = req.body as { published: boolean };
    const updated = await svc.setOrganizationPublished(req.params.id, published, req.user!.sub);
    await auditUpdate('clinic_organization', req.params.id, {}, { published }, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const org = await svc.getOrganization(req.params.id);
    const { reason, confirmationText } = req.body as PermanentDeleteDto;
    if (confirmationText.trim() !== org.slug && confirmationText.trim() !== org.name) {
      throw AppError.badRequest("Typed confirmation does not match this organization's name or slug");
    }
    await svc.deleteOrganization(req.params.id);
    await writeAuditLog(
      { action: AuditAction.delete, resource: 'clinic_organization', resourceId: req.params.id, oldValues: { name: org.name, slug: org.slug }, reason },
      auditContextFromRequest(req),
    );
    sendSuccess(res, { message: 'Clinic organization permanently deleted' });
  } catch (err) { next(err); }
}

export async function archiveOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = req.body as ArchiveEntityDto;
    const updated = await svc.setOrganizationArchived(req.params.id, true, req.user!.sub);
    await writeAuditLog(
      { action: AuditAction.archive, resource: 'clinic_organization', resourceId: req.params.id, reason },
      auditContextFromRequest(req),
    );
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function restoreOrganizationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await svc.setOrganizationArchived(req.params.id, false, req.user!.sub);
    await writeAuditLog(
      { action: AuditAction.restore, resource: 'clinic_organization', resourceId: req.params.id },
      auditContextFromRequest(req),
    );
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function bulkOrganizationActionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids, action } = req.body as BulkClinicOrganizationActionDto;
    const actorId = req.user!.sub;
    let count = 0;
    if (action === 'publish') count = await svc.bulkSetOrganizationPublished(ids, true, actorId);
    else if (action === 'unpublish') count = await svc.bulkSetOrganizationPublished(ids, false, actorId);
    else if (action === 'archive') count = await svc.bulkSetOrganizationArchived(ids, true, actorId);
    else if (action === 'restore') count = await svc.bulkSetOrganizationArchived(ids, false, actorId);
    await writeAuditLog(
      {
        action: action === 'archive' ? AuditAction.archive : action === 'restore' ? AuditAction.restore : action === 'publish' ? AuditAction.publish : AuditAction.unpublish,
        resource: 'clinic_organization_bulk',
        newValues: { ids, count },
      },
      auditContextFromRequest(req),
    );
    sendSuccess(res, { affected: count });
  } catch (err) { next(err); }
}

// ─── Branches ────────────────────────────────────────────────────────────────

export async function createBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as CreateClinicBranchDto;
    const branch = await svc.createBranch(dto, req.user!.sub);
    await auditCreate('clinic_branch', branch.id, { branchName: dto.branchName }, auditContextFromRequest(req));
    sendCreated(res, branch);
  } catch (err) { next(err); }
}

export async function listBranchesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svc.listBranches(req.query as never as ClinicBranchListQuery);
    const items = result.items.map((b) => ({
      ...b,
      dataQualityWarnings: svc.branchDataQualityWarnings(b),
    }));
    sendSuccess(res, items, 200, result.meta);
  } catch (err) { next(err); }
}

export async function getBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branch = await svc.getBranch(req.params.id);
    sendSuccess(res, { ...branch, dataQualityWarnings: svc.branchDataQualityWarnings(branch) });
  } catch (err) { next(err); }
}

export async function updateBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateClinicBranchDto;
    const updated = await svc.updateBranch(req.params.id, dto, req.user!.sub);
    await auditUpdate('clinic_branch', req.params.id, {}, dto as Record<string, unknown>, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function publishBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { published } = req.body as { published: boolean };
    const updated = await svc.setBranchPublished(req.params.id, published, req.user!.sub);
    await auditUpdate('clinic_branch', req.params.id, {}, { published }, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function deleteBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branch = await svc.getBranch(req.params.id);
    const { reason, confirmationText } = req.body as PermanentDeleteDto;
    if (confirmationText.trim() !== branch.branchName && confirmationText.trim() !== branch.slug) {
      throw AppError.badRequest("Typed confirmation does not match this branch's name or slug");
    }
    await svc.deleteBranch(req.params.id);
    await writeAuditLog(
      { action: AuditAction.delete, resource: 'clinic_branch', resourceId: req.params.id, oldValues: { branchName: branch.branchName }, reason },
      auditContextFromRequest(req),
    );
    sendSuccess(res, { message: 'Clinic branch permanently deleted' });
  } catch (err) { next(err); }
}

export async function archiveBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = req.body as ArchiveEntityDto;
    const updated = await svc.setBranchArchived(req.params.id, true, req.user!.sub);
    await writeAuditLog(
      { action: AuditAction.archive, resource: 'clinic_branch', resourceId: req.params.id, reason },
      auditContextFromRequest(req),
    );
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function restoreBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await svc.setBranchArchived(req.params.id, false, req.user!.sub);
    await writeAuditLog(
      { action: AuditAction.restore, resource: 'clinic_branch', resourceId: req.params.id },
      auditContextFromRequest(req),
    );
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function duplicateBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const duplicated = await svc.duplicateBranch(req.params.id, req.user!.sub);
    await auditCreate('clinic_branch', duplicated.id, { branchName: duplicated.branchName, duplicatedFrom: req.params.id }, auditContextFromRequest(req));
    sendCreated(res, duplicated);
  } catch (err) { next(err); }
}

export async function bulkBranchActionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids, action } = req.body as BulkClinicBranchActionDto;
    const actorId = req.user!.sub;
    let count = 0;
    let skipped: string[] = [];
    if (action === 'publish') {
      const result = await svc.bulkSetBranchPublished(ids, true, actorId);
      count = result.count;
      skipped = result.skipped;
    } else if (action === 'unpublish') {
      const result = await svc.bulkSetBranchPublished(ids, false, actorId);
      count = result.count;
    } else if (action === 'archive') count = await svc.bulkSetBranchArchived(ids, true, actorId);
    else if (action === 'restore') count = await svc.bulkSetBranchArchived(ids, false, actorId);
    await writeAuditLog(
      {
        action: action === 'archive' ? AuditAction.archive : action === 'restore' ? AuditAction.restore : action === 'publish' ? AuditAction.publish : AuditAction.unpublish,
        resource: 'clinic_branch_bulk',
        newValues: { ids, count, skipped },
      },
      auditContextFromRequest(req),
    );
    sendSuccess(res, { affected: count, skipped });
  } catch (err) { next(err); }
}

export async function updateBranchRelatedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = req.body as UpdateClinicBranchRelatedDto;
    const updated = await svc.updateBranchRelated(req.params.id, dto);
    await auditUpdate('clinic_branch_related', req.params.id, {}, { keys: Object.keys(dto) }, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function addBranchImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const image = req.body as { url: string; isCover: boolean; sortOrder: number; altText?: string | null };
    const updated = await svc.addBranchImage(req.params.id, image);
    await auditCreate('clinic_branch_image', req.params.id, { url: image.url }, auditContextFromRequest(req));
    sendCreated(res, updated);
  } catch (err) { next(err); }
}

export async function removeBranchImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await svc.removeBranchImage(req.params.id, req.params.imageId);
    await auditDelete('clinic_branch_image', req.params.imageId, {}, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function reorderBranchImagesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { order } = req.body as { order: string[] };
    const updated = await svc.reorderBranchImages(req.params.id, order);
    await auditUpdate('clinic_branch_images_order', req.params.id, {}, { order }, auditContextFromRequest(req));
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}
