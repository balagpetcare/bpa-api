import jwt from 'jsonwebtoken';
import { config } from '../config';

export function generateMockJWT(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(
    payload,
    config.CENTRAL_AUTH_JWT_SECRET || 'test-secret',
    {
      algorithm: config.CENTRAL_AUTH_JWT_ALGORITHM as jwt.Algorithm || 'HS256',
      issuer: config.CENTRAL_AUTH_JWT_ISSUER,
      audience: config.CENTRAL_AUTH_JWT_AUDIENCE,
      ...options,
    }
  );
}
