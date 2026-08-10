import { HTTP_STATUS } from "../config/constants";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message: string,
    code = "BAD_REQUEST",
    details?: unknown,
  ): AppError {
    return new AppError(HTTP_STATUS.BAD_REQUEST, code, message, details);
  }

  static unauthorized(
    message = "Unauthorized",
    code = "UNAUTHORIZED",
  ): AppError {
    return new AppError(HTTP_STATUS.UNAUTHORIZED, code, message);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN"): AppError {
    return new AppError(HTTP_STATUS.FORBIDDEN, code, message);
  }

  static notFound(resource: string, code = "NOT_FOUND"): AppError {
    return new AppError(HTTP_STATUS.NOT_FOUND, code, `${resource} not found`);
  }

  static conflict(message: string, code = "CONFLICT"): AppError {
    return new AppError(HTTP_STATUS.CONFLICT, code, message);
  }

  static internal(message: string, code = "INTERNAL_ERROR"): AppError {
    return new AppError(HTTP_STATUS.INTERNAL_ERROR, code, message);
  }

  static serviceUnavailable(
    message: string,
    code = "SERVICE_UNAVAILABLE",
  ): AppError {
    return new AppError(HTTP_STATUS.SERVICE_UNAVAILABLE, code, message);
  }
}
