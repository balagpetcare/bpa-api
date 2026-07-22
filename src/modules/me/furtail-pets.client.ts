import { config } from '../../config';
import { AppError } from '../../utils/AppError';

type Primitive = string | number | boolean | null | undefined;

type RequestLogContext = {
  requestId?: string;
  petId?: string;
  operation?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
};

type FetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  logContext?: RequestLogContext;
};

function getAuthHeaderValue(token?: string): string {
  const value = String(token || '').trim();
  if (!value) throw AppError.unauthorized('Missing upstream auth token');
  return value.startsWith('Bearer ') ? value : `Bearer ${value}`;
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function upstreamErrorMessage(body: any, fallback: string): string {
  return body?.error?.message || body?.message || fallback;
}

function upstreamErrorCode(body: any, fallback: string): string {
  return body?.error?.code || body?.code || fallback;
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function canRetry(method: string, attempt: number): boolean {
  return method === 'GET' && attempt < config.FURTAIL_API_RETRY_LIMIT;
}

function sanitizeLogContext(context: RequestLogContext = {}): Record<string, Primitive> {
  return {
    operation: context.operation,
    requestId: context.requestId,
    petId: context.petId,
    fileName: context.fileName,
    mimeType: context.mimeType,
    sizeBytes: context.sizeBytes,
  };
}

function logFurtailEvent(level: 'info' | 'warn' | 'error', event: string, payload: Record<string, Primitive>): void {
  const logger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
  logger('[furtail-pets-client]', JSON.stringify({ event, ...payload }));
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const extraHeaders = options.headers ?? {};
  const logContext = sanitizeLogContext(options.logContext);

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.FURTAIL_API_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Authorization: getAuthHeaderValue(options.token),
        'X-BPA-Source': 'backend-api',
        ...extraHeaders,
      };

      let body: any;
      if (options.formData) {
        body = options.formData;
      } else if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }

      const response = await fetch(`${config.FURTAIL_API_BASE_URL}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        if (isRetryableStatus(response.status) && canRetry(method, attempt)) {
          logFurtailEvent('warn', 'retryable_upstream_status', {
            path,
            method,
            status: response.status,
            attempt: attempt + 1,
            ...logContext,
          });
          continue;
        }

        throw new AppError(
          response.status,
          upstreamErrorCode(parsedBody, 'FURTAIL_UPSTREAM_ERROR'),
          upstreamErrorMessage(parsedBody, 'Furtail request failed'),
          parsedBody,
        );
      }

      if (body && attempt > 0) {
        logFurtailEvent('info', 'request_recovered_after_retry', {
          path,
          method,
          status: response.status,
          attempt: attempt + 1,
          ...logContext,
        });
      }

      if (parsedBody && typeof parsedBody === 'object' && 'success' in parsedBody) {
        return (parsedBody.data ?? null) as T;
      }

      return parsedBody as T;
    } catch (error) {
      if (error instanceof AppError) throw error;

      if ((error as Error)?.name === 'AbortError') {
        if (canRetry(method, attempt)) {
          logFurtailEvent('warn', 'retrying_timeout', {
            path,
            method,
            attempt: attempt + 1,
            ...logContext,
          });
          continue;
        }
        throw new AppError(504, 'FURTAIL_TIMEOUT', 'Furtail request timed out');
      }

      if (canRetry(method, attempt)) {
        logFurtailEvent('warn', 'retrying_transport_error', {
          path,
          method,
          attempt: attempt + 1,
          message: (error as Error)?.message || 'unknown error',
          ...logContext,
        });
        continue;
      }

      throw new AppError(
        502,
        'FURTAIL_REQUEST_FAILED',
        `Furtail request failed: ${(error as Error)?.message || 'unknown error'}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type FurtailForwardHeaders = {
  requestId?: string;
  idempotencyKey?: string;
};

function buildForwardHeaders(input: FurtailForwardHeaders = {}): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (input.requestId) headers['X-Request-Id'] = input.requestId;
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export async function listFurtailPets(token: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any[]> {
  return request<any[]>('/user/pets', {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_pets', requestId: forwardHeaders.requestId },
  });
}

export async function createFurtailPet(token: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>('/user/pets', {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'create_pet', requestId: forwardHeaders.requestId },
  });
}

export async function getFurtailPet(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_pet', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPet(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_pet', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPet(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}`, {
    method: 'DELETE',
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_pet', requestId: forwardHeaders.requestId, petId },
  });
}

export async function listFurtailPetVaccinations(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any[]> {
  return request<any[]>(`/user/pets/${encodeURIComponent(petId)}/vaccinations`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_vaccinations', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetVaccination(token: string, petId: string, vaccinationId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/vaccinations/${encodeURIComponent(vaccinationId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_vaccination', requestId: forwardHeaders.requestId, petId },
  });
}

export async function createFurtailPetVaccination(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/vaccinations`, {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders({
      requestId: forwardHeaders.requestId,
      idempotencyKey:
        forwardHeaders.idempotencyKey ||
        (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).idempotencyKey === 'string'
          ? String((payload as Record<string, unknown>).idempotencyKey).trim()
          : undefined),
    }),
    logContext: { operation: 'create_vaccination', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPetVaccination(token: string, petId: string, vaccinationId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/vaccinations/${encodeURIComponent(vaccinationId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_vaccination', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPetVaccination(token: string, petId: string, vaccinationId: string, payload: unknown = {}, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/vaccinations/${encodeURIComponent(vaccinationId)}`, {
    method: 'DELETE',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_vaccination', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetMedicalHistory(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_medical_history', requestId: forwardHeaders.requestId, petId },
  });
}

export async function listFurtailPetMedicalHistoryRecords(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history/records`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_medical_records', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetMedicalHistoryRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history/records/${encodeURIComponent(recordId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_medical_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function createFurtailPetMedicalHistoryRecord(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history/records`, {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'create_medical_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPetMedicalHistoryRecord(token: string, petId: string, recordId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history/records/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_medical_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPetMedicalHistoryRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/medical-history/records/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_medical_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function listFurtailPetDewormingRecords(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/deworming`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_deworming_records', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetDewormingRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/deworming/${encodeURIComponent(recordId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_deworming_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function createFurtailPetDewormingRecord(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/deworming`, {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'create_deworming_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPetDewormingRecord(token: string, petId: string, recordId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/deworming/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_deworming_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPetDewormingRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/deworming/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_deworming_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function listFurtailPetWeightRecords(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/weights`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_weight_records', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetWeightRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/weights/${encodeURIComponent(recordId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_weight_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function createFurtailPetWeightRecord(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/weights`, {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'create_weight_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPetWeightRecord(token: string, petId: string, recordId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/weights/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_weight_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPetWeightRecord(token: string, petId: string, recordId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/weights/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_weight_record', requestId: forwardHeaders.requestId, petId },
  });
}

export async function listFurtailPetDocuments(token: string, petId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/documents`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'list_pet_documents', requestId: forwardHeaders.requestId, petId },
  });
}

export async function getFurtailPetDocument(token: string, petId: string, documentId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/documents/${encodeURIComponent(documentId)}`, {
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'get_pet_document', requestId: forwardHeaders.requestId, petId },
  });
}

export async function createFurtailPetDocument(token: string, petId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/documents`, {
    method: 'POST',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'create_pet_document', requestId: forwardHeaders.requestId, petId },
  });
}

export async function updateFurtailPetDocument(token: string, petId: string, documentId: string, payload: unknown, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/documents/${encodeURIComponent(documentId)}`, {
    method: 'PATCH',
    token,
    body: payload,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'update_pet_document', requestId: forwardHeaders.requestId, petId },
  });
}

export async function deleteFurtailPetDocument(token: string, petId: string, documentId: string, forwardHeaders: FurtailForwardHeaders = {}): Promise<any> {
  return request<any>(`/user/pets/${encodeURIComponent(petId)}/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    token,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: { operation: 'delete_pet_document', requestId: forwardHeaders.requestId, petId },
  });
}

export async function uploadFurtailMedia(
  token: string,
  file: Express.Multer.File,
  forwardHeaders: FurtailForwardHeaders = {},
): Promise<any> {
  const formData = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype });
  formData.append('file', blob, file.originalname);

  return request<any>('/media/upload', {
    method: 'POST',
    token,
    formData,
    headers: buildForwardHeaders(forwardHeaders),
    logContext: {
      operation: 'upload_media',
      requestId: forwardHeaders.requestId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
  });
}
