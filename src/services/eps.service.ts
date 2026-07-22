import crypto from 'crypto';
import { EPS } from 'eps-gateway-nodejs';
import { config } from '../config';
import { AppError } from '../utils/AppError';

// ── EPS gateway base URL ───────────────────────────────────────────────────────
// The eps-gateway-nodejs SDK has a hardcoded sandbox domain (sandbox-pgapi.eps.com.bd)
// that differs from the real EPS sandbox (sandboxpgapi.eps.com.bd). We bypass the
// SDK's HTTP calls for token + initialize so we can use the correct base URL.

function isSandbox(): boolean {
  if (config.EPS_ENV === 'production') return false;
  if (config.EPS_ENV === 'demo') return true;
  return config.EPS_SANDBOX === 'true';
}

export function getEpsGatewayBase(): string {
  const explicit = (config.EPS_BASE_URL || config.EPS_API_BASE_URL || '').replace(/\/$/, '');
  if (explicit) return explicit;
  return isSandbox()
    ? 'https://sandboxpgapi.eps.com.bd'
    : 'https://pgapi.eps.com.bd';
}

function epsHmac(value: string, key: string): string {
  return crypto.createHmac('sha512', Buffer.from(key, 'utf8'))
    .update(value, 'utf8')
    .digest('base64');
}

// ── Token cache ────────────────────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiry: Date | null = null;

async function fetchEpsToken(): Promise<string> {
  if (_cachedToken && _tokenExpiry && new Date() < _tokenExpiry) return _cachedToken;

  const base = getEpsGatewayBase();
  const url = `${base}/v1/Auth/GetToken`;
  const hash = epsHmac(config.EPS_USERNAME!, config.EPS_HASH_KEY!);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hash': hash },
      body: JSON.stringify({ userName: config.EPS_USERNAME, password: config.EPS_PASSWORD }),
    });
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    if (process.env.NODE_ENV !== 'production') console.error(`[EPS] GetToken network error: ${msg}`);
    throw new Error(`EPS GetToken: no response from ${url}`);
  }

  let body: Record<string, unknown> = {};
  try { body = await res.json() as Record<string, unknown>; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const errMsg = typeof body.errorMessage === 'string' ? body.errorMessage
      : typeof body.ErrorMessage === 'string' ? body.ErrorMessage
      : `HTTP ${res.status}`;
    if (process.env.NODE_ENV !== 'production') console.error(`[EPS] GetToken failed: ${errMsg}`);
    throw new Error(`EPS GetToken failed: ${errMsg}`);
  }

  if (body.errorMessage || body.errorCode) {
    throw new Error(`EPS authentication failed: ${body.errorMessage ?? body.errorCode}`);
  }

  if (typeof body.token !== 'string') {
    throw new Error('EPS GetToken: no token in response');
  }

  _cachedToken = body.token;
  _tokenExpiry = body.expireDate
    ? new Date(body.expireDate as string)
    : new Date(Date.now() + 20 * 60 * 1000);
  return _cachedToken;
}

// ── Direct EPS initialize call ─────────────────────────────────────────────────

export interface EpsInitializeResponse {
  RedirectURL: string;
  TransactionId: string;
  EPSTransactionId?: string;
  ErrorMessage?: string;
  ErrorCode?: string | null;
  [key: string]: unknown;
}

async function callEpsInitialize(
  requestBody: Record<string, unknown>,
  merchantTxnId: string,
): Promise<EpsInitializeResponse> {
  const base = getEpsGatewayBase();
  const url = `${base}/v1/EPSEngine/InitializeEPS`;
  const token = await fetchEpsToken();
  const hash = epsHmac(merchantTxnId, config.EPS_HASH_KEY!);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hash': hash,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    if (process.env.NODE_ENV !== 'production') console.error(`[EPS] InitializeEPS network error: ${msg}`);
    throw new Error(`EPS InitializeEPS: no response from ${url}`);
  }

  let body: Record<string, unknown> = {};
  try { body = await res.json() as Record<string, unknown>; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const errMsg = typeof body.ErrorMessage === 'string' ? body.ErrorMessage
      : typeof body.errorMessage === 'string' ? body.errorMessage
      : `HTTP ${res.status}`;
    if (process.env.NODE_ENV !== 'production') console.error(`[EPS] InitializeEPS failed: ${errMsg}`);
    throw new Error(`EPS InitializeEPS failed: ${errMsg}`);
  }

  if (body.ErrorMessage || body.ErrorCode) {
    throw new Error(`EPS initialization failed: ${body.ErrorMessage}`);
  }

  if (!body.RedirectURL || !body.TransactionId) {
    const missing = [!body.RedirectURL ? 'RedirectURL' : '', !body.TransactionId ? 'TransactionId' : ''].filter(Boolean).join(', ');
    throw new Error(`EPS InitializeEPS: missing ${missing} in response`);
  }

  return body as EpsInitializeResponse;
}

// ── SDK instance (used only for verifyPayment) ─────────────────────────────────

let _instance: EPS | null = null;

