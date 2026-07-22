import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import * as repo from './pet-smart-solution.repository';
import type {
  PetSmartConnectionTestResponse,
  PetSmartIntegrationSettingsResponse,
  SyncLogListQuery,
  UpdateSettingsDto,
} from './pet-smart-solution.types';

const SYNC_ENTITY_VALUES = {
  contributors: 'contributors',
  carePartnerCards: 'care_partner_cards',
  petCensusLeads: 'pet_census_leads',
  zones: 'zones',
} as const;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('env:')) return `${value.slice(0, 4)}...${value.slice(-4)}`;
  if (value.length <= 8) return '********';
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

function getEnvReference(value: string | null): string | null {
  return value?.startsWith('env:') ? value : null;
}

function resolveSecretValue(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('env:')) return value;
  const envName = value.slice(4).trim();
  if (!envName) return null;
  return process.env[envName] ?? null;
}

function parseBooleanSetting(value: string | null | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'enabled'].includes(value.trim().toLowerCase());
}

function parseSyncEntities(value: string | null | undefined) {
  const enabledValues = new Set(
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

  return {
    contributors: enabledValues.has(SYNC_ENTITY_VALUES.contributors),
    carePartnerCards: enabledValues.has(SYNC_ENTITY_VALUES.carePartnerCards),
    petCensusLeads: enabledValues.has(SYNC_ENTITY_VALUES.petCensusLeads),
    zones: enabledValues.has(SYNC_ENTITY_VALUES.zones),
  };
}

function serializeSyncEntities(syncEnabled: {
  contributors: boolean;
  carePartnerCards: boolean;
  petCensusLeads: boolean;
  zones: boolean;
}) {
  const values = [
    syncEnabled.contributors ? SYNC_ENTITY_VALUES.contributors : null,
    syncEnabled.carePartnerCards ? SYNC_ENTITY_VALUES.carePartnerCards : null,
    syncEnabled.petCensusLeads ? SYNC_ENTITY_VALUES.petCensusLeads : null,
    syncEnabled.zones ? SYNC_ENTITY_VALUES.zones : null,
  ].filter(Boolean);

  return values.join(',');
}

function deriveStatus(enabled: boolean, baseUrl: string | null, apiKeyResolved: string | null): string {
  if (!enabled) return 'disabled';
  if (!baseUrl || !apiKeyResolved) return 'not_configured';
  return 'placeholder_only';
}

function sanitizeSummary(text: string | null | undefined, secrets: string[]): string | null {
  if (!text) return null;
  let sanitized = text;
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  return sanitized;
}

export async function listSettings(): Promise<PetSmartIntegrationSettingsResponse> {
  const [settingsMap, latestSyncAt] = await Promise.all([
    repo.getSettingsMap(),
    repo.getLatestSyncStartedAt(),
  ]);

  const baseUrlValue = settingsMap.get(repo.PET_SMART_SETTING_KEYS.baseUrl)?.settingValue ?? null;
  const apiKeyValue = settingsMap.get(repo.PET_SMART_SETTING_KEYS.apiKey)?.settingValue ?? null;
  const enabled = parseBooleanSetting(settingsMap.get(repo.PET_SMART_SETTING_KEYS.syncEnabled)?.settingValue);
  const syncEnabled = parseSyncEntities(settingsMap.get(repo.PET_SMART_SETTING_KEYS.syncEntities)?.settingValue);
  const resolvedApiKey = resolveSecretValue(apiKeyValue);
  const status = deriveStatus(enabled, baseUrlValue, resolvedApiKey);

  return {
    enabled,
    baseUrl: baseUrlValue,
    apiKeyConfigured: Boolean(resolvedApiKey),
    apiKeyMasked: maskSecret(apiKeyValue),
    apiKeyReference: getEnvReference(apiKeyValue),
    syncEnabled,
    lastSyncAt: latestSyncAt?.toISOString() ?? null,
    status,
  };
}

export async function getSetting(id: string) {
  const setting = await repo.getSettingById(id);
  if (!setting) throw AppError.notFound('Sync setting');
  return setting;
}

export async function updateSettings(dto: UpdateSettingsDto) {
  const existing = await listSettings();
  const nextEnabled = dto.enabled ?? existing.enabled;
  const nextBaseUrl = dto.baseUrl === undefined
    ? existing.baseUrl
    : normalizeOptionalText(dto.baseUrl);
  const currentSettingsMap = await repo.getSettingsMap();
  const persistedApiKeyValue =
    dto.apiKey === undefined
      ? currentSettingsMap.get(repo.PET_SMART_SETTING_KEYS.apiKey)?.settingValue ?? null
      : normalizeOptionalText(dto.apiKey);
  const nextSyncEnabled = dto.syncEnabled ?? existing.syncEnabled;
  const resolvedApiKey = resolveSecretValue(persistedApiKeyValue);
  const nextStatus = deriveStatus(nextEnabled, nextBaseUrl, resolvedApiKey);
  const syncEntities = serializeSyncEntities(nextSyncEnabled);

  await prisma.$transaction(async (tx) => {
    await repo.updateSettingByKey(repo.PET_SMART_SETTING_KEYS.syncEnabled, {
      settingValue: nextEnabled ? 'true' : 'false',
      isActive: nextEnabled,
      status: nextStatus,
    }, tx);

    await repo.updateSettingByKey(repo.PET_SMART_SETTING_KEYS.baseUrl, {
      settingValue: nextBaseUrl,
      isActive: Boolean(nextBaseUrl),
      status: nextStatus,
    }, tx);

    if (dto.apiKey !== undefined) {
      await repo.updateSettingByKey(repo.PET_SMART_SETTING_KEYS.apiKey, {
        settingValue: persistedApiKeyValue,
        isActive: Boolean(persistedApiKeyValue),
        status: nextStatus,
      }, tx);
    } else {
      await repo.updateSettingByKey(repo.PET_SMART_SETTING_KEYS.apiKey, {
        isActive: Boolean(persistedApiKeyValue),
        status: nextStatus,
      }, tx);
    }

    await repo.updateSettingByKey(repo.PET_SMART_SETTING_KEYS.syncEntities, {
      settingValue: syncEntities,
      isActive: Boolean(syncEntities),
      status: nextStatus,
    }, tx);
  });

  return listSettings();
}

export async function testConnection(): Promise<PetSmartConnectionTestResponse> {
  const settings = await listSettings();
  const checkedAt = new Date().toISOString();

  if (!settings.baseUrl) {
    return {
      connected: false,
      status: 'not_configured',
      baseUrl: null,
      checkedAt,
      message: 'Base URL is not configured yet.',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(settings.baseUrl);
  } catch {
    return {
      connected: false,
      status: 'invalid_url',
      baseUrl: settings.baseUrl,
      checkedAt,
      message: 'Base URL is not a valid URL.',
    };
  }

  if (!settings.apiKeyConfigured) {
    return {
      connected: false,
      status: 'not_configured',
      baseUrl: parsedUrl.toString(),
      checkedAt,
      message: 'API key or env reference is not configured.',
    };
  }

  if (!settings.enabled) {
    return {
      connected: false,
      status: 'disabled',
      baseUrl: parsedUrl.toString(),
      checkedAt,
      message: 'Integration is disabled. No external connection is attempted in this phase.',
    };
  }

  return {
    connected: false,
    status: 'placeholder_only',
    baseUrl: parsedUrl.toString(),
    checkedAt,
    message: 'Configuration looks valid. External connectivity is intentionally not attempted in this placeholder phase.',
  };
}

export async function listSyncLogs(query: SyncLogListQuery) {
  const result = await repo.listSyncLogs(query);
  const settingsMap = await repo.getSettingsMap();
  const secrets = [
    settingsMap.get(repo.PET_SMART_SETTING_KEYS.apiKey)?.settingValue,
    settingsMap.get(repo.PET_SMART_SETTING_KEYS.webhookSecret)?.settingValue,
  ]
    .map((value) => resolveSecretValue(value ?? null))
    .filter((value): value is string => Boolean(value));

  return {
    items: result.items.map((item) => ({
      ...item,
      requestSummary: sanitizeSummary(item.requestSummary, secrets),
      responseSummary: sanitizeSummary(item.responseSummary, secrets),
    })),
    meta: result.meta,
  };
}

export async function getSyncLog(id: string) {
  const log = await repo.getSyncLogById(id);
  if (!log) throw AppError.notFound('Sync log');

  const settingsMap = await repo.getSettingsMap();
  const secrets = [
    settingsMap.get(repo.PET_SMART_SETTING_KEYS.apiKey)?.settingValue,
    settingsMap.get(repo.PET_SMART_SETTING_KEYS.webhookSecret)?.settingValue,
  ]
    .map((value) => resolveSecretValue(value ?? null))
    .filter((value): value is string => Boolean(value));

  return {
    ...log,
    requestSummary: sanitizeSummary(log.requestSummary, secrets),
    responseSummary: sanitizeSummary(log.responseSummary, secrets),
  };
}

export async function createPlaceholderSyncLog(params: {
  settingId?: string | null;
  entityType: string;
  entityId: string;
  syncType: string;
  status?: 'pending' | 'success' | 'failed' | 'skipped';
  requestSummary?: string | null;
  responseSummary?: string | null;
  errorMessage?: string | null;
}) {
  return repo.createSyncLog({
    settingId: params.settingId ?? null,
    entityType: params.entityType,
    entityId: params.entityId,
    syncType: params.syncType,
    status: params.status ?? 'skipped',
    requestSummary: params.requestSummary ?? null,
    responseSummary: params.responseSummary ?? 'Integration placeholder only. No real sync executed.',
    errorMessage: params.errorMessage ?? null,
    finishedAt: new Date(),
  });
}
