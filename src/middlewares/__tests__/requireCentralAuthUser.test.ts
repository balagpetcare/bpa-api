import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { config } from '../../config';
import { requireCentralAuthUser } from '../requireCentralAuthUser';
import { signAccessToken } from '../../utils/jwt';

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
    cookies: {},
  } as unknown as Request;
}

function makeCookieReq(sessionToken?: string): Request {
  return {
    headers: {},
    cookies: sessionToken ? { [config.AUTH_COOKIE_NAME]: sessionToken } : {},
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

  it('rejects requests with no Authorization header and no session cookie', () => {
    const req = makeReq();
    const next = jest.fn();
    requireCentralAuthUser(req, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  // Regression coverage for the Spay & Neuter booking-flow incident: bpa_web
  // users authenticate via bpa_api's own local email/OTP login (POST
  // /auth/login), which sets an httpOnly session cookie carrying a token
  // signed by signAccessToken() (issuer "bpa-api", audience "bpa-client") —
  // NOT a Central-Auth-issued token. Before this fix, every /me/* route
  // (including /me/pets and /me/spay-neuter/holds) only ever inspected the
  // Authorization header for a genuine Central Auth token, so a fully,
  // correctly logged-in web user could never get past this middleware at all.
  describe('local session cookie (bpa_web login)', () => {
    it('accepts a valid local session cookie when no Authorization header is present', () => {
      const token = signAccessToken({ sub: 'web-user-1', email: 'owner@example.test', roles: ['member'] });
      const req = makeCookieReq(token);
      const next = jest.fn();
      requireCentralAuthUser(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user?.sub).toBe('web-user-1');
      expect(req.user?.email).toBe('owner@example.test');
    });

    it('the Authorization header takes precedence over a session cookie when both are present', () => {
      const centralToken = signToken(); // signed as a genuine Central Auth token
      const req = makeReq(centralToken);
      (req as unknown as { cookies: Record<string, string> }).cookies = {
        [config.AUTH_COOKIE_NAME]: signAccessToken({ sub: 'web-user-2', roles: [] }),
      };
      const next = jest.fn();
      requireCentralAuthUser(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user?.sub).toBe('user-123'); // from the Central Auth token, not the cookie
    });

    it('reports an expired local session cookie as TOKEN_EXPIRED, distinct from an invalid one', () => {
      const expired = jwt.sign({ sub: 'web-user-3', roles: [] }, config.AUTH_JWT_SECRET, {
        issuer: 'bpa-api',
        audience: 'bpa-client',
        expiresIn: -10,
      });
      const req = makeCookieReq(expired);
      const next = jest.fn();
      requireCentralAuthUser(req, {} as Response, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects a malformed/tampered session cookie', () => {
      const req = makeCookieReq('not-a-real-token');
      const next = jest.fn();
      requireCentralAuthUser(req, {} as Response, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('TOKEN_INVALID');
    });
  });
});
