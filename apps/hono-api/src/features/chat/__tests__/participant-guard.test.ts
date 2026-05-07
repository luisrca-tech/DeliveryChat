import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockIsParticipant = vi.fn();

vi.mock("../../../db/index.js", () => ({ db: {} }));
vi.mock("../../../db/schema/conversations.js", () => ({ conversations: {} }));
vi.mock("../../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../../db/schema/conversationParticipants.js", () => ({
  conversationParticipants: {},
}));
vi.mock("../chat.service.js", () => ({
  isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
}));

const { requireParticipant } = await import("../participant-guard.js");

type Variables = {
  visitor: { visitorId: string; visitorUserId: string };
};

function createTestApp() {
  return new Hono<{ Variables: Variables }>()
    .use("*", async (c, next) => {
      c.set("visitor", { visitorId: "v-1", visitorUserId: "user-1" });
      await next();
    })
    .use("/conversations/:id/*", requireParticipant())
    .use("/conversations/:id", requireParticipant())
    .get("/conversations/:id", (c) => c.json({ ok: true }))
    .get("/conversations/:id/messages", (c) => c.json({ messages: [] }));
}

describe("requireParticipant middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls next when visitor is a participant", async () => {
    mockIsParticipant.mockResolvedValue(true);
    const app = createTestApp();

    const res = await app.request("/conversations/conv-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockIsParticipant).toHaveBeenCalledWith("conv-1", "user-1");
  });

  it("returns 404 when visitor is not a participant", async () => {
    mockIsParticipant.mockResolvedValue(false);
    const app = createTestApp();

    const res = await app.request("/conversations/conv-1");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("applies to sub-routes under /:id/*", async () => {
    mockIsParticipant.mockResolvedValue(false);
    const app = createTestApp();

    const res = await app.request("/conversations/conv-1/messages");
    expect(res.status).toBe(404);
  });
});
