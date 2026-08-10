import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, centralAuthAudiences } from '../config';
import { AppError } from '../utils/AppError';
import { ERROR_CODES } from '../config/constants';
import { verifyAccessToken } from '../utils/jwt';

type CentralAuthPayload = {
  sub: string;
  email?: string;
  roles?: string[];
};

export function verifyCentralAuthToken(token: string): CentralAuthPayload {
  const payload = config.CENTRAL_AUTH_JWT_PUBLIC_KEY
    ? verifyWithPublicKey(token)
    : verifyWithSecret(token);
  if (!payload.sub) {
    throw AppError.unauthorized('Invalid Central Auth token', ERROR_CODES.TOKEN_INVALID);
  }
  return payload;
}

function verifyWithPublicKey(token: string): CentralAuthPayload {
  if (!config.CENTRAL_AUTH_JWT_PUBLIC_KEY) {
    throw AppError.unauthorized('Central Auth verification is not configured', ERROR_CODES.UNAUTHORIZED);
  }
  return jwt.verify(token, config.CENTRAL_AUTH_JWT_PUBLIC_KEY, {
    algorithms: [config.CENTRAL_AUTH_JWT_ALGORITHM],
    issuer: config.CENTRAL_AUTH_JWT_ISSUER,
    audience: centralAuthAudiences,
  }) as CentralAuthPayload;
}

function verifyWithSecret(token: string): CentralAuthPayload {
  if (!config.CENTRAL_AUTH_JWT_SECRET) {
    throw AppError.unauthorized('Central Auth verification is not configured', ERROR_CODES.UNAUTHORIZED);
  }
  return jwt.verify(token, config.CENTRAL_AUTH_JWT_SECRET, {
    algorithms: [config.CENTRAL_AUTH_JWT_ALGORITHM],
    issuer: config.CENTRAL_AUTH_JWT_ISSUER,
    audience: centralAuthAudiences,
  }) as CentralAuthPayload;
}

// Every /me/* route (pets, dashboard, spay-neuter holds/bookings, ...) sits
// behind this middleware. It must accept BOTH of the platform's two
// legitimate token sources — exactly mirroring authenticate.ts's existing
// dual-issuer pattern, just for owner-facing (not staff/admin) routes:
//
//   1. Authorization: Bearer <token> carrying a genuine Central Auth JWT
//      (mobile app / true external SSO) — verified against
//      CENTRAL_AUTH_JWT_* config, exactly as before.
//   2. The httpOnly session cookie (config.AUTH_COOKIE_NAME) set by bpa_api's
//      own POST /auth/login — bpa_web's own account system. This is bpa_api's
//      *local* JWT (issuer "bpa-api", audience "bpa-client"), verified with
//      verifyAccessToken(), the same function authenticate.ts already trusts.
//
// Before this, a bpa_web user who successfully logged in via the local
// email/OTP flow could never reach any /me/* route — the cookie they
// actually held was never even inspected here, only a Bearer header
// carrying a *Central-Auth-issued* token was accepted. That silently broke
// the entire owner booking flow (pets, spay-neuter holds/bookings) for
// every web user, independent of whether their login itself succeeded.
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export function requireCentralAuthUser(req: Request, _res: Response, next: NextFunction): void {
  const bearerToken = extractBearerToken(req);
  const sessionCookie = req.cookies?.[config.AUTH_COOKIE_NAME];

  if (!bearerToken && !sessionCookie) {
    next(AppError.unauthorized('No token provided', ERROR_CODES.UNAUTHORIZED));
    return;
  }

  if (bearerToken) {
    try {
      const payload = verifyCentralAuthToken(bearerToken);
      req.user = {
        sub: payload.sub,
        email: payload.email,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };
      next();
      return;
    } catch (err) {
      next(toUnauthorizedError(err, 'Central Auth'));
      return;
    }
  }

  try {
    const payload = verifyAccessToken(sessionCookie);
    req.user = {
      sub: payload.sub,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
    next();
  } catch (err) {
    next(toUnauthorizedError(err, 'session'));
  }
}

function toUnauthorizedError(err: unknown, source: 'Central Auth' | 'session'): AppError {
  if (err instanceof AppError) return err;
  const expired = (err as Error).name === 'TokenExpiredError';
  const message = expired ? 'Your session has expired. Please sign in again.' : `Invalid ${source} token`;
  const code = expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID;
  return AppError.unauthorized(message, code);
}
