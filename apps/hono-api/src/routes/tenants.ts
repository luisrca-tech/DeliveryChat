import { Hono } from "hono";
import { resolveOrganizationBySubdomain } from "../lib/tenant.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const tenantsRoute = new Hono().get("/tenants/check", async (c) => {
  try {
    const subdomain = c.req.query("subdomain");

    if (!subdomain) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "Subdomain query parameter is required",
      );
    }

    const org = await resolveOrganizationBySubdomain(subdomain);

    const exists = !!org;

    return c.json({
      exists,
    });
  } catch (error) {
    return jsonError(
      c,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
});
