import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ROLES } from '../config/constants';
import { prisma } from '../database/prisma';

/**
 * Same DB lookup authorize() does internally, exposed for handlers that need
 * to branch on a permission conditionally (e.g. "emergency category skips
 * the approval requirement, but only for callers with notification:emergency")
 * rather than gating the whole route on one fixed resource:action.
 */
export async function getUserPermissions(userId: string, roles: string[]): Promise<string[]> {
  if (roles.includes(ROLES.SUPER_ADMIN) || roles.includes('SUPER_ADMIN') || roles.includes('GLOBAL_SUPER_ADMIN')) {
    return ['*:*'];
  }
  const userRow = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    select: {
      userRoles: {
        select: { role: { select: { rolePermissions: { select: { permission: { select: { resource: true, action: true } } } } } } },
      },
    },
  });
  if (!userRow) return [];
  return [
    ...new Set(
      userRow.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`)),
    ),
  ];
}

export function hasPermission(permissions: string[], resource: string, action: string): boolean {
  return permissions.includes('*:*') || permissions.includes(`${resource}:${action}`) || permissions.includes(`${resource}:manage`);
}

export function authorize(resource: string, action: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roles } = req.user;

      // super_admin bypasses all permission checks — no DB query needed.
      // Central Auth-issued Global Super Admin tokens carry the role names
      // "SUPER_ADMIN"/"GLOBAL_SUPER_ADMIN" (uppercase, Central Auth's own
      // convention) rather than bpa_api's local "super_admin" — and these
      // principals have no row in bpa_api's own `user` table at all (they
      // only exist in Central Auth's database), so the DB lookup below
      // would always report "User not found" for them. Recognize both
      // conventions here rather than falling through to that lookup.
      if (
        roles.includes(ROLES.SUPER_ADMIN) ||
        roles.includes('SUPER_ADMIN') ||
        roles.includes('GLOBAL_SUPER_ADMIN')
      ) {
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
