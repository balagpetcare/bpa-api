import { Request, Response, NextFunction } from 'express';
import * as oauthService from './oauth.service';
import * as authService from './auth.service';
import { config } from '../../config';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  domain: config.NODE_ENV === 'production' ? '.bangladeshpetassociation.com' : undefined,
};

export async function oauthStartHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { provider } = req.params;
    const state = Math.random().toString(36).substring(7);
    
    // Store state in a short-lived cookie for validation
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const authUrl = await oauthService.getAuthUrl(provider, state);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

export async function oauthCallbackHandler(req: Request, res: Response) {
  try {
    const { provider } = req.params;
    const { code, state } = req.query;
    const savedState = req.cookies['oauth_state'];

    res.clearCookie('oauth_state');

    if (!code || !state || state !== savedState) {
      console.warn('OAuth State Mismatch or missing code');
      return res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/sign-in?error=oauth_invalid_state`);
    }

    const user = await oauthService.handleCallback(provider, code as string);
    const result = await authService.issueTokenPair(user as any);

    res.cookie(config.AUTH_COOKIE_NAME, result.accessToken, COOKIE_OPTIONS);
    res.cookie(config.AUTH_COOKIE_NAME + '_refresh', result.refreshToken, COOKIE_OPTIONS);

    res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/callback?token=${result.accessToken}`);
  } catch (err) {
    console.error('OAuth Callback Error:', err);
    res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/sign-in?error=oauth_failed`);
  }
}
