import type { Context } from "hono";

export function jsonError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
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
