import { prisma } from '../../database/prisma';

export function cleanSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|reply|re\^\[\d+\]):\s*/gi, '')
    .trim();
}

/**
 * Extracts message IDs from References header.
 * Standard format: <id1> <id2> <id3>
 */
export function extractMessageIds(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  const regex = /<[^>]+>/g;
  return headerValue.match(regex) || [];
}

export async function resolveThread(p: {
  subject: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<string> {
  // 1. Check In-Reply-To
  if (p.inReplyTo) {
    const parentMsg = await prisma.mailMessage.findFirst({
      where: { messageId: p.inReplyTo },
      select: { threadId: true },
    });
    if (parentMsg) {
      return parentMsg.threadId;
    }
  }

  // 2. Check References
  if (p.references) {
    const refMessageIds = extractMessageIds(p.references);
    if (refMessageIds.length > 0) {
      const parentMsg = await prisma.mailMessage.findFirst({
        where: { messageId: { in: refMessageIds } },
        select: { threadId: true },
      });
      if (parentMsg) {
        return parentMsg.threadId;
      }
    }
  }

  // 3. Fallback: Search by clean subject to group conversations without correct threading headers
  const subjectClean = cleanSubject(p.subject);
  const existingThread = await prisma.mailThread.findFirst({
    where: {
      subject: { equals: subjectClean, mode: 'insensitive' },
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (existingThread) {
    return existingThread.id;
  }

  // 4. Create new Thread
  const newThread = await prisma.mailThread.create({
    data: {
      subject: subjectClean,
    },
  });
  return newThread.id;
}

export async function getThreadDetails(threadId: string) {
  const messages = await prisma.mailMessage.findMany({
    where: { threadId },
    include: {
      recipients: true,
      attachments: true,
    },
    orderBy: { date: 'asc' },
  });

  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    include: {
      internalNotes: {
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return {
    thread,
    messages,
  };
}

export async function addInternalNote(p: {
  threadId: string;
  messageId?: string | null;
  note: string;
  createdById: string;
}) {
  return prisma.mailInternalNote.create({
    data: {
      threadId: p.threadId,
      messageId: p.messageId || null,
      note: p.note,
      createdById: p.createdById,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function getContactHistory(emailAddress: string) {
  return prisma.mailMessage.findMany({
    where: {
      OR: [
        { fromAddress: { equals: emailAddress, mode: 'insensitive' } },
        {
          recipients: {
            some: {
              emailAddress: { equals: emailAddress, mode: 'insensitive' },
            },
          },
        },
      ],
    },
    include: {
      recipients: true,
      attachments: true,
    },
    orderBy: { date: 'desc' },
  });
}
