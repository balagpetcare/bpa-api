import { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { HTTP_STATUS } from '../config/constants';
import { getRequestId } from './requestId';

function buildRateLimitHandler(message: string) {
  return (
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const requestId = getRequestId(req);
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      requestId,
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    });
  };
}

/** Public form submission rate limit - Configurable from env */
const PUBLIC_FORM_WINDOW = parseInt(process.env.PUBLIC_REGISTRATION_RATE_LIMIT_WINDOW_MS || '900000', 10); // Default 15 mins
const PUBLIC_FORM_MAX = parseInt(process.env.PUBLIC_REGISTRATION_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? '50' : '5'), 10);
const ME_PETS_WINDOW = parseInt(process.env.ME_PETS_RATE_LIMIT_WINDOW_MS || '60000', 10);
const ME_PETS_MAX = parseInt(process.env.ME_PETS_RATE_LIMIT_MAX || '300', 10);

/** submissions per window per IP â€” for public form endpoints */
export const publicFormLimiter = rateLimit({
  windowMs: PUBLIC_FORM_WINDOW,
  max: PUBLIC_FORM_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many attempts. Please wait a few minutes before trying again.'),
});

/** 60 requests per minute â€” for public read endpoints */
export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many requests. Please try again later.'),
});

/** 10 login attempts per 15 minutes per IP â€” brute-force protection */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many login attempts. Please try again in 15 minutes.'),
});

/** 20 refresh attempts per 15 minutes per IP */
export const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many requests. Please try again later.'),
});

/** 3 membership lookups per 10 minutes per IP â€” prevents card-number + mobile enumeration */
export const membershipLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.MEMBERSHIP_LOOKUP_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? '30' : '3'), 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many lookup attempts. Please wait before trying again.'),
  skipSuccessfulRequests: false,
});

/** Payment callback endpoints â€” strict limit to slow down replay/probe attempts */
export const callbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many requests.'),
});

/** OTP request limit â€” 5 requests per 15 minutes */
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many OTP requests. Please try again in 15 minutes.'),
});

/** OAuth callback limit â€” 20 requests per 15 minutes */
export const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many OAuth attempts. Please try again later.'),
});

/** Content comments limit â€” 10 comments per 5 minutes per IP */
export const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many comments. Please wait before trying again.'),
});

/** Content reactions limit â€” 30 reactions per minute per IP */
export const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many actions. Please slow down.'),
});

/** Admin notification send/schedule/test-send actions — key by admin user id (not IP,
 * since a shared office IP shouldn't throttle a single admin's legitimate console use). */
export const notificationSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.NOTIFICATION_SEND_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || ipKeyGenerator(req.ip || 'unknown'),
  handler: buildRateLimitHandler('Too many notification send requests. Please wait a moment before sending again.'),
});

/** /me/pets traffic is mobile-heavy and needs a separate ceiling from public reads */
export const mePetsLimiter = rateLimit({
  windowMs: ME_PETS_WINDOW,
  max: ME_PETS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many pet management requests. Please slow down and try again shortly.'),
});

// ─── Spay & Neuter ────────────────────────────────────────────────────

/** Slot-hold creation — keyed per authenticated user, not IP, so one busy
 * clinic's shared NAT/proxy can't throttle every owner trying to book.
 * Capped low enough to make a scripted "hold every slot" capacity-denial
 * attack impractical without blocking a legitimate owner retrying a race. */
export const spayHoldLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.SPAY_HOLD_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || ipKeyGenerator(req.ip || 'unknown'),
  handler: buildRateLimitHandler('Too many booking-hold attempts. Please wait a moment and try again.'),
});

/** Booking creation from a hold — same per-user key, tighter ceiling since
 * this is the step that actually calls out to EPS. */
export const spayBookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.SPAY_BOOKING_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || ipKeyGenerator(req.ip || 'unknown'),
  handler: buildRateLimitHandler('Too many booking attempts. Please wait a moment and try again.'),
});

/** QR/booking-code lookup — bookingCode is cryptographically unguessable
 * and qrToken is an opaque HMAC, so this is defense-in-depth against
 * scripted scraping/enumeration rather than a brute-force stop. */
export const spayLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler('Too many lookup requests. Please wait a moment and try again.'),
});

/** Refund approve/reject/process and manual-refund-request creation —
 * keyed per staff user since these are always authenticated actions. */
export const spayPaymentActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub || ipKeyGenerator(req.ip || 'unknown'),
  handler: buildRateLimitHandler('Too many payment/refund actions. Please wait a moment and try again.'),
});
