import { Request, Response, NextFunction } from 'express';
import { buildPaginationMeta, parsePaginationQuery, sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import {
  submitInquiry,
  getInquiriesList,
  getInquiryDetail,
  changeInquiryStatus,
  assignInquiryToTeam,
  replyToInquiry,
  forwardInquiry,
  sendSmsToInquirer,
  addInternalNote,
  removeInternalNote,
  contactTypeService,
  categoryService,
  departmentService,
  priorityRuleService,
} from './contact-inquiry.service';

// ─── Public ───────────────────────────────────────────────────────

export async function handlePublicSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await submitInquiry(req.body, req);
    sendCreated(res, { ...result, message: 'Your inquiry has been submitted. We will get back to you shortly.' });
  } catch (err) {
    next(err);
  }
}

export async function handleGetPublicConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [types, categories] = await Promise.all([contactTypeService.listActive(), categoryService.listActive()]);
    sendSuccess(res, { types, categories });
  } catch (err) {
    next(err);
  }
}

// ─── Admin Inbox ──────────────────────────────────────────────────

export async function handleListInquiries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query;
    const { total, items } = await getInquiriesList(q as any);
    const { page, limit } = parsePaginationQuery(q.page, q.limit);
    sendSuccess(res, items, 200, buildPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function handleGetInquiry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inquiry = await getInquiryDetail(req.params.id, req.user!.sub);
    sendSuccess(res, inquiry);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await changeInquiryStatus(req.params.id, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleAssign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await assignInquiryToTeam(req.params.id, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleReply(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await replyToInquiry(req.params.id, req.body, req.user!.sub);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleForward(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await forwardInquiry(req.params.id, req.body, req.user!.sub);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleSendSms(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await sendSmsToInquirer(req.params.id, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleAddNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await addInternalNote(req.params.id, req.body, req.user!.sub);
    sendCreated(res, result);
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.roles.includes('super_admin');
    const result = await removeInternalNote(req.params.id, req.params.noteId, req.user!.sub, isAdmin);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Contact Types CRUD ───────────────────────────────────────────

export async function handleListContactTypes(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await contactTypeService.list());
  } catch (err) {
    next(err);
  }
}

export async function handleGetContactType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await contactTypeService.getById(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function handleCreateContactType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(res, await contactTypeService.create(req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateContactType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await contactTypeService.update(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteContactType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await contactTypeService.delete(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

// ─── Categories CRUD ──────────────────────────────────────────────

export async function handleListCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await categoryService.list());
  } catch (err) {
    next(err);
  }
}

export async function handleGetCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await categoryService.getById(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function handleCreateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(res, await categoryService.create(req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await categoryService.update(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await categoryService.delete(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

// ─── Departments CRUD ─────────────────────────────────────────────

export async function handleListDepartments(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await departmentService.list());
  } catch (err) {
    next(err);
  }
}

export async function handleGetDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await departmentService.getById(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function handleCreateDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(res, await departmentService.create(req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await departmentService.update(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await departmentService.delete(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

// ─── Priority Rules CRUD ──────────────────────────────────────────

export async function handleListPriorityRules(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await priorityRuleService.list());
  } catch (err) {
    next(err);
  }
}

export async function handleGetPriorityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await priorityRuleService.getById(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function handleCreatePriorityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendCreated(res, await priorityRuleService.create(req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleUpdatePriorityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await priorityRuleService.update(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function handleDeletePriorityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await priorityRuleService.delete(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