export function getEPS(): EPS {
  if (!_instance) {
    const missing: string[] = [];
    if (!config.EPS_USERNAME) missing.push('EPS_USERNAME');
    if (!config.EPS_PASSWORD) missing.push('EPS_PASSWORD');
    if (!config.EPS_HASH_KEY) missing.push('EPS_HASH_KEY');
    if (!config.EPS_MERCHANT_ID) missing.push('EPS_MERCHANT_ID');
    if (!config.EPS_STORE_ID) missing.push('EPS_STORE_ID');
    if (missing.length) {
      throw new Error(`EPS gateway is not configured. Missing env vars: ${missing.join(', ')}`);
    }

    const sandbox = isSandbox();
    console.log(`[EPS] Initializing SDK in ${sandbox ? 'SANDBOX (demo)' : 'PRODUCTION'} mode`);
    _instance = new EPS({
      username: config.EPS_USERNAME!,
      password: config.EPS_PASSWORD!,
      hashKey: config.EPS_HASH_KEY!,
      merchantId: config.EPS_MERCHANT_ID!,
      storeId: config.EPS_STORE_ID!,
      sandbox,
    });

    // Patch SDK endpoints to use the configured gateway base URL.
    // The SDK hardcodes sandbox-pgapi.eps.com.bd (hyphen) but the real
    // sandbox endpoint may be sandboxpgapi.eps.com.bd (no hyphen).
    const epsBase = getEpsGatewayBase();
    const ep = (_instance as unknown as { ENDPOINTS: Record<string, Record<string, string>> }).ENDPOINTS;
    const tier = sandbox ? 'SANDBOX' : 'PRODUCTION';
    ep[tier].GET_TOKEN  = `${epsBase}/v1/Auth/GetToken`;
    ep[tier].INITIALIZE = `${epsBase}/v1/EPSEngine/InitializeEPS`;
    ep[tier].VERIFY     = `${epsBase}/v1/EPSEngine/CheckMerchantTransactionStatus`;
    console.log(`[EPS] SDK ${tier} endpoints overridden → ${epsBase}`);
  }

  return _instance;
}

export function getEPSMissingCredentials(): string[] {
  const missing: string[] = [];
  if (!config.EPS_USERNAME) missing.push('EPS_USERNAME');
  if (!config.EPS_PASSWORD) missing.push('EPS_PASSWORD');
  if (!config.EPS_HASH_KEY) missing.push('EPS_HASH_KEY');
  if (!config.EPS_MERCHANT_ID) missing.push('EPS_MERCHANT_ID');
  if (!config.EPS_STORE_ID) missing.push('EPS_STORE_ID');
  return missing;
}

/** Returns true when either naming convention activates EPS for donations. */
export function isDonationEPSMode(): boolean {
  // New convention: PAYMENT_PROVIDER=EPS + DONATION_PAYMENT_MODE=GATEWAY
  if (config.PAYMENT_PROVIDER === 'EPS' && config.DONATION_PAYMENT_MODE === 'GATEWAY') return true;
  // Legacy convention: EPS_ENABLED=true + PAYMENT_CHANNEL_MODE=EPS
  if (config.EPS_ENABLED === 'true' && config.PAYMENT_CHANNEL_MODE === 'EPS') return true;
  return false;
}

export function isEPSConfigured(): boolean {
  // Support both naming conventions
  const channelOk = config.PAYMENT_PROVIDER === 'EPS' || config.PAYMENT_CHANNEL_MODE === 'EPS';
  const enabledOk = config.EPS_ENABLED === 'true' || config.PAYMENT_PROVIDER === 'EPS';
  if (!channelOk || !enabledOk) return false;
  return !!(
    config.EPS_USERNAME &&
    config.EPS_PASSWORD &&
    config.EPS_HASH_KEY &&
    config.EPS_MERCHANT_ID &&
    config.EPS_STORE_ID
  );
}

export function isEpsMockModeEnabled(): boolean {
  return config.EPS_MOCK_MODE === 'true' && config.NODE_ENV !== 'production';
}

export function validateEPSStartup(): void {
  if (config.EPS_ENABLED !== 'true') return;

  const missing: string[] = [];
  if (!config.EPS_USERNAME) missing.push('EPS_USERNAME');
  if (!config.EPS_PASSWORD) missing.push('EPS_PASSWORD');
  if (!config.EPS_HASH_KEY) missing.push('EPS_HASH_KEY');
  if (!config.EPS_MERCHANT_ID) missing.push('EPS_MERCHANT_ID');
  if (!config.EPS_STORE_ID) missing.push('EPS_STORE_ID');

  if (missing.length) {
    console.error(`[EPS] FATAL: EPS_ENABLED=true but the following credentials are missing: ${missing.join(', ')}`);
    console.error('[EPS] Set all required EPS_* variables in .env or the process will fall back to manual payment mode.');
    return;
  }

  const env = config.EPS_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX (demo)';
  console.log(`[EPS] Payment gateway configured - mode: ${env}, PAYMENT_CHANNEL_MODE=${config.PAYMENT_CHANNEL_MODE}`);
}

