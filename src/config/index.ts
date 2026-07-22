import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  BCRYPT_ROUNDS: z.coerce.number().default(12),

  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_SECURE: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),

  // EPS Payment Gateway — feature flag and environment
  // EPS_ENABLED=true   → EPS payment is active (requires all credentials below)
  // EPS_ENABLED=false  → fall back to manual/support mode
  EPS_ENABLED: z.enum(['true', 'false']).default('false'),
  // EPS_ENV=demo        → sandbox endpoints (sandbox-pgapi.eps.com.bd)
  // EPS_ENV=production  → live endpoints    (pgapi.eps.com.bd)
  EPS_ENV: z.enum(['sandbox', 'demo', 'production']).default('sandbox'),
  // Legacy alias kept for backward-compat; EPS_ENV takes precedence when both are set
  EPS_SANDBOX: z.enum(['true', 'false']).default('true'),

  // EPS Payment Gateway SDK credentials
  EPS_USERNAME: z.string().optional(),
  EPS_PASSWORD: z.string().optional(),
  EPS_HASH_KEY: z.string().optional(),
  EPS_SECRET_KEY: z.string().optional(),
  EPS_MERCHANT_ID: z.string().optional(),
  EPS_STORE_ID: z.string().optional(),
  EPS_APP_KEY: z.string().optional(),
  EPS_MOCK_MODE: z.enum(['true', 'false']).default('false'),

  // Payment channel routing
  // PAYMENT_CHANNEL_MODE=EPS     → use EPS gateway (requires EPS_ENABLED=true + credentials)
  // PAYMENT_CHANNEL_MODE=MANUAL  → skip gateway, return booking for manual payment/support
  PAYMENT_CHANNEL_MODE: z.enum(['EPS', 'MANUAL']).default('MANUAL'),

  // Donation-specific payment routing (alternate naming convention — both styles supported)
  // PAYMENT_PROVIDER=EPS + DONATION_PAYMENT_MODE=GATEWAY → use EPS for donations
  // PAYMENT_PROVIDER=MANUAL or unset                     → manual / not configured
  PAYMENT_PROVIDER: z.enum(['EPS', 'MANUAL']).optional(),
  DONATION_PAYMENT_MODE: z.enum(['GATEWAY', 'MANUAL', 'MOCK']).optional(),

  EPS_SUCCESS_URL: z.string().optional(),
  // EPS gateway base URL — overrides the URL embedded in the eps-gateway-nodejs SDK.
  // Use this when the SDK's hardcoded domain (sandbox-pgapi.eps.com.bd) differs from
  // the real sandbox domain (sandboxpgapi.eps.com.bd). No trailing slash.
  EPS_BASE_URL: z.string().optional(),
  EPS_API_BASE_URL: z.string().optional(), // alternate name accepted by some setups
  // Informational only — code builds callback URLs from BACKEND_URL automatically.
  EPS_SUCCESS_URL_OLD: z.string().optional(), // rename to avoid collision if needed, or keep original
  EPS_FAIL_URL: z.string().optional(),
  EPS_CANCEL_URL: z.string().optional(),
  EPS_IPN_URL: z.string().optional(),
  EPS_ALLOWED_REDIRECT_HOSTS: z.string().default(''),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  ADMIN_BASE_URL: z.string().url().default('http://localhost:3001'),

  // Comma-separated list of IPs allowed to hit payment callback endpoints.
  // When empty (development default), no IP filtering is applied.
  EPS_CALLBACK_IPS: z.string().default(''),

  // HMAC secret for QR token generation — keep stable per campaign lifecycle
  QR_SECRET: z.string().default('bpa-qr-secret-change-in-production-min32chars!!'),

  // Separate HMAC secret for Care Partner Card QR tokens — must differ from QR_SECRET
  CARE_CARD_QR_SECRET: z.string().default('bpa-care-card-qr-secret-change-in-production!!'),

  // ─── Manual / MFS Payment Config ─────────────────────────────────────────
  // When PAYMENT_CHANNEL_MODE=MANUAL, these are returned as MFS payment instructions
  MFS_BKASH_NUMBER: z.string().default('01XXXXXXXXX'),
  MFS_NAGAD_NUMBER: z.string().default('01XXXXXXXXX'),
  MFS_ROCKET_NUMBER: z.string().default('01XXXXXXXXX'),
  MFS_ACCOUNT_HOLDER: z.string().default('Bangladesh Pet Association'),
  MFS_INSTRUCTIONS_BN: z.string().default('আপনার সদস্যপদ ফি নিচের যে কোনো নম্বরে পাঠিয়ে Transaction ID নিচে সাবমিট করুন।'),
  MFS_INSTRUCTIONS_EN: z.string().default('Send your membership fee to any of the numbers below and submit the Transaction ID.'),

  // ─── Media / File Storage ────────────────────────────────────────────────
  // STORAGE_DRIVER=s3    → S3-compatible (MinIO, AWS S3, DO Spaces, Wasabi, R2)
  // STORAGE_DRIVER=local → local disk ./uploads/ (development fallback)
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

  // Required when STORAGE_DRIVER=s3
  S3_ENDPOINT: z.string().optional(),          // http://127.0.0.1:9000 for MinIO; omit for AWS
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'), // 'true' for MinIO

  // Public base URL for media files served to clients in S3 mode.
  //   Backblaze B2: https://f005.backblazeb2.com/file/bpa-production-media
  //   AWS S3:       https://bpa-pets.s3.amazonaws.com
  //   MinIO (local):http://127.0.0.1:9000/bpa-pets
  // URL is constructed as: ${S3_PUBLIC_BASE_URL}/${objectKey}
  S3_PUBLIC_BASE_URL: z.string().optional(),

  // Legacy alias — kept for backwards compatibility; S3_PUBLIC_BASE_URL takes precedence.
  MEDIA_PUBLIC_BASE_URL: z.string().optional(),

  // ─── New Auth & Social ───────────────────────────────────────────────────
  AUTH_COOKIE_NAME: z.string().default('bpa_user_session'),
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters long').default('local_dev_secret_min_32_chars_change_in_production'),
  AUTH_JWT_EXPIRES_IN: z.string().default('7d'),
  AUTH_PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  AUTH_ADMIN_WEB_URL: z.string().url().default('http://localhost:3001'),
  AUTH_API_URL: z.string().url().default('http://localhost:4000'),
  CENTRAL_AUTH_JWT_SECRET: z.string().min(32).optional(),
  CENTRAL_AUTH_JWT_PUBLIC_KEY: z.string().optional(),
  CENTRAL_AUTH_JWT_ISSUER: z.string().optional(),
  CENTRAL_AUTH_JWT_AUDIENCE: z.string().optional(),
  CENTRAL_AUTH_JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('HS256'),
  FURTAIL_API_BASE_URL: z.string().url().default('http://localhost:7200/api/v1'),
  FURTAIL_API_TIMEOUT_MS: z.coerce.number().default(15000),
  FURTAIL_API_RETRY_LIMIT: z.coerce.number().int().min(0).max(5).default(1),
  ME_PETS_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  ME_PETS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CALLBACK_URL: z.string().url().optional(),

  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_CALLBACK_URL: z.string().url().optional(),

  TWITTER_CLIENT_ID: z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  TWITTER_CALLBACK_URL: z.string().url().optional(),

  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  MAIL_CREDENTIAL_SECRET: z.string().optional(),
  DEFAULT_SMTP_HOST: z.string().default('d552.dimedns.com'),
  DEFAULT_SMTP_PORT: z.coerce.number().default(465),
  DEFAULT_SMTP_SECURE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(true),
  DEFAULT_IMAP_HOST: z.string().default('d552.dimedns.com'),
  DEFAULT_IMAP_PORT: z.coerce.number().default(993),
  DEFAULT_IMAP_SECURE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(true),
  MAIL_SYNC_ENABLED: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(true),
  MAIL_SYNC_INTERVAL_MINUTES: z.coerce.number().default(5),
  MAIL_ATTACHMENT_MAX_MB: z.coerce.number().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  EPS_HASH_KEY: parsed.data.EPS_HASH_KEY || parsed.data.EPS_SECRET_KEY,
  EPS_STORE_ID: parsed.data.EPS_STORE_ID || parsed.data.EPS_APP_KEY,
};

