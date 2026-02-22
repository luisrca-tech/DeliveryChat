import type { Context } from "hono";

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  BAD_REQUEST: "Bad Request",
  UNAUTHORIZED: "Unauthorized",
  PAYMENT_REQUIRED: "Payment Required",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
  VALIDATION_ERROR: "Validation Error",
  CONFLICT: "Conflict",
  TOO_MANY_REQUESTS: "Too Many Requests",
} as const;

type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export function jsonError(
  c: Context,
  status: HttpStatus,
  error: string,
  message?: string,
) {
  return c.json(
    {
      error,
      ...(message ? { message } : {}),
    },
    status,
  );
}
