import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const APP_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORG_ID = "org_123";
const VISITOR_ID = "visitor_abc";

vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../db/schema/users.js", () => ({ user: {} }));
vi.mock("../../db/schema/conversations.js", () => ({ conversations: {} }));
vi.mock("../../db/schema/applications.js", () => ({ applications: {} }));
vi.mock("../../db/schema/organization.js", () => ({ organization: {} }));
vi.mock("../../lib/security/wsToken.js", () => ({ signWsToken: vi.fn() }));
vi.mock("../../env.js", () => ({ env: {} }));

vi.mock("../../features/applications/application.service.js", () => ({
  getApplicationSettings: vi.fn(),
}));

const mockResolveInitialHandledBy = vi.fn();
vi.mock("../../features/ai-turn/resolveInitialHandledBy.js", () => ({
  resolveInitialHandledBy: mockResolveInitialHandledBy,
}));

const mockCreateConversation = vi.fn();
vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: mockCreateConversation,
  listConversationsForVisitor: vi.fn(),
  getUnreadCountForVisitor: vi.fn(),
  markAsRead: vi.fn(),
  isParticipant: vi.fn(),
}));
vi.mock("../conversations/escalation.js", () => ({
  escalateIfAiHandled: vi.fn(),
}));
vi.mock("../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: vi.fn(() => null),
}));
vi.mock("../../features/chat/visitor.service.js", () => ({
  resolveOrCreateVisitor: vi.fn(),
}));
vi.mock("../../lib/middleware/widgetAuth.js", () => ({
  requireWidgetAuth: () => async (_c: any, next: () => Promise<void>) => next(),
  getWidgetAuth: () => ({
    organizationId: ORG_ID,
    application: { id: APP_ID, organizationId: ORG_ID },
  }),
}));
vi.mock("../../lib/middleware/visitorRateLimit.js", () => ({
  createVisitorRateLimitMiddleware:
    () => async (_c: any, next: () => Promise<void>) =>
      next(),
}));
vi.mock("../../lib/middleware/visitorRateLimitInstance.js", () => ({
  sharedVisitorRateLimiter: { check: () => ({ allowed: true }) },
}));
vi.mock("../../features/identity/identify.route.js", () => ({
  identifyRoute: new Hono(),
}));

const { widgetRoute } = await import("../widget.js");

const app = new Hono().route("/widget", widgetRoute);

function post() {
  return app.request("/widget/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Visitor-Id": VISITOR_ID,
    },
    body: JSON.stringify({ subject: "Hello" }),
  });
}

describe("POST /widget/conversations — initial handledBy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateConversation.mockResolvedValue({ id: "conv_1" });
  });

  it("creates an AI-handled conversation when the application is entitled", async () => {
    mockResolveInitialHandledBy.mockResolvedValue("ai");

    const res = await post();

    expect(res.status).toBe(201);
    expect(mockResolveInitialHandledBy).toHaveBeenCalledWith(APP_ID);
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ handledBy: "ai" }),
    );
  });

  it("creates a human-handled conversation when the application is not entitled", async () => {
    mockResolveInitialHandledBy.mockResolvedValue("human");

    const res = await post();

    expect(res.status).toBe(201);
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ handledBy: "human" }),
    );
  });
});
