import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ROLES } from '../config/constants';
import { prisma } from '../database/prisma';

export function authorize(resource: string, action: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roles } = req.user;

      // super_admin bypasses all permission checks — no DB query needed.
      if (roles.includes(ROLES.SUPER_ADMIN)) {
        return next();
      }

      // Permissions are no longer stored in the JWT (removed to keep the token under
      // Nginx's upstream header limit — a full permissions array bloats the JWT to ~32 KB).
      // For non-super-admin users we do a single targeted DB read per protected request.
      const userRow = await prisma.user.findFirst({
        where: { id: req.user.sub, deletedAt: null, isActive: true },
        select: {
          userRoles: {
            select: {
              role: {
                select: {
                  rolePermissions: {
                    select: {
                      permission: { select: { resource: true, action: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!userRow) {
        return next(AppError.unauthorized('User not found or deactivated'));
      }

      const permissions = [
        ...new Set(
          userRow.userRoles.flatMap((ur) =>
            ur.role.rolePermissions.map(
              (rp) => `${rp.permission.resource}:${rp.permission.action}`,
            ),
          ),
        ),
      ];

      const required = `${resource}:${action}`;
      if (!permissions.includes(required) && !permissions.includes(`${resource}:manage`)) {
        return next(
          AppError.forbidden(`You do not have permission to ${action} ${resource}`),
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { roles } = req.user;

    if (roles.includes(ROLES.SUPER_ADMIN)) {
      return next();
    }

    const hasRole = allowedRoles.some((r) => roles.includes(r));
    if (!hasRole) {
      return next(AppError.forbidden('Insufficient role'));
    }

    next();
  };
}
