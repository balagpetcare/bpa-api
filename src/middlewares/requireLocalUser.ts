import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireLocalUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.sub) {
      return next();
    }

    // Fast path: only skip the lookup if sub is an actual well-formed UUID
    // (it means it's probably already mapped, or they used local auth instead
    // of central auth). A length/hyphen heuristic is not sufficient here:
    // Central Auth subs (e.g. cuid-style ids) can coincidentally be 36
    // characters and contain a hyphen without being valid UUIDs, which would
    // then get passed straight into a `@db.Uuid` Prisma filter and blow up
    // with "Inconsistent column data: Error creating UUID".
    if (UUID_RE.test(req.user.sub)) {
      return next();
    }

    const user = await prisma.user.findFirst({
      where: { centralAuthUserId: req.user.sub, deletedAt: null },
    });

    if (user) {
      req.user.sub = user.id;
      return next();
    }

    if (req.method === 'GET') {
      // For read-only operations, if the user doesn't exist locally,
      // they simply have no data. We pass a dummy UUID that will yield no results.
      req.user.sub = '00000000-0000-0000-0000-000000000000';
      return next();
    }

    // For write operations, automatically provision the local user row
    // to mirror the authenticated Central Auth identity.
    const newUser = await prisma.user.create({
      data: {
        name: req.user.email?.split('@')[0] || 'BPA App User',
        email: req.user.email || undefined,
        centralAuthUserId: req.user.sub,
        role: 'USER',
      },
    });

    req.user.sub = newUser.id;
    next();
  } catch (err) {
    next(err);
  }
}
