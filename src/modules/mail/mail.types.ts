import { z } from 'zod';

export const createMailAccountSchema = z.object({
  displayName: z.string().min(1, 'Display Name is required').max(255),
  emailAddress: z.string().email('Invalid email address').max(255),
  smtpHost: z.string().max(255).nullable().optional(),
  smtpPort: z.number().int().positive().nullable().optional(),
  smtpSecure: z.boolean().nullable().optional(),
  imapHost: z.string().max(255).nullable().optional(),
  imapPort: z.number().int().positive().nullable().optional(),
  imapSecure: z.boolean().nullable().optional(),
  username: z.string().min(1, 'Username is required').max(255),
  password: z.string().min(1, 'Password is required').nullable().optional(),
  fromName: z.string().min(1, 'From Name is required').max(255),
  status: z.enum(['active', 'inactive']).default('inactive'),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const updateMailAccountSchema = createMailAccountSchema.partial();

const normalizeEmailList = (val: any) => {
  if (typeof val === 'string') {
    return val.split(',').map((s: any) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(val)) {
    return val.map((s: any) => typeof s === 'string' ? s.trim() : s).filter(Boolean);
  }
  return val;
};

const preprocessMailPayload = (val: any) => {
  if (val && typeof val === 'object') {
    const bodyHtml = val.bodyHtml || val.html || val.body || val.content || '';
    const to = normalizeEmailList(val.to);
    const cc = val.cc !== undefined ? normalizeEmailList(val.cc) : undefined;
    const bcc = val.bcc !== undefined ? normalizeEmailList(val.bcc) : undefined;
    
    // Clean empty arrays to undefined for optional fields
    const ccVal = cc && cc.length > 0 ? cc : undefined;
    const bccVal = bcc && bcc.length > 0 ? bcc : undefined;

    let attachmentIds = val.attachmentIds;
    if (Array.isArray(attachmentIds)) {
      attachmentIds = attachmentIds.filter((id: any) => typeof id === 'string' && id.trim() !== '');
    }
    const attachmentIdsVal = attachmentIds && attachmentIds.length > 0 ? attachmentIds : undefined;

    return {
      ...val,
      bodyHtml,
      to,
      cc: ccVal,
      bcc: bccVal,
      attachmentIds: attachmentIdsVal,
    };
  }
  return val;
};

export const baseSendMailSchema = z.object({
  fromAccountId: z.string().uuid(),
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, 'Subject is required'),
  bodyHtml: z.string().min(1, 'Body is required'),
  plainText: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number(),
    storagePath: z.string(),
    url: z.string(),
    cid: z.string().optional(),
  })).optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
  useTemplate: z.boolean().optional().default(false),
  layoutKey: z.string().optional(), // Centralized EmailLayoutSetting
});

export const sendMailSchema = z.preprocess(preprocessMailPayload, baseSendMailSchema);

export const replyMailSchema = z.preprocess(
  preprocessMailPayload,
  baseSendMailSchema.extend({
    inReplyTo: z.string(), // original messageId
    references: z.string().optional(), // references chain
    threadId: z.string().uuid(),
  })
);

export const forwardMailSchema = z.preprocess(
  preprocessMailPayload,
  baseSendMailSchema.extend({
    originalMessageId: z.string().optional(),
    threadId: z.string().uuid().optional(),
  })
);

export const queryInboxSchema = z.object({
  mailboxId: z.string().uuid().optional(),
  status: z.enum(['received', 'sent_success', 'sent_failed', 'draft']).optional(),
  isRead: z.string().optional(), // 'true' / 'false'
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});
