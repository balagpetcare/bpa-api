import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { HTTP_STATUS } from '../../config/constants';
import * as authService from './auth.service';
import { config } from '../../config';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  domain: config.NODE_ENV === 'production' ? '.bangladeshpetassociation.com' : undefined,
};

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.login(req.body);
    setAuthCookies(res, result);
    sendSuccess(res, result, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
}

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.register(req.body);
    setAuthCookies(res, result);
    sendSuccess(res, result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function requestOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.requestOtp(req.body);
    sendSuccess(res, result, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authService.verifyOtp(req.body);
    setAuthCookies(res, result);
    sendSuccess(res, result, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
}

export async function resendVerificationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.resendVerification(req.body.email);
    sendSuccess(res, { message: 'If an account exists, a verification link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/email-verified?status=failed`);
      return;
    }
    await authService.verifyEmail(token);
    res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/email-verified?status=success`);
  } catch (err) {
    res.redirect(`${config.AUTH_PUBLIC_WEB_URL}/auth/email-verified?status=failed`);
  }
}

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refreshToken = req.cookies[config.AUTH_COOKIE_NAME + '_refresh'] || req.body.refreshToken;
    const result = await authService.refresh(refreshToken);
    setAuthCookies(res, result);
    sendSuccess(res, result, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refreshToken = req.cookies[config.AUTH_COOKIE_NAME + '_refresh'] || req.body.refreshToken;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    res.clearCookie(config.AUTH_COOKIE_NAME, COOKIE_OPTIONS);
    res.clearCookie(config.AUTH_COOKIE_NAME + '_refresh', COOKIE_OPTIONS);
    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (err) {
    next(err);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authService.getMe(req.user.sub);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.forgotPassword(req.body);
    sendSuccess(res, { message: 'If an account exists with this email, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.resetPassword(req.body);
    sendSuccess(res, { message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.changePassword(req.user!.sub, req.body);
    sendSuccess(res, { message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
}

function setAuthCookies(res: Response, result: any) {
  res.cookie(config.AUTH_COOKIE_NAME, result.accessToken, COOKIE_OPTIONS);
  res.cookie(config.AUTH_COOKIE_NAME + '_refresh', result.refreshToken, COOKIE_OPTIONS);
}