export const corsOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());

const QR_SECRET_DEFAULT = 'bpa-qr-secret-change-in-production-min32chars!!';
if (config.NODE_ENV === 'production' && config.QR_SECRET === QR_SECRET_DEFAULT) {
  console.error('[SECURITY] QR_SECRET is using the insecure default value. Set QR_SECRET in environment before deploying to production!');
  process.exit(1);
}

const CARE_CARD_QR_SECRET_DEFAULT = 'bpa-care-card-qr-secret-change-in-production!!';
if (config.NODE_ENV === 'production' && config.CARE_CARD_QR_SECRET === CARE_CARD_QR_SECRET_DEFAULT) {
  console.error('[SECURITY] CARE_CARD_QR_SECRET is using the insecure default value. Set CARE_CARD_QR_SECRET in environment before deploying to production!');
  process.exit(1);
}

const AUTH_JWT_SECRET_DEFAULT = 'local_dev_secret_min_32_chars_change_in_production';
if (config.NODE_ENV === 'production' && config.AUTH_JWT_SECRET === AUTH_JWT_SECRET_DEFAULT) {
  console.error('[SECURITY] AUTH_JWT_SECRET is using the insecure default value. Set AUTH_JWT_SECRET in environment before deploying to production!');
  process.exit(1);
}

// ─── MAIL_CREDENTIAL_SECRET validation ───────────────────────────
const mailSecret = config.MAIL_CREDENTIAL_SECRET;
if (!mailSecret) {
  if (config.NODE_ENV === 'production') {
    console.error('[SECURITY ERROR] MAIL_CREDENTIAL_SECRET is missing. Set it with 32+ characters in environment before deploying to production!');
    process.exit(1);
  } else {
    console.warn('[SECURITY WARNING] MAIL_CREDENTIAL_SECRET is missing in development. Email account password credentials encryption cannot be fully processed.');
  }
} else if (mailSecret.length < 32) {
  if (config.NODE_ENV === 'production') {
    console.error('[SECURITY ERROR] MAIL_CREDENTIAL_SECRET must be at least 32 characters long in production!');
    process.exit(1);
  } else {
    console.warn('[SECURITY WARNING] MAIL_CREDENTIAL_SECRET should be at least 32 characters long for secure encryption.');
  }
}
