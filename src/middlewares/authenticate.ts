import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { ERROR_CODES } from '../config/constants';
import { config } from '../config';

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies?.[config.AUTH_COOKIE_NAME]) {
      // Cookie-based auth for web frontend (httpOnly cookie set on login)
      token = req.cookies[config.AUTH_COOKIE_NAME] as string;
    }

    if (!token) {
      throw AppError.unauthorized('No token provided', ERROR_CODES.UNAUTHORIZED);
    }
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);

    const message =
      (err as Error).name === 'TokenExpiredError'
        ? 'Access token expired'
        : 'Invalid access token';

    const code =
      (err as Error).name === 'TokenExpiredError'
        ? ERROR_CODES.TOKEN_EXPIRED
        : ERROR_CODES.TOKEN_INVALID;

    next(AppError.unauthorized(message, code));
  }
}
