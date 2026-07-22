import { Response } from 'express';
import { HTTP_STATUS } from '../config/constants';
import { ApiSuccessResponse, PaginationMeta } from '../types';

/**
 * Recursively scans an object for BigInt and Prisma Decimal values and converts them to:
 * - Numbers if they fit within Number.MAX_SAFE_INTEGER
 * - Strings otherwise (to avoid precision loss in JSON or rendering errors)
 */
export function serializeData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    if (obj <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(obj);
    return obj.toString();
  }

  // Handle Prisma Decimal (decimal.js) — constructor name check is not reliable
  // after minification or across module instances, so use duck typing instead.
  if (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as any).toFixed === 'function' &&
    typeof (obj as any).toDecimalPlaces === 'function'
  ) {
    const n = parseFloat((obj as any).toString());
    return isNaN(n) ? 0 : n;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeData);
  }

  // Check if it's a plain object (exclude Dates and other complex types)
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = serializeData(obj[key]);
      }
    }
    return newObj;
  }

  return obj;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  status: number = HTTP_STATUS.OK,
  meta?: PaginationMeta | Record<string, unknown>,
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data: serializeData(data),
  };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, HTTP_STATUS.CREATED);
}

export function sendNoContent(res: Response): Response {
  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function parsePaginationQuery(
  rawPage: unknown,
  rawLimit: unknown,
  defaultLimit = 20,
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(100, Math.max(1, Number(rawLimit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
