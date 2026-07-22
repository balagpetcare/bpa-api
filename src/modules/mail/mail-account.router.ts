import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { 
  createMailAccountSchema, 
  updateMailAccountSchema, 
  sendMailSchema, 
  replyMailSchema, 
  forwardMailSchema 
} from './mail.types';
import {
  createMailAccountHandler,
  listMailAccountsHandler,
  getMailAccountHandler,
  updateMailAccountHandler,
  deleteMailAccountHandler,
  testSmtpHandler,
  testImapHandler,
  getInboxHandler,
  getMessageDetailsHandler,
  sendMailHandler,
  replyMailHandler,
  forwardMailHandler,
  syncMailboxHandler,
  getThreadDetailsHandler,
  getContactHistoryHandler,
  createInternalNoteHandler
} from './mail-account.controller';

const router = Router();

// Ensure all mail system endpoints require auth
router.use(authenticate);

// ─── MAIL ACCOUNTS CRUD ──────────────────────────────────────────
router.get('/accounts', authorize('mail', 'manage_accounts'), listMailAccountsHandler);
router.post('/accounts', authorize('mail', 'manage_accounts'), validate(createMailAccountSchema), createMailAccountHandler);
router.get('/accounts/:id', authorize('mail', 'manage_accounts'), getMailAccountHandler);
router.patch('/accounts/:id', authorize('mail', 'manage_accounts'), validate(updateMailAccountSchema), updateMailAccountHandler);
router.delete('/accounts/:id', authorize('mail', 'manage_accounts'), deleteMailAccountHandler);

// Connection test utilities
router.post('/accounts/:id/test-smtp', authorize('mail', 'manage_accounts'), testSmtpHandler);
router.post('/accounts/:id/test-imap', authorize('mail', 'manage_accounts'), testImapHandler);

// ─── INBOX & SYNC & MESSAGES ────────────────────────────────────
router.get('/inbox', authorize('mail', 'read'), getInboxHandler);
router.get('/messages/:id', authorize('mail', 'read'), getMessageDetailsHandler);
router.get('/threads/:id', authorize('mail', 'read'), getThreadDetailsHandler);
router.get('/history', authorize('mail', 'read'), getContactHistoryHandler);
router.post('/sync', authorize('mail', 'sync'), syncMailboxHandler);

// ─── MAILING FLOWS ──────────────────────────────────────────────
router.post('/send', authorize('mail', 'send'), validate(sendMailSchema), sendMailHandler);
router.post('/reply', authorize('mail', 'send'), validate(replyMailSchema), replyMailHandler);
router.post('/forward', authorize('mail', 'send'), validate(forwardMailSchema), forwardMailHandler);
router.post('/threads/:id/internal-notes', authorize('mail', 'send'), createInternalNoteHandler);

export default router;
