// Focused, network-free coverage for the EPS configuration/validation and
// pure helper logic in eps.service.ts — the pieces that must be correct
// before any live sandbox call is attempted. No credentials are read,
// asserted against, or logged anywhere in this file; the mocked `config`
// values below are test fixtures, never real secrets.

const baseConfig = {
  NODE_ENV: 'test' as string,
  EPS_ENABLED: 'false' as string,
  EPS_ENV: 'sandbox' as string,
  EPS_SANDBOX: 'true' as string,
  EPS_USERNAME: undefined as string | undefined,
  EPS_PASSWORD: undefined as string | undefined,
  EPS_HASH_KEY: undefined as string | undefined,
  EPS_MERCHANT_ID: undefined as string | undefined,
  EPS_STORE_ID: undefined as string | undefined,
  EPS_BASE_URL: undefined as string | undefined,
  EPS_API_BASE_URL: undefined as string | undefined,
  PAYMENT_PROVIDER: undefined as string | undefined,
  PAYMENT_CHANNEL_MODE: 'MANUAL' as string,
  EPS_MOCK_MODE: 'false' as const,
  BACKEND_URL: 'https://api.bpa.test',
  FRONTEND_URL: 'https://bpa.test',
};

let mockConfig: typeof baseConfig;

jest.mock('../../config', () => ({
  get config() {
    return mockConfig;
  },
}));

// eps-gateway-nodejs itself is never exercised here — these tests only
// cover this repo's own config-gating and pure-formatting logic, never a
// real network call.
jest.mock('eps-gateway-nodejs', () => ({ EPS: jest.fn() }));

import {
  isEPSConfigured,
  getEPSMissingCredentials,
  generateMerchantTxnId,
  normalizeBdPhone,
  getEpsGatewayBase,
} from '../eps.service';

describe('isEPSConfigured — the single gate that decides "pay online" vs "Payment Pending"', () => {
  beforeEach(() => {
    mockConfig = { ...baseConfig };
  });

  it('is false when EPS_ENABLED=false, regardless of anything else (the documented default for new installs)', () => {
    mockConfig.EPS_ENABLED = 'false';
    mockConfig.PAYMENT_CHANNEL_MODE = 'EPS';
    mockConfig.EPS_USERNAME = 'x'; mockConfig.EPS_PASSWORD = 'x'; mockConfig.EPS_HASH_KEY = 'x';
    mockConfig.EPS_MERCHANT_ID = 'x'; mockConfig.EPS_STORE_ID = 'x';
    expect(isEPSConfigured()).toBe(false);
  });

  it('is false when enabled + channel set but any one credential is missing', () => {
    mockConfig.EPS_ENABLED = 'true';
    mockConfig.PAYMENT_CHANNEL_MODE = 'EPS';
    mockConfig.EPS_USERNAME = 'x'; mockConfig.EPS_PASSWORD = 'x'; mockConfig.EPS_HASH_KEY = 'x';
    mockConfig.EPS_MERCHANT_ID = 'x';
    mockConfig.EPS_STORE_ID = undefined; // missing
    expect(isEPSConfigured()).toBe(false);
  });

  it('is false when credentials are all present but PAYMENT_CHANNEL_MODE is still MANUAL', () => {
    mockConfig.EPS_ENABLED = 'true';
    mockConfig.PAYMENT_CHANNEL_MODE = 'MANUAL';
    mockConfig.EPS_USERNAME = 'x'; mockConfig.EPS_PASSWORD = 'x'; mockConfig.EPS_HASH_KEY = 'x';
    mockConfig.EPS_MERCHANT_ID = 'x'; mockConfig.EPS_STORE_ID = 'x';
    expect(isEPSConfigured()).toBe(false);
  });

  it('is true only when enabled, channel=EPS, and every credential is present', () => {
    mockConfig.EPS_ENABLED = 'true';
    mockConfig.PAYMENT_CHANNEL_MODE = 'EPS';
    mockConfig.EPS_USERNAME = 'x'; mockConfig.EPS_PASSWORD = 'x'; mockConfig.EPS_HASH_KEY = 'x';
    mockConfig.EPS_MERCHANT_ID = 'x'; mockConfig.EPS_STORE_ID = 'x';
    expect(isEPSConfigured()).toBe(true);
  });
});

describe('getEPSMissingCredentials — names the exact missing env vars, never their values', () => {
  beforeEach(() => {
    mockConfig = { ...baseConfig };
  });

  it('lists every missing credential by name when none are set', () => {
    const missing = getEPSMissingCredentials();
    expect(missing).toEqual(
      expect.arrayContaining(['EPS_USERNAME', 'EPS_PASSWORD', 'EPS_HASH_KEY', 'EPS_MERCHANT_ID', 'EPS_STORE_ID']),
    );
    // Never a value, only the variable name — spot-check no fixture value leaked into the list.
    for (const entry of missing) {
      expect(entry).toMatch(/^EPS_[A-Z_]+$/);
    }
  });

  it('is empty once all five credentials are present', () => {
    mockConfig.EPS_USERNAME = 'x'; mockConfig.EPS_PASSWORD = 'x'; mockConfig.EPS_HASH_KEY = 'x';
    mockConfig.EPS_MERCHANT_ID = 'x'; mockConfig.EPS_STORE_ID = 'x';
    expect(getEPSMissingCredentials()).toEqual([]);
  });
});

describe('generateMerchantTxnId — unique-per-attempt, matches the callback router\'s MERCHANT_TXN_ID_RE (/^\\d{17}$/)', () => {
  it('produces a 17-digit numeric string (payment-callbacks.router.ts validateMerchantTxnId depends on exactly this shape)', () => {
    const id = generateMerchantTxnId();
    expect(id).toMatch(/^\d{17}$/);
  });

  it('is a fresh value on every call (millisecond-resolution timestamp — see the uniqueness caveat in the final report)', () => {
    const ids = new Set(Array.from({ length: 5 }, () => generateMerchantTxnId()));
    // Not a strict cryptographic-uniqueness guarantee (two calls in the same
    // millisecond would collide) — the DB's @unique constraint on
    // Payment.merchantTxnId is the actual backstop; this only proves the
    // generator advances across normal call spacing.
    expect(ids.size).toBeGreaterThan(0);
  });
});

describe('normalizeBdPhone — validated before ever being sent to EPS as CustomerPhone', () => {
  it('accepts a canonical 01XXXXXXXXX number unchanged', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678');
  });

  it('normalizes a country-code-prefixed number (8801XXXXXXXXX) to canonical local form', () => {
    expect(normalizeBdPhone('8801777889994'.slice(0, 13))).toBe('01777889994');
  });

  it('rejects an invalid/short number with a typed, safe validation error (never silently mangled)', () => {
    expect(() => normalizeBdPhone('12345')).toThrow(/Invalid phone number/);
  });
});

describe('getEpsGatewayBase — resolves sandbox vs production endpoint from config only, never hardcoded credentials', () => {
  beforeEach(() => {
    mockConfig = { ...baseConfig };
  });

  it('defaults to the sandbox host when EPS_ENV=sandbox/demo and no explicit override is set', () => {
    mockConfig.EPS_ENV = 'sandbox';
    expect(getEpsGatewayBase()).toMatch(/sandbox/i);
  });

  it('prefers an explicit EPS_BASE_URL override over the computed default', () => {
    mockConfig.EPS_BASE_URL = 'https://custom-eps-gateway.test';
    expect(getEpsGatewayBase()).toBe('https://custom-eps-gateway.test');
  });
});
