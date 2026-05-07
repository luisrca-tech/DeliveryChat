import type { Context } from "hono";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import {
  MessageNotFoundError,
  NotMessageSenderError,
  MessageEditWindowExpiredError,
  ConversationNotFoundError,
  ConversationNotActiveError,
} from "./chat.service.js";

export function mapServiceErrorToResponse(
  c: Context,
  error: unknown,
): Response | null {
  if (error instanceof MessageNotFoundError) {
    return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Message not found");
  }
  if (error instanceof NotMessageSenderError) {
    return jsonError(c, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN, "You can only modify your own messages");
  }
  if (error instanceof MessageEditWindowExpiredError) {
    return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "edit_window_expired", error.message);
  }
  if (error instanceof ConversationNotFoundError) {
    return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
  }
  if (error instanceof ConversationNotActiveError) {
    return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "conversation_not_active", error.message);
  }
  return null;
}
