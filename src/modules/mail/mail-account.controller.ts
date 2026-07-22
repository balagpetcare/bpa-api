import { Request, Response, NextFunction } from 'express';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../../database/prisma';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as accountSvc from './mail-account.service';
import * as sendSvc from './mail-send.service';
import * as syncSvc from './mailbox-sync.service';
import * as threadSvc from './mail-thread.service';

// Standard sanitize-html options for safe rendering of rich-text emails
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'style', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'colgroup', 'col', 'span', 'div', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    'img': ['src', 'alt', 'width', 'height', 'style', 'cid'],
    '*': ['style', 'class', 'align', 'valign', 'bgcolor', 'cellpadding', 'cellspacing', 'border', 'width', 'height', 'color']
  },
  allowedSchemes: ['http', 'https', 'data', 'cid', 'mailto'],
  allowProtocolRelative: false,
};

// ─── MAIL ACCOUNTS CRUD ──────────────────────────────────────────

export async function createMailAccountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountSvc.createMailAccount(req.body);
    sendCreated(res, account);
  } catch (err) {
    next(err);
  }
}

export async function listMailAccountsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await accountSvc.listMailAccounts();
    sendSuccess(res, list);
  } catch (err) {
    next(err);
  }
}

export async function getMailAccountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountSvc.getMailAccount(req.params.id);
    sendSuccess(res, account);
  } catch (err) {
    next(err);
  }
}

export async function updateMailAccountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await accountSvc.updateMailAccount(req.params.id, req.body);
    sendSuccess(res, account);
  } catch (err) {
    next(err);
  }
}

export async function deleteMailAccountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await accountSvc.deleteMailAccount(req.params.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

export async function testSmtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await accountSvc.testSmtpConnection(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function testImapHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await accountSvc.testImapConnection(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── INBOX & MESSAGES ────────────────────────────────────────────

export async function getInboxHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query;
    const mailboxId = q.mailboxId as string;
    const status = q.status as string;
    const isReadStr = q.isRead as string;
    const search = q.search as string;
    const startDateStr = q.startDate as string;
    const endDateStr = q.endDate as string;

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (mailboxId) {
      where.mailboxId = mailboxId;
    }
    if (status) {
      where.status = status;
    }
    if (isReadStr !== undefined) {
      where.isRead = isReadStr === 'true';
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { fromAddress: { contains: search, mode: 'insensitive' } },
        { fromName: { contains: search, mode: 'insensitive' } },
        { bodyHtml: { contains: search, mode: 'insensitive' } },
        { bodyText: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDateStr || endDateStr) {
      where.date = {};
      if (startDateStr) {
        where.date.gte = new Date(startDateStr);
      }
      if (endDateStr) {
        where.date.lte = new Date(endDateStr);
      }
    }

    const [items, total] = await Promise.all([
      prisma.mailMessage.findMany({
        where,
        include: {
          recipients: true,
          attachments: {
            select: {
              id: true,
              filename: true,
              contentType: true,
              size: true,
              url: true,
            },
          },
          mailbox: {
            select: {
              displayName: true,
              emailAddress: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mailMessage.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(res, items, 200, {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMessageDetailsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const message = await prisma.mailMessage.findUnique({
      where: { id },
      include: {
        recipients: true,
        attachments: true,
        mailbox: {
          select: {
            displayName: true,
            emailAddress: true,
          },
        },
      },
    });

    if (!message) {
      throw AppError.notFound('Email message');
    }

    // Mark as read when details are accessed
    if (!message.isRead) {
      await prisma.mailMessage.update({
        where: { id },
        data: { isRead: true },
      });
      message.isRead = true;
    }

    // Sanitize HTML body for security (guard against null bodyHtml)
    const sanitizedHtml = sanitizeHtml(message.bodyHtml || '', SANITIZE_OPTIONS);

    sendSuccess(res, {
      ...message,
      bodyHtml: sanitizedHtml,
    });
  } catch (err) {
    next(err);
  }
}

// ─── COMPOSE, REPLY, FORWARD ──────────────────────────────────────

export async function sendMailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const message = await sendSvc.sendMail(req.body);
    sendSuccess(res, message);
  } catch (err) {
    next(err);
  }
}

export async function replyMailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Reply logic is handled by standard sendMail by passing threadId, inReplyTo, references
    const message = await sendSvc.sendMail(req.body);
    sendSuccess(res, message);
  } catch (err) {
    next(err);
  }
}

export async function forwardMailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Forward logic is handled by sendMail passing attachments & subject cleanups
    const message = await sendSvc.sendMail(req.body);
    sendSuccess(res, message);
  } catch (err) {
    next(err);
  }
}

// ─── SYNC TRIGGER & THREADS ──────────────────────────────────────

export async function syncMailboxHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { mailboxId } = req.body;

    if (mailboxId) {
      const result = await syncSvc.syncMailbox(mailboxId, 50);
      sendSuccess(res, result);
    } else {
      await syncSvc.syncAllActiveMailboxes();
      sendSuccess(res, { message: 'Sync triggered successfully for all active mailboxes.' });
    }
  } catch (err) {
    next(err);
  }
}

export async function getThreadDetailsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await threadSvc.getThreadDetails(req.params.id);
    
    // Sanitize html for all thread messages (guard against null bodyHtml)
    const sanitizedMessages = result.messages.map(msg => ({
      ...msg,
      bodyHtml: sanitizeHtml(msg.bodyHtml || '', SANITIZE_OPTIONS),
    }));

    sendSuccess(res, {
      thread: result.thread,
      messages: sanitizedMessages,
    });
  } catch (err) {
    next(err);
  }
}

export async function getContactHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      throw AppError.badRequest('Query parameter "email" is required.');
    }
    const history = await threadSvc.getContactHistory(email);
    sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
}

export async function createInternalNoteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: threadId } = req.params;
    const { note, messageId } = req.body;
    const createdById = req.user?.sub;

    if (!createdById) {
      throw AppError.unauthorized('User not authenticated');
    }
    if (!note || typeof note !== 'string') {
      throw AppError.badRequest('Note content is required.');
    }

    const newNote = await threadSvc.addInternalNote({
      threadId,
      messageId,
      note: sanitizeHtml(note),
      createdById,
    });

    sendCreated(res, newNote);
  } catch (err) {
    next(err);
  }
}
