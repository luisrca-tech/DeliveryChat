import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../../db/index.js", () => ({ db: {} }));
vi.mock("../../../db/schema/conversations.js", () => ({ conversations: {} }));
vi.mock("../../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../../db/schema/conversationParticipants.js", () => ({
  conversationParticipants: {},
}));

const { mapServiceErrorToResponse } = await import("../error-mapper.js");
const {
  MessageNotFoundError,
  NotMessageSenderError,
  MessageEditWindowExpiredError,
  ConversationNotFoundError,
  ConversationNotActiveError,
} = await import("../chat.service.js");

function createTestApp(errorToThrow: Error) {
  return new Hono().get("/test", (c) => {
    const result = mapServiceErrorToResponse(c, errorToThrow);
    if (result) return result;
    return c.json({ fallthrough: true });
  });
}

describe("mapServiceErrorToResponse", () => {
  it("maps MessageNotFoundError to 404", async () => {
    const app = createTestApp(new MessageNotFoundError("msg-1"));
    const res = await app.request("/test");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
    expect(body.message).toBe("Message not found");
  });

  it("maps NotMessageSenderError to 403", async () => {
    const app = createTestApp(new NotMessageSenderError("msg-1", "user-1"));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("maps MessageEditWindowExpiredError to 422", async () => {
    const app = createTestApp(
      new MessageEditWindowExpiredError("msg-1", "2026-01-01T00:00:00Z", 15),
    );
    const res = await app.request("/test");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("edit_window_expired");
  });

  it("maps ConversationNotFoundError to 404", async () => {
    const app = createTestApp(new ConversationNotFoundError("conv-1"));
    const res = await app.request("/test");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
    expect(body.message).toBe("Conversation not found");
  });

  it("maps ConversationNotActiveError to 422", async () => {
    const app = createTestApp(new ConversationNotActiveError("conv-1", "closed"));
    const res = await app.request("/test");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("conversation_not_active");
  });

  it("returns null for unknown errors", async () => {
    const app = createTestApp(new Error("something else"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallthrough).toBe(true);
  });
});
