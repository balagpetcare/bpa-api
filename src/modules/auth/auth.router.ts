import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import {
  authLoginLimiter,
  authRefreshLimiter,
  otpRequestLimiter,
  oauthCallbackLimiter,
} from '../../middlewares/rateLimiter';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  changePasswordSchema,
} from './auth.types';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  requestOtpHandler,
  verifyOtpHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  resendVerificationHandler,
  verifyEmailHandler,
  changePasswordHandler,
} from './auth.controller';
import {
  oauthStartHandler,
  oauthCallbackHandler,
} from './oauth.controller';

const router = Router();

router.post('/login', authLoginLimiter, validate(loginSchema), loginHandler);
router.post('/register/email', authLoginLimiter, validate(registerSchema), registerHandler);
router.post('/mobile/request-otp', otpRequestLimiter, validate(requestOtpSchema), requestOtpHandler);
router.post('/mobile/verify-otp', authLoginLimiter, validate(verifyOtpSchema), verifyOtpHandler);

router.get('/oauth/:provider/start', oauthStartHandler);
router.get('/oauth/:provider/callback', oauthCallbackLimiter, oauthCallbackHandler);

router.post('/email/resend-verification', authLoginLimiter, validate(resendVerificationSchema), resendVerificationHandler);
router.get('/email/verify', verifyEmailHandler);

router.post('/password/forgot', validate(forgotPasswordSchema), forgotPasswordHandler);
router.post('/password/reset', validate(resetPasswordSchema), resetPasswordHandler);

router.post('/refresh', authRefreshLimiter, validate(refreshSchema), refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', authenticate, meHandler);
router.post('/change-password', authenticate, validate(changePasswordSchema), changePasswordHandler);

// OAuth routes will be added in a separate controller/service for clarity or integrated here
// For now, I'll keep the core routes.

export default router;
