import { AppError } from '../../utils/AppError';
import { AuditContext, auditCreate, auditUpdate, auditDelete } from '../../utils/audit';
import * as repo from './committee.repository';
import {
  CreateCommitteeMemberDto,
  UpdateCommitteeMemberDto,
  SortOrderDto,
  CommitteeListQuery,
  CommitteeMemberResponse,
} from './committee.types';

type RawMember = Awaited<ReturnType<typeof repo.findMemberById>>;

function format(m: NonNullable<RawMember>): CommitteeMemberResponse {
  return {
    id: m.id,
    name: m.name,
    designation: m.designation,
    bio: m.bio,
    photoUrl: m.photo?.url ?? null,
    email: m.email,
    phone: m.phone,
    sortOrder: m.sortOrder,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function listMembers(query: CommitteeListQuery): Promise<CommitteeMemberResponse[]> {
  const isActive =
    query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
  const rows = await repo.findAllMembers(isActive);
  return rows.map(format);
}

export async function getMemberById(id: string): Promise<CommitteeMemberResponse> {
  const m = await repo.findMemberById(id);
  if (!m) throw AppError.notFound('CommitteeMember');
  return format(m);
}

export async function createMember(
  dto: CreateCommitteeMemberDto,
  ctx: AuditContext,
): Promise<CommitteeMemberResponse> {
  const m = await repo.createMember({
    name: dto.name,
    designation: dto.designation,
    bio: dto.bio ?? undefined,
    email: dto.email ?? undefined,
    phone: dto.phone ?? undefined,
    sortOrder: dto.sortOrder ?? 0,
    isActive: dto.isActive ?? true,
    ...(dto.photoId ? { photo: { connect: { id: dto.photoId } } } : {}),
  });
  await auditCreate('committee_member', m.id, { name: m.name, designation: m.designation }, ctx);
  return format(m);
}

export async function updateMember(
  id: string,
  dto: UpdateCommitteeMemberDto,
  ctx: AuditContext,
): Promise<CommitteeMemberResponse> {
  const existing = await repo.findMemberById(id);
  if (!existing) throw AppError.notFound('CommitteeMember');

  const m = await repo.updateMember(id, {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.designation !== undefined && { designation: dto.designation }),
    ...(dto.bio !== undefined && { bio: dto.bio }),
    ...(dto.email !== undefined && { email: dto.email }),
    ...(dto.phone !== undefined && { phone: dto.phone }),
    ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    ...(dto.photoId !== undefined && {
      photo: dto.photoId ? { connect: { id: dto.photoId } } : { disconnect: true },
    }),
  });

  await auditUpdate(
    'committee_member',
    id,
    { name: existing.name },
    { name: m.name },
    ctx,
  );
  return format(m);
}

export async function deleteMember(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findMemberById(id);
  if (!existing) throw AppError.notFound('CommitteeMember');
  await repo.deleteMember(id);
  await auditDelete('committee_member', id, { name: existing.name }, ctx);
}

export async function reorderMembers(
  dto: SortOrderDto,
  ctx: AuditContext,
): Promise<CommitteeMemberResponse[]> {
  await repo.bulkUpdateSortOrder(dto.items);
  await auditUpdate('committee_member', 'bulk', {}, { reorder: dto.items.length }, ctx);
  const rows = await repo.findAllMembers();
  return rows.map(format);
}
