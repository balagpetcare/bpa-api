import { Request } from 'express';

export interface AuthPayload {
  sub: string;
  email?: string;
  roles: string[];
  // permissions intentionally excluded from the JWT.
  // A super_admin with 100+ permissions produces a ~32 KB token, which exceeds
  // Nginx's proxy_buffer / NextAuth cookie limits and causes 502 Bad Gateway.
  // The login JSON response still includes permissions (for admin UI bootstrap).
  // authorize() reloads permissions from DB for non-super-admin users.
}

export type AuthenticatedRequest = Request;

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
