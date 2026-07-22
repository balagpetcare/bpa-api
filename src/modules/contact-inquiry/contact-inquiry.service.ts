import { Request } from 'express';
import { AppError } from '../../utils/AppError';
import { notifyAdmins } from '../notifications/notifications.service';
import { sendMail } from '../mail/mail-send.service';
import { sendTransactionalSms } from '../../services/sms.service';
import {
  createInquiry,
  getInquiryById,
  listInquiries,
  markInquiryRead,
  updateInquiryStatus,
  assignInquiry,
  createReply,
  createForward,
  createNote,
  deleteNote,
  contactTypeRepo,
  categoryRepo,
  departmentRepo,
  priorityRuleRepo,
} from './contact-inquiry.repository';
import {
  SubmitInquiryDto,
  InquiryListQuery,
  UpdateInquiryStatusDto,
  AssignInquiryDto,
  ReplyInquiryDto,
  ForwardInquiryDto,
  SendSmsDto,
  AddNoteDto,
  UpsertContactTypeDto,
  UpsertCategoryDto,
  UpsertDepartmentDto,
  UpsertPriorityRuleDto,
} from './contact-inquiry.types';

// ─── Public ───────────────────────────────────────────────────────

export async function submitInquiry(dto: SubmitInquiryDto, req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
  const userAgent = req.headers['user-agent'];
  const result = await createInquiry(dto, ip, userAgent);

  notifyAdmins({
    type: 'contact_inquiry',
    title: `New Contact Inquiry: ${dto.subject ?? '(no subject)'}`,
    message: `From ${dto.name} — ${dto.subject ?? 'General inquiry'}`,
    module: 'contact-inquiry',
    entityType: 'ContactInquiry',
    entityId: result.id,
    priority: (result as any).priority === 'urgent' ? 'high' : 'normal',
    actionUrl: `/contact-inquiries/${result.id}`,
    dedupeKey: `contact_inquiry:${result.id}:new`,
    createdForRole: 'admin',
  });

  return result;
}

// ─── Admin Inbox ──────────────────────────────────────────────────

export async function getInquiriesList(query: InquiryListQuery) {
  return listInquiries(query);
}

export async function getInquiryDetail(id: string, _userId: string) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');

  if (inquiry.status === 'new') {
    await markInquiryRead(id);
    inquiry.status = 'read';
    inquiry.readAt = new Date();
  }

  return inquiry;
}

export async function changeInquiryStatus(id: string, dto: UpdateInquiryStatusDto) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');
  return updateInquiryStatus(id, dto.status);
}

export async function assignInquiryToTeam(id: string, dto: AssignInquiryDto) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');
  return assignInquiry(id, dto);
}

// ─── Reply ────────────────────────────────────────────────────────

export async function replyToInquiry(id: string, dto: ReplyInquiryDto, sentById: string) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');

  const subject = dto.subject;
  const bodyHtml = dto.bodyHtml;

  await sendMail({
    fromAccountId: dto.fromAccountId,
    to: dto.to,
    cc: dto.cc,
    subject,
    bodyHtml,
    useTemplate: dto.useTemplate,
    layoutKey: dto.layoutKey,
  });

  await createReply({
    inquiryId: id,
    mailAccountId: dto.fromAccountId,
    toAddresses: dto.to,
    ccAddresses: dto.cc ?? [],
    subject,
    bodyHtml,
    sentById,
  });

  if (dto.markResolved) {
    await updateInquiryStatus(id, 'resolved');
  } else if (inquiry.status === 'new' || inquiry.status === 'read' || inquiry.status === 'pending') {
    await updateInquiryStatus(id, 'in_progress');
  }

  return { success: true };
}

// ─── Forward ──────────────────────────────────────────────────────

export async function forwardInquiry(id: string, dto: ForwardInquiryDto, forwardedById: string) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');

  await sendMail({
    fromAccountId: dto.fromAccountId,
    to: dto.to,
    cc: dto.cc,
    subject: dto.subject,
    bodyHtml: dto.bodyHtml,
  });

  await createForward({
    inquiryId: id,
    toAddresses: dto.to,
    ccAddresses: dto.cc ?? [],
    subject: dto.subject,
    bodyHtml: dto.bodyHtml,
    note: dto.note,
    forwardedById,
  });

  return { success: true };
}

// ─── SMS ──────────────────────────────────────────────────────────

export async function sendSmsToInquirer(id: string, dto: SendSmsDto) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');

  const phone = dto.phone || inquiry.phone || inquiry.whatsapp;
  if (!phone) throw AppError.badRequest('No phone number available for this inquiry');

  await sendTransactionalSms({
    to: phone,
    message: dto.message,
    module: 'contact_inquiry',
    entityType: 'ContactInquiry',
    entityId: id,
    reference: inquiry.ticketNumber,
  });

  return { success: true };
}

