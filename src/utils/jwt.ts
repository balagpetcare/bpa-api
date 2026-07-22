import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { AuthPayload } from '../types';

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.AUTH_JWT_SECRET, {
    expiresIn: config.AUTH_JWT_EXPIRES_IN,
    issuer: 'bpa-api',
    audience: 'bpa-client',
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  // jti (JWT ID) ensures every token is unique even when called in rapid succession,
  // preventing unique-constraint failures on the refresh_tokens table.
  return jwt.sign({ sub: userId, jti: randomUUID() }, config.AUTH_JWT_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
    issuer: 'bpa-api',
    audience: 'bpa-client',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, config.AUTH_JWT_SECRET, {
    issuer: 'bpa-api',
    audience: 'bpa-client',
  }) as AuthPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, config.AUTH_JWT_SECRET, {
    issuer: 'bpa-api',
    audience: 'bpa-client',
  }) as { sub: string };
}

export function getRefreshTokenExpiryDate(): Date {
  const ms = parseExpiry(config.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + ms);
}

export function getAccessTokenExpiryDate(): Date {
  const ms = parseExpiry(config.AUTH_JWT_EXPIRES_IN);
  return new Date(Date.now() + ms);
}

function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);
  const map: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (map[unit] ?? 1000);
}
