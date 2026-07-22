import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns middleware that validates one or more route params are valid UUIDs.
 * Responds with 400 before reaching the repository — prevents Prisma receiving "undefined".
 *
 * Usage: router.get('/:id', validateUuid('id'), handler)
 */
export function validateUuid(...paramNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (!value || !UUID_RE.test(value)) {
        return next(AppError.badRequest(`Invalid ${name}: must be a valid UUID`));
      }
    }
    next();
  };
}

export function validateUuidWithCode(paramName: string, code: string, message?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (!value || !UUID_RE.test(value)) {
      return next(AppError.badRequest(message ?? `Invalid ${paramName}`, code));
    }
    next();
  };
}
