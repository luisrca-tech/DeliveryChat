import { Hono } from "hono";
import { getApplicationSettings } from "../features/applications/application.service.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const widgetRoute = new Hono().get("/settings/:appId", async (c) => {
  const appId = c.req.param("appId");
  if (!appId) {
    return jsonError(c, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.BAD_REQUEST, "appId required");
  }

  const settings = await getApplicationSettings(appId);
  if (!settings) {
    return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  return c.json(
    { settings },
    200,
    {
      "Cache-Control": "public, max-age=300",
    },
  );
});
