import nodemailer from 'nodemailer';
import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { decryptPassword, resolveMailServerConfig } from './mail-account.service';
import { resolveThread } from './mail-thread.service';
import { downloadFromStorage } from '../../storage/storage.service';
import { renderEmailLayout } from '../emails/layouts/render-email-layout';

export interface SendMailParams {
  fromAccountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  plainText?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    storagePath: string;
    url: string;
    cid?: string | null;
  }>;
  attachmentIds?: string[];
  useTemplate?: boolean;
  layoutKey?: string;
  locale?: 'en' | 'bn';
  // Reply mapping
  inReplyTo?: string | null;
  references?: string | null;
  threadId?: string | null;
}

export async function sendMail(params: SendMailParams) {
  const {
    fromAccountId,
    to,
    cc = [],
    bcc = [],
    subject,
    bodyHtml,
    plainText = '',
    attachments = [],
    useTemplate = false,
    layoutKey,
    locale = 'en',
    inReplyTo,
    references,
    threadId,
  } = params;

  // 1. Fetch mail account and decrypt password
  const account = await prisma.mailAccount.findUnique({ where: { id: fromAccountId } });
  if (!account || account.status !== 'active') {
    throw AppError.badRequest('Sender mail account is missing or inactive.');
  }

  if (!account.encryptedPassword) {
    throw AppError.badRequest('Sender mail account has no password configured.');
  }
  const decryptedPassword = decryptPassword(account.encryptedPassword);

  // Fetch attachments if attachmentIds are provided
  const combinedAttachments = [...attachments];
  if (params.attachmentIds && params.attachmentIds.length > 0) {
    const mediaFiles = await prisma.mediaFile.findMany({
      where: { id: { in: params.attachmentIds } },
    });
    for (const file of mediaFiles) {
      combinedAttachments.push({
        filename: file.originalName,
        contentType: file.mimeType,
        size: Number(file.sizeBytes),
        storagePath: file.filename,
        url: file.url,
        cid: null,
      });
    }
  }

  // 2. Wrap body in Central layout if requested
  let finalHtml = bodyHtml;
  if (useTemplate) {
    finalHtml = await renderEmailLayout({
      locale,
      subject,
      bodyHtml,
      layoutKey,
    });
  }

  // 3. Download attachments from storage
  const mailAttachments = [];
  for (const att of combinedAttachments) {
    try {
      const buffer = await downloadFromStorage(att.storagePath);
      mailAttachments.push({
        filename: att.filename,
        content: buffer,
        contentType: att.contentType,
        cid: att.cid || undefined,
      });
    } catch (err: any) {
      console.error(`[MailSend] Failed to read attachment ${att.filename} from storage:`, err);
      throw AppError.internal(`Failed to attach file "${att.filename}": ${err.message}`);
    }
  }

  // 4. Setup nodemailer transporter
  const resolved = resolveMailServerConfig(account);
  const transporter = nodemailer.createTransport({
    host: resolved.smtpHost,
    port: resolved.smtpPort,
    secure: resolved.smtpSecure,
    auth: {
      user: account.username,
      pass: decryptedPassword,
    },
  } as any);

  // 5. Build headers for reply threads
  const headers: Record<string, string> = {};
  if (inReplyTo) {
    headers['In-Reply-To'] = inReplyTo;
  }
  if (references) {
    headers['References'] = references;
  }

  // 6. Send the email via SMTP
  let messageId = '';
  let status = 'sent_success';
  let errorMessage: string | null = null;

  try {
    const info = await transporter.sendMail({
      from: `"${account.fromName}" <${account.emailAddress}>`,
      to: to.join(', '),
      cc: cc.length > 0 ? cc.join(', ') : undefined,
      bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
      subject,
      html: finalHtml,
      text: plainText,
      attachments: mailAttachments,
      headers,
    });

    messageId = info.messageId;
    console.log(`[MailSend] Email sent successfully. MessageId: ${messageId}`);
  } catch (err: any) {
    console.error('[MailSend] SMTP send error:', err);
    status = 'sent_failed';
    errorMessage = err.message;
    messageId = `FAILED-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  // 7. Thread resolution (if not replied to an existing thread, resolve new or topic matching thread)
  const resolvedThreadId = threadId || await resolveThread({
    subject,
    messageId,
    inReplyTo,
    references,
  });

  // 8. Log message and recipients in DB
  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.mailMessage.create({
      data: {
        mailboxId: account.id,
        threadId: resolvedThreadId,
        messageId,
        inReplyTo,
        references,
        subject,
        bodyHtml: finalHtml,
        bodyText: plainText,
        fromAddress: account.emailAddress,
        fromName: account.fromName,
        date: new Date(),
        isRead: true, // Sent items are naturally read
        isSent: true,
        status,
        errorMessage,
      },
    });

    // Add recipients
    const recipientRecords = [
      ...to.map(email => ({ messageId: msg.id, emailAddress: email, type: 'to' })),
      ...cc.map(email => ({ messageId: msg.id, emailAddress: email, type: 'cc' })),
      ...bcc.map(email => ({ messageId: msg.id, emailAddress: email, type: 'bcc' })),
    ];

    if (recipientRecords.length > 0) {
      await tx.mailRecipient.createMany({
        data: recipientRecords,
      });
    }

    // Add attachments association
    if (combinedAttachments.length > 0) {
      await tx.mailAttachment.createMany({
        data: combinedAttachments.map(att => ({
          messageId: msg.id,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          storagePath: att.storagePath,
          url: att.url,
          cid: att.cid || null,
        })),
      });
    }

    return msg;
  });

  if (status === 'sent_failed') {
    throw new Error(`SMTP sending failed: ${errorMessage}`);
  }

  return message;
}