export function generateMerchantTxnId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    pad(now.getMilliseconds(), 3),
  ].join('');
}

const BD_PHONE_RE = /^01[3-9]\d{8}$/;

export function normalizeBdPhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-()+.]/g, '');

  let local = cleaned;
  if (local.startsWith('8801')) {
    local = local.slice(3);
  }

  if (!local.startsWith('0') && local.length === 10) {
    local = '0' + local;
  }

  if (!BD_PHONE_RE.test(local)) {
    throw AppError.badRequest(
      `Invalid phone number. Expected Bangladesh mobile format: 01XXXXXXXXX (e.g. 01712345678). Received: "${raw}"`,
    );
  }

  return local;
}

export interface EpsPaymentParams {
  customerOrderId: string;
  merchantTransactionId: string;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPostcode: string;
  productName: string;
  valueA?: string;
  valueB?: string;
  valueC?: string;
  bookingRef?: string;
  referenceRef?: string;
}

function containsLocalhost(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function buildCallbackUrl(
  apiBase: string,
  callbackPath: string,
  refs?: { bookingRef?: string; referenceRef?: string },
): string {
  const url = new URL(`${apiBase}${callbackPath}`);
  if (refs?.bookingRef) url.searchParams.set('bookingRef', refs.bookingRef);
  if (refs?.referenceRef) url.searchParams.set('ref', refs.referenceRef);
  return url.toString();
}

export async function initializeEpsPayment(params: EpsPaymentParams): Promise<EpsInitializeResponse> {
  const customerPhone = normalizeBdPhone(params.customerPhone);
  const { bookingRef, referenceRef, ...epsParams } = params;

  // callbackBase = our backend (for EPS to POST callbacks back to us)
  const callbackBase = config.BACKEND_URL.replace(/\/$/, '');
  const callbackRefs = { bookingRef, referenceRef };
  const successUrl = buildCallbackUrl(callbackBase, '/api/v1/payment/callback/success', callbackRefs);
  const failUrl    = buildCallbackUrl(callbackBase, '/api/v1/payment/callback/fail', callbackRefs);
  const cancelUrl  = buildCallbackUrl(callbackBase, '/api/v1/payment/callback/cancel', callbackRefs);

  if (config.NODE_ENV === 'production') {
    if (containsLocalhost(callbackBase) || containsLocalhost(config.FRONTEND_URL)) {
      throw new Error(
        `[EPS] Config error: localhost URL detected in production. ` +
          `BACKEND_URL="${callbackBase}" FRONTEND_URL="${config.FRONTEND_URL}". ` +
          `Set both to production hostnames.`,
      );
    }
  }

  const gatewayBase = getEpsGatewayBase();
  console.log(
    `[EPS] initializePayment | ` +
      `gatewayBase=${gatewayBase} | ` +
      `callbackBase=${callbackBase} | ` +
      `successUrl=${successUrl} | ` +
      `failUrl=${failUrl} | ` +
      `cancelUrl=${cancelUrl}`,
  );

  const requestBody: Record<string, unknown> = {
    merchantId:            config.EPS_MERCHANT_ID,
    storeId:               config.EPS_STORE_ID,
    CustomerOrderId:       epsParams.customerOrderId,
    merchantTransactionId: epsParams.merchantTransactionId,
    transactionTypeId:     1, // WEB
    financialEntityId:     0,
    transitionStatusId:    0,
    totalAmount:           epsParams.totalAmount,
    ipAddress:             '0.0.0.0',
    version:               '1',
    successUrl,
    failUrl,
    cancelUrl,
    customerName:          epsParams.customerName,
    customerEmail:         epsParams.customerEmail,
    CustomerAddress:       epsParams.customerAddress,
    CustomerAddress2:      '',
    CustomerCity:          epsParams.customerCity,
    CustomerState:         epsParams.customerState,
    CustomerPostcode:      epsParams.customerPostcode,
    CustomerCountry:       'BD',
    CustomerPhone:         customerPhone,
    ShipmentName:          '',
    ShipmentAddress:       '',
    ShipmentAddress2:      '',
    ShipmentCity:          '',
    ShipmentState:         '',
    ShipmentPostcode:      '',
    ShipmentCountry:       '',
    ValueA:                epsParams.valueA ?? '',
    ValueB:                epsParams.valueB ?? '',
    ValueC:                epsParams.valueC ?? '',
    ValueD:                '',
    ShippingMethod:        'NO',
    NoOfItem:              '1',
    ProductName:           epsParams.productName,
    ProductProfile:        'general',
    ProductCategory:       'general',
    ProductList:           [],
  };

  return callEpsInitialize(requestBody, epsParams.merchantTransactionId);
}

const MEMBERSHIP_FEES: Record<string, number> = {
  regular: 500,
  student: 200,
  corporate: 5000,
};

export function getMembershipFee(type: string): number {
  return MEMBERSHIP_FEES[type] ?? 500;
}
