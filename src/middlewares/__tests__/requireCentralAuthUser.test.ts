import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { config } from '../../config';
import { requireCentralAuthUser } from '../requireCentralAuthUser';

// Regression coverage for the "My Pets shows session expired" incident:
// bpa_api's CENTRAL_AUTH_JWT_AUDIENCE was set to "bpa-admin" while Central
// Auth actually issues BPA mobile-client tokens under "bpa-mobile", so every
// legitimate user token was rejected before the request ever reached Furtail.
//
// Also covers the BPA Admin login-loop incident: bpa_admin's OAuth client is
// registered separately from the mobile client, so Central Auth stamps admin
// tokens with the "bpa-admin" audience. CENTRAL_AUTH_ADDITIONAL_JWT_AUDIENCES
// must include "bpa-admin" alongside the primary "bpa-mobile" audience so both
// clients' tokens are accepted — see config/index.ts centralAuthAudiences.

function signToken(overrides: { audience?: string; issuer?: string; expiresIn?: string | number } = {}): string {
  return jwt.sign(
    { sub: 'user-123', email: 'user@example.com', roles: ['member'] },
    config.CENTRAL_AUTH_JWT_SECRET || 'test-secret',
    {
      algorithm: (config.CENTRAL_AUTH_JWT_ALGORITHM as jwt.Algorithm) || 'HS256',
      issuer: overrides.issuer ?? config.CENTRAL_AUTH_JWT_ISSUER,
      audience: overrides.audience ?? config.CENTRAL_AUTH_JWT_AUDIENCE,
      expiresIn: (overrides.expiresIn ?? '15m') as any,
    },
  );
}

function makeReq(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

describe('requireCentralAuthUser', () => {
  it('accepts a token whose audience matches the configured BPA mobile audience', () => {
    const req = makeReq(signToken());
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.sub).toBe('user-123');
  });

  it('accepts a token minted for the admin panel audience via CENTRAL_AUTH_ADDITIONAL_JWT_AUDIENCES', () => {
    const req = makeReq(signToken({ audience: 'bpa-admin' }));
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.sub).toBe('user-123');
  });

  it('rejects a token minted for an audience that is neither configured client', () => {
    const req = makeReq(signToken({ audience: 'some-other-client' }));
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_INVALID');
  });

  it('reports an expired token distinctly from an invalid one', () => {
    const req = makeReq(signToken({ expiresIn: -10 }));
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token from a different issuer', () => {
    const req = makeReq(signToken({ issuer: 'https://impostor-auth.example.com' }));
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_INVALID');
  });

  it('rejects requests with no Authorization header', () => {
    const req = makeReq();
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
