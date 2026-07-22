import { InquiryPriority, InquiryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { InquiryListQuery, SubmitInquiryDto } from './contact-inquiry.types';

// ─── Ticket number ────────────────────────────────────────────────

async function generateTicketNumber(): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INQ-${dateStr}-`;
  const latest = await prisma.contactInquiry.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: 'desc' },
    select: { ticketNumber: true },
  });
  const seq = latest ? parseInt(latest.ticketNumber.split('-').at(-1)!, 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── Priority rules ───────────────────────────────────────────────

async function resolvePriority(
  contactTypeSlug: string | undefined,
  categorySlug: string | undefined,
): Promise<{ priority: InquiryPriority; departmentId: string | null }> {
  const rules = await prisma.contactPriorityRule.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }],
  });

  // Try exact match (both type and category)
  if (contactTypeSlug && categorySlug) {
    const exact = rules.find((r: { contactTypeSlug: string | null; categorySlug: string | null; priority: InquiryPriority; departmentId: string | null }) => r.contactTypeSlug === contactTypeSlug && r.categorySlug === categorySlug);
    if (exact) return { priority: exact.priority, departmentId: exact.departmentId };
  }

  // Type-only match
  if (contactTypeSlug) {
    const byType = rules.find((r: { contactTypeSlug: string | null; categorySlug: string | null; priority: InquiryPriority; departmentId: string | null }) => r.contactTypeSlug === contactTypeSlug && !r.categorySlug);
    if (byType) return { priority: byType.priority, departmentId: byType.departmentId };
  }

  // Category-only match
  if (categorySlug) {
    const byCat = rules.find((r: { contactTypeSlug: string | null; categorySlug: string | null; priority: InquiryPriority; departmentId: string | null }) => r.categorySlug === categorySlug && !r.contactTypeSlug);
    if (byCat) return { priority: byCat.priority, departmentId: byCat.departmentId };
  }

  return { priority: 'normal', departmentId: null };
}

// ─── Public ───────────────────────────────────────────────────────

export async function createInquiry(
  dto: SubmitInquiryDto,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ id: string; ticketNumber: string }> {
  const ticketNumber = await generateTicketNumber();

  let contactTypeSlug: string | undefined;
  let categorySlug: string | undefined;

  if (dto.contactTypeId) {
    const ct = await prisma.contactType.findUnique({ where: { id: dto.contactTypeId }, select: { slug: true } });
    contactTypeSlug = ct?.slug;
  }
  if (dto.categoryId) {
    const cat = await prisma.inquiryCategory.findUnique({ where: { id: dto.categoryId }, select: { slug: true } });
    categorySlug = cat?.slug;
  }

  const { priority, departmentId } = await resolvePriority(contactTypeSlug, categorySlug);

  const inquiry = await prisma.contactInquiry.create({
    data: {
      ticketNumber,
      contactTypeId: dto.contactTypeId,
      categoryId: dto.categoryId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      whatsapp: dto.whatsapp,
      country: dto.country,
      city: dto.city,
      organizationName: dto.organizationName,
      designation: dto.designation,
      website: dto.website || null,
      subject: dto.subject,
      message: dto.message,
      attachmentUrl: dto.attachmentUrl,
      consentGiven: dto.consentGiven,
      priority,
      departmentId,
      ipAddress,
      userAgent,
    },
    select: { id: true, ticketNumber: true },
  });

  return inquiry;
}

// ─── Admin List ───────────────────────────────────────────────────

const inquiryListSelect = {
  id: true,
  ticketNumber: true,
  name: true,
  email: true,
  phone: true,
  subject: true,
  priority: true,
  status: true,
  country: true,
  createdAt: true,
  readAt: true,
  contactType: { select: { slug: true, labelEn: true } },
  category: { select: { slug: true, labelEn: true } },
  department: { select: { slug: true, nameEn: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.ContactInquirySelect;

export async function listInquiries(query: InquiryListQuery) {
  const where: Prisma.ContactInquiryWhereInput = {};

  if (query.search) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { subject: { contains: s, mode: 'insensitive' } },
      { ticketNumber: { contains: s, mode: 'insensitive' } },
    ];
  }

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.contactTypeId) where.contactTypeId = query.contactTypeId;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.country) where.country = { contains: query.country, mode: 'insensitive' };

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.contactInquiry.count({ where }),
    prisma.contactInquiry.findMany({
      where,
      select: inquiryListSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, items };
}

// ─── Admin Detail ─────────────────────────────────────────────────

export async function getInquiryById(id: string) {
  return prisma.contactInquiry.findUnique({
    where: { id },
    include: {
      contactType: { select: { slug: true, labelEn: true, labelBn: true } },
      category: { select: { slug: true, labelEn: true, labelBn: true } },
      department: { select: { id: true, slug: true, nameEn: true, contactEmail: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      replies: {
        select: {
          id: true,
          toAddresses: true,
          ccAddresses: true,
          subject: true,
          bodyHtml: true,
          sentAt: true,
          sentBy: { select: { id: true, name: true } },
        },
        orderBy: { sentAt: 'asc' },
      },
      forwards: {
        select: {
          id: true,
          toAddresses: true,
          subject: true,
          note: true,
          forwardedAt: true,
          forwardedBy: { select: { id: true, name: true } },
        },
        orderBy: { forwardedAt: 'asc' },
      },
      internalNotes: {
        select: {
          id: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

// ─── Admin Updates ────────────────────────────────────────────────

export async function markInquiryRead(id: string) {
  await prisma.contactInquiry.update({
    where: { id },
    data: { status: 'read', readAt: new Date() },
  });
}

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  const data: Prisma.ContactInquiryUpdateInput = { status };
  if (status === 'resolved') data.resolvedAt = new Date();
  if (status === 'closed') data.closedAt = new Date();
  return prisma.contactInquiry.update({ where: { id }, data });
}

export async function assignInquiry(
  id: string,
  data: { departmentId?: string | null; assignedToId?: string | null; priority?: InquiryPriority },
) {
  return prisma.contactInquiry.update({
    where: { id },
    data,
  });
}

// ─── Reply / Forward / Note ───────────────────────────────────────

export async function createReply(data: {
  inquiryId: string;
  mailAccountId?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyHtml: string;
  plainText?: string;
  sentById: string;
}) {
  return prisma.contactReply.create({ data });
}

export async function createForward(data: {
  inquiryId: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyHtml: string;
  note?: string;
  forwardedById: string;
}) {
  return prisma.contactForward.create({ data });
}

export async function createNote(data: { inquiryId: string; note: string; createdById: string }) {
  return prisma.contactInternalNote.create({ data });
}

export async function deleteNote(id: string, userId: string) {
  return prisma.contactInternalNote.deleteMany({ where: { id, createdById: userId } });
}

// ─── Config: Contact Types ────────────────────────────────────────

export const contactTypeRepo = {
  list: () => prisma.contactType.findMany({ orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }] }),
  listActive: () => prisma.contactType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }] }),
  getById: (id: string) => prisma.contactType.findUnique({ where: { id } }),
  create: (data: Prisma.ContactTypeCreateInput) => prisma.contactType.create({ data }),
  update: (id: string, data: Prisma.ContactTypeUpdateInput) => prisma.contactType.update({ where: { id }, data }),
  delete: (id: string) => prisma.contactType.delete({ where: { id } }),
};

// ─── Config: Categories ───────────────────────────────────────────

export const categoryRepo = {
  list: () => prisma.inquiryCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }] }),
  listActive: () => prisma.inquiryCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }] }),
  getById: (id: string) => prisma.inquiryCategory.findUnique({ where: { id } }),
  create: (data: Prisma.InquiryCategoryCreateInput) => prisma.inquiryCategory.create({ data }),
  update: (id: string, data: Prisma.InquiryCategoryUpdateInput) => prisma.inquiryCategory.update({ where: { id }, data }),
  delete: (id: string) => prisma.inquiryCategory.delete({ where: { id } }),
};

// ─── Config: Departments ──────────────────────────────────────────

export const departmentRepo = {
  list: () => prisma.contactDepartment.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
  listActive: () => prisma.contactDepartment.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
  getById: (id: string) => prisma.contactDepartment.findUnique({ where: { id } }),
  create: (data: Prisma.ContactDepartmentCreateInput) => prisma.contactDepartment.create({ data }),
  update: (id: string, data: Prisma.ContactDepartmentUpdateInput) => prisma.contactDepartment.update({ where: { id }, data }),
  delete: (id: string) => prisma.contactDepartment.delete({ where: { id } }),
};

// ─── Config: Priority Rules ───────────────────────────────────────

export const priorityRuleRepo = {
  list: () =>
    prisma.contactPriorityRule.findMany({
      include: { department: { select: { nameEn: true } } },
      orderBy: [{ sortOrder: 'asc' }],
    }),
  getById: (id: string) => prisma.contactPriorityRule.findUnique({ where: { id } }),
  create: (data: Prisma.ContactPriorityRuleCreateInput) => prisma.contactPriorityRule.create({ data }),
  update: (id: string, data: Prisma.ContactPriorityRuleUpdateInput) => prisma.contactPriorityRule.update({ where: { id }, data }),
  delete: (id: string) => prisma.contactPriorityRule.delete({ where: { id } }),
};
