import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { publicFormLimiter } from '../../middlewares/rateLimiter';
import {
  submitInquirySchema,
  inquiryListQuerySchema,
  updateInquiryStatusSchema,
  assignInquirySchema,
  replyInquirySchema,
  forwardInquirySchema,
  sendSmsInquirySchema,
  addNoteSchema,
  upsertContactTypeSchema,
  upsertCategorySchema,
  upsertDepartmentSchema,
  upsertPriorityRuleSchema,
} from './contact-inquiry.types';
import {
  handlePublicSubmit,
  handleGetPublicConfig,
  handleListInquiries,
  handleGetInquiry,
  handleUpdateStatus,
  handleAssign,
  handleReply,
  handleForward,
  handleSendSms,
  handleAddNote,
  handleDeleteNote,
  handleListContactTypes,
  handleGetContactType,
  handleCreateContactType,
  handleUpdateContactType,
  handleDeleteContactType,
  handleListCategories,
  handleGetCategory,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleListDepartments,
  handleGetDepartment,
  handleCreateDepartment,
  handleUpdateDepartment,
  handleDeleteDepartment,
  handleListPriorityRules,
  handleGetPriorityRule,
  handleCreatePriorityRule,
  handleUpdatePriorityRule,
  handleDeletePriorityRule,
} from './contact-inquiry.controller';

// ─── Public router (mounted at /api/v1/public/contact-inquiries) ──

export const contactInquiryPublicRouter = Router();
contactInquiryPublicRouter.post('/', publicFormLimiter, validate(submitInquirySchema), handlePublicSubmit);
contactInquiryPublicRouter.get('/config', handleGetPublicConfig);

// ─── Admin router (mounted at /api/v1/admin/contact-inquiries) ────

const router = Router();
router.use(authenticate);

// Inbox
router.get('/', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.READ), validate(inquiryListQuerySchema, 'query'), handleListInquiries);
router.get('/:id', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.READ), handleGetInquiry);
router.patch('/:id/status', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), validate(updateInquiryStatusSchema), handleUpdateStatus);
router.patch('/:id/assign', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.ASSIGN), validate(assignInquirySchema), handleAssign);
router.post('/:id/reply', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), validate(replyInquirySchema), handleReply);
router.post('/:id/forward', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), validate(forwardInquirySchema), handleForward);
router.post('/:id/sms', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), validate(sendSmsInquirySchema), handleSendSms);

// Internal notes
router.post('/:id/notes', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), validate(addNoteSchema), handleAddNote);
router.delete('/:id/notes/:noteId', authorize(RESOURCES.CONTACT_INQUIRIES, ACTIONS.UPDATE), handleDeleteNote);

// ─── Config: Contact Types ────────────────────────────────────────

router.get('/config/types', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleListContactTypes);
router.post('/config/types', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.CREATE), validate(upsertContactTypeSchema), handleCreateContactType);
router.get('/config/types/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleGetContactType);
router.patch('/config/types/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.UPDATE), validate(upsertContactTypeSchema.partial()), handleUpdateContactType);
router.delete('/config/types/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.DELETE), handleDeleteContactType);

// ─── Config: Categories ───────────────────────────────────────────

router.get('/config/categories', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleListCategories);
router.post('/config/categories', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.CREATE), validate(upsertCategorySchema), handleCreateCategory);
router.get('/config/categories/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleGetCategory);
router.patch('/config/categories/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.UPDATE), validate(upsertCategorySchema.partial()), handleUpdateCategory);
router.delete('/config/categories/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.DELETE), handleDeleteCategory);

// ─── Config: Departments ──────────────────────────────────────────

router.get('/config/departments', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleListDepartments);
router.post('/config/departments', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.CREATE), validate(upsertDepartmentSchema), handleCreateDepartment);
router.get('/config/departments/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleGetDepartment);
router.patch('/config/departments/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.UPDATE), validate(upsertDepartmentSchema.partial()), handleUpdateDepartment);
router.delete('/config/departments/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.DELETE), handleDeleteDepartment);

// ─── Config: Priority Rules ───────────────────────────────────────

router.get('/config/priority-rules', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleListPriorityRules);
router.post('/config/priority-rules', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.CREATE), validate(upsertPriorityRuleSchema), handleCreatePriorityRule);
router.get('/config/priority-rules/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.READ), handleGetPriorityRule);
router.patch('/config/priority-rules/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.UPDATE), validate(upsertPriorityRuleSchema.partial()), handleUpdatePriorityRule);
router.delete('/config/priority-rules/:id', authorize(RESOURCES.CONTACT_INQUIRY_CONFIG, ACTIONS.DELETE), handleDeletePriorityRule);

export const contactInquiryAdminRouter = router;
