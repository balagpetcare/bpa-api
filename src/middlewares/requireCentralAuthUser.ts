import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, centralAuthAudiences } from '../config';
import { AppError } from '../utils/AppError';
import { ERROR_CODES } from '../config/constants';

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

export function requireCentralAuthUser(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('No token provided', ERROR_CODES.UNAUTHORIZED);
    }

    const token = authHeader.slice(7);
    const payload = config.CENTRAL_AUTH_JWT_PUBLIC_KEY
      ? verifyWithPublicKey(token)
      : verifyWithSecret(token);

    if (!payload.sub) {
      throw AppError.unauthorized('Invalid Central Auth token', ERROR_CODES.TOKEN_INVALID);
    }

    req.user = {
      sub: payload.sub,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    const message = (err as Error).name === 'TokenExpiredError'
      ? 'Central Auth access token expired'
      : 'Invalid Central Auth access token';
    const code = (err as Error).name === 'TokenExpiredError'
      ? ERROR_CODES.TOKEN_EXPIRED
      : ERROR_CODES.TOKEN_INVALID;
    next(AppError.unauthorized(message, code));
  }
}
