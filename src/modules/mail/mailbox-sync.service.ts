import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../../database/prisma';
import { decryptPassword, resolveMailServerConfig } from './mail-account.service';
import { resolveThread } from './mail-thread.service';
import { uploadAttachment } from './mail-attachment.service';

/**
 * Syncs messages from a cPanel IMAP server.
 * Phase 1: Syncs latest 50 emails.
 * Phase 2: Skips existing messageIds to prevent duplicates.
 */
export async function syncMailbox(mailboxId: string, limit = 50): Promise<{ emailsSynced: number; status: string; errorMessage: string | null }> {
  // 1. Fetch MailAccount
  const account = await prisma.mailAccount.findUnique({ where: { id: mailboxId } });
  if (!account || account.status !== 'active') {
    return { emailsSynced: 0, status: 'failed', errorMessage: 'Mailbox account is missing or inactive' };
  }

  if (!account.encryptedPassword) {
    return { emailsSynced: 0, status: 'failed', errorMessage: 'Mailbox account has no password set' };
  }
  const decryptedPassword = decryptPassword(account.encryptedPassword);

  const resolved = resolveMailServerConfig(account);
  const client = new ImapFlow({
    host: resolved.imapHost,
    port: resolved.imapPort,
    secure: resolved.imapSecure,
    auth: {
      user: account.username,
      pass: decryptedPassword,
    },
    logger: false,
    connectionTimeout: 15000,
  });

  let emailsSynced = 0;
  let status = 'success';
  let errorMessage: string | null = null;

  try {
    await client.connect();

    // Lock and open INBOX mailbox folder
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailboxInfo = await client.mailboxOpen('INBOX');
      const totalMessages = mailboxInfo.exists;

      if (totalMessages > 0) {
        // Fetch up to the latest 'limit' messages
        const startSeq = Math.max(1, totalMessages - limit + 1);
        const endSeq = totalMessages;

        // Fetch envelopes/sources backward from latest to oldest
        for (let seq = endSeq; seq >= startSeq; seq--) {
          try {
            const fetchGenerator = client.fetch(seq.toString(), { uid: true, source: true });
            
            for await (const message of fetchGenerator) {
              const parsed = await simpleParser(message.source);
              const messageId = parsed.messageId || `<IMAP-IMPORT-${Date.now()}-${message.uid}@bpa.org>`;

              // Prevent duplicates: check if this messageId already exists for this mailbox
              const existing = await prisma.mailMessage.findUnique({
                where: {
                  mailboxId_messageId: {
                    mailboxId: account.id,
                    messageId: messageId,
                  },
                },
              });

              if (existing) {
                continue; // Skip already synced emails
              }

              // Extract parsed headers and envelope details
              const subject = parsed.subject || '(No Subject)';
              const bodyHtml = parsed.html || parsed.textAsHtml || parsed.text || '';
              const bodyText = parsed.text || '';
              const fromAddress = parsed.from?.value[0]?.address || 'unknown@bangladeshpetassociation.com';
              const fromName = parsed.from?.value[0]?.name || null;
              const date = parsed.date || new Date();
              const inReplyTo = parsed.inReplyTo || null;
              
              let references: string | null = null;
              if (parsed.references) {
                references = Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references;
              }

              // Resolve Thread mapping
              const threadId = await resolveThread({
                subject,
                messageId,
                inReplyTo,
                references,
              });

              // Process raw email attachments and upload to storage
              const processedAttachments: any[] = [];
              for (const att of parsed.attachments || []) {
                try {
                  const uploaded = await uploadAttachment(
                    att.filename || 'attachment',
                    att.contentType,
                    att.content,
                    att.cid || null
                  );
                  processedAttachments.push(uploaded);
                } catch (attErr: any) {
                  console.error(`[MailboxSync] Attachment sync failed for ${att.filename}:`, attErr.message);
                }
              }

              // Save within transaction
              await prisma.$transaction(async (tx) => {
                const msg = await tx.mailMessage.create({
                  data: {
                    mailboxId: account.id,
                    threadId,
                    messageId,
                    uid: message.uid,
                    inReplyTo,
                    references,
                    subject,
                    bodyHtml,
                    bodyText,
                    fromAddress,
                    fromName,
                    date,
                    isRead: false,
                    isSent: false,
                    status: 'received',
                  },
                });

                // Extract recipient items (TO / CC)
                const recs: Array<{ messageId: string; emailAddress: string; name: string | null; type: 'to' | 'cc' | 'bcc' }> = [];
                
                const processRecipientList = (list: any, type: 'to' | 'cc' | 'bcc') => {
                  if (!list) return;
                  const normalized = Array.isArray(list) ? list : [list];
                  normalized.forEach((item: any) => {
                    if (item.value) {
                      item.value.forEach((v: any) => {
                        if (v.address) {
                          recs.push({
                            messageId: msg.id,
                            emailAddress: v.address,
                            name: v.name || null,
                            type,
                          });
                        }
                      });
                    }
                  });
                };

                processRecipientList(parsed.to, 'to');
                processRecipientList(parsed.cc, 'cc');

                if (recs.length > 0) {
                  await tx.mailRecipient.createMany({ data: recs });
                }

                // Map attachments to DB
                if (processedAttachments.length > 0) {
                  await tx.mailAttachment.createMany({
                    data: processedAttachments.map(att => ({
                      messageId: msg.id,
                      filename: att.filename,
                      contentType: att.contentType,
                      size: att.size,
                      storagePath: att.storagePath,
                      url: att.url,
                      cid: att.cid,
                    })),
                  });
                }
              });

              emailsSynced++;
            }
          } catch (msgErr: any) {
            console.error(`[MailboxSync] Failed to process message in sequence ${seq}:`, msgErr.message);
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error(`[MailboxSync] IMAP error on mailbox ${account.emailAddress}:`, err.message);
    status = 'failed';
    errorMessage = err.message;
  } finally {
    await client.logout().catch(() => {});
  }

  // Create sync log row
  await prisma.mailSyncLog.create({
    data: {
      mailboxId: account.id,
      status,
      errorMessage,
      emailsSynced,
    },
  });

  return { emailsSynced, status, errorMessage };
}

/**
 * Incremental sync for all active mailboxes.
 */
export async function syncAllActiveMailboxes() {
  const activeMailboxes = await prisma.mailAccount.findMany({
    where: { status: 'active' },
    select: { id: true, emailAddress: true },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MailboxSync] Syncing ${activeMailboxes.length} active mailboxes...`);
  }
  
  for (const mb of activeMailboxes) {
    try {
      const res = await syncMailbox(mb.id, 50);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MailboxSync] Synced ${mb.emailAddress}: ${res.emailsSynced} new messages.`);
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[MailboxSync] Failed to sync ${mb.emailAddress}:`, err.message);
      }
    }
  }
}