// ─── Internal Notes ───────────────────────────────────────────────

export async function addInternalNote(id: string, dto: AddNoteDto, userId: string) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) throw AppError.notFound('Inquiry not found');
  return createNote({ inquiryId: id, note: dto.note, createdById: userId });
}

export async function removeInternalNote(inquiryId: string, noteId: string, userId: string, isAdmin: boolean) {
  const inquiry = await getInquiryById(inquiryId);
  if (!inquiry) throw AppError.notFound('Inquiry not found');
  const result = await deleteNote(noteId, isAdmin ? noteId : userId);
  if (result.count === 0) throw AppError.forbidden('Cannot delete this note');
  return { success: true };
}

// ─── Config: Contact Types ────────────────────────────────────────

export const contactTypeService = {
  list: () => contactTypeRepo.list(),
  listActive: () => contactTypeRepo.listActive(),
  getById: async (id: string) => {
    const item = await contactTypeRepo.getById(id);
    if (!item) throw AppError.notFound('Contact type not found');
    return item;
  },
  create: (dto: UpsertContactTypeDto) => contactTypeRepo.create(dto),
  update: async (id: string, dto: Partial<UpsertContactTypeDto>) => {
    const item = await contactTypeRepo.getById(id);
    if (!item) throw AppError.notFound('Contact type not found');
    return contactTypeRepo.update(id, dto);
  },
  delete: async (id: string) => {
    const item = await contactTypeRepo.getById(id);
    if (!item) throw AppError.notFound('Contact type not found');
    return contactTypeRepo.delete(id);
  },
};

// ─── Config: Categories ───────────────────────────────────────────

export const categoryService = {
  list: () => categoryRepo.list(),
  listActive: () => categoryRepo.listActive(),
  getById: async (id: string) => {
    const item = await categoryRepo.getById(id);
    if (!item) throw AppError.notFound('Category not found');
    return item;
  },
  create: (dto: UpsertCategoryDto) => categoryRepo.create(dto),
  update: async (id: string, dto: Partial<UpsertCategoryDto>) => {
    const item = await categoryRepo.getById(id);
    if (!item) throw AppError.notFound('Category not found');
    return categoryRepo.update(id, dto);
  },
  delete: async (id: string) => {
    const item = await categoryRepo.getById(id);
    if (!item) throw AppError.notFound('Category not found');
    return categoryRepo.delete(id);
  },
};

// ─── Config: Departments ──────────────────────────────────────────

export const departmentService = {
  list: () => departmentRepo.list(),
  listActive: () => departmentRepo.listActive(),
  getById: async (id: string) => {
    const item = await departmentRepo.getById(id);
    if (!item) throw AppError.notFound('Department not found');
    return item;
  },
  create: (dto: UpsertDepartmentDto) => departmentRepo.create({ ...dto, contactEmail: dto.contactEmail || null }),
  update: async (id: string, dto: Partial<UpsertDepartmentDto>) => {
    const item = await departmentRepo.getById(id);
    if (!item) throw AppError.notFound('Department not found');
    return departmentRepo.update(id, { ...dto, contactEmail: dto.contactEmail || null });
  },
  delete: async (id: string) => {
    const item = await departmentRepo.getById(id);
    if (!item) throw AppError.notFound('Department not found');
    return departmentRepo.delete(id);
  },
};

// ─── Config: Priority Rules ───────────────────────────────────────

export const priorityRuleService = {
  list: () => priorityRuleRepo.list(),
  getById: async (id: string) => {
    const item = await priorityRuleRepo.getById(id);
    if (!item) throw AppError.notFound('Priority rule not found');
    return item;
  },
  create: (dto: UpsertPriorityRuleDto) =>
    priorityRuleRepo.create({
      contactTypeSlug: dto.contactTypeSlug,
      categorySlug: dto.categorySlug,
      priority: dto.priority,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      department: dto.departmentId ? { connect: { id: dto.departmentId } } : undefined,
    }),
  update: async (id: string, dto: Partial<UpsertPriorityRuleDto>) => {
    const item = await priorityRuleRepo.getById(id);
    if (!item) throw AppError.notFound('Priority rule not found');
    const { departmentId, ...rest } = dto;
    return priorityRuleRepo.update(id, {
      ...rest,
      department: departmentId !== undefined ? (departmentId ? { connect: { id: departmentId } } : { disconnect: true }) : undefined,
    });
  },
  delete: async (id: string) => {
    const item = await priorityRuleRepo.getById(id);
    if (!item) throw AppError.notFound('Priority rule not found');
    return priorityRuleRepo.delete(id);
  },
};
