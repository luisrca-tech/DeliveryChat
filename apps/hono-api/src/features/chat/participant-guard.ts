import type { MiddlewareHandler } from "hono";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { isParticipant } from "./chat.service.js";

export function requireParticipant(): MiddlewareHandler {
  return async (c, next) => {
    const conversationId = c.req.param("id")!;
    const visitor = c.get("visitor") as { visitorUserId: string };

    const participantCheck = await isParticipant(
      conversationId,
      visitor.visitorUserId,
    );

    if (!participantCheck) {
      return jsonError(
        c,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND,
        "Conversation not found",
      );
    }

    await next();
  };
}
