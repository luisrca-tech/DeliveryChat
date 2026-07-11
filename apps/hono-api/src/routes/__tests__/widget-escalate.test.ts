import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const CONVERSATION_ID = "650e8400-e29b-41d4-a716-446655440001";
const VISITOR_ID = "visitor-1";

const mockSelect = vi.fn();
vi.mock("../../db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));
vi.mock("../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../db/schema/users.js", () => ({ user: {} }));
vi.mock("../../db/schema/conversations.js", () => ({
  conversations: { id: "id", applicationId: "applicationId" },
}));
vi.mock("../../lib/security/wsToken.js", () => ({ signWsToken: vi.fn() }));
vi.mock("../../env.js", () => ({ env: {} }));
vi.mock("../../features/applications/application.service.js", () => ({
  getApplicationSettings: vi.fn(),
}));
vi.mock("../../features/ai-turn/resolveInitialHandledBy.js", () => ({
  resolveInitialHandledBy: vi.fn(),
}));

const mockIsParticipant = vi.fn();
vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: vi.fn(),
  listConversationsForVisitor: vi.fn(),
  getUnreadCountForVisitor: vi.fn(),
  markAsRead: vi.fn(),
  isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
}));
vi.mock("../../features/chat/visitor.service.js", () => ({
  resolveOrCreateVisitor: vi.fn(),
}));

const mockEscalateIfAiHandled = vi.fn();
vi.mock("../conversations/escalation.js", () => ({
  escalateIfAiHandled: (...args: unknown[]) => mockEscalateIfAiHandled(...args),
}));
vi.mock("../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: vi.fn(() => null),
}));

vi.mock("../../lib/middleware/widgetAuth.js", () => ({
  requireWidgetAuth: () => async (_c: any, next: () => Promise<void>) =>
    next(),
  getWidgetAuth: () => ({
    application: { id: "app-1" },
    organizationId: "org-1",
  }),
}));
vi.mock("../../lib/middleware/visitorRateLimit.js", () => ({
  createVisitorRateLimitMiddleware:
    () => async (_c: any, next: () => Promise<void>) => next(),
}));
vi.mock("../../lib/middleware/visitorRateLimitInstance.js", () => ({
  sharedVisitorRateLimiter: { check: () => ({ allowed: true }) },
}));
vi.mock("../../features/identity/identify.route.js", () => ({
  identifyRoute: new Hono(),
}));

const { widgetRoute } = await import("../widget.js");

const app = new Hono().route("/widget", widgetRoute);

function mockConversationLookup(found: boolean) {
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(found ? [{ id: CONVERSATION_ID }] : []),
      }),
    }),
  });
}

function escalateRequest(headers: Record<string, string> = {}) {
  return app.request(`/widget/conversations/${CONVERSATION_ID}/escalate`, {
    method: "POST",
    headers: {
      "X-App-Id": "app-1",
      "X-Visitor-Id": VISITOR_ID,
      ...headers,
    },
  });
}

describe("POST /widget/conversations/:id/escalate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escalates an AI-handled conversation for a participating visitor", async () => {
    mockConversationLookup(true);
    mockIsParticipant.mockResolvedValue(true);
    mockEscalateIfAiHandled.mockResolvedValue({
      outcome: "escalated",
      conversation: { id: CONVERSATION_ID, handledBy: "human" },
    });

    const res = await escalateRequest();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversation.handledBy).toBe("human");
    expect(mockEscalateIfAiHandled).toHaveBeenCalledWith(
      CONVERSATION_ID,
      "org-1",
    );
  });

  it("is an idempotent success when already human-handled", async () => {
    mockConversationLookup(true);
    mockIsParticipant.mockResolvedValue(true);
    mockEscalateIfAiHandled.mockResolvedValue({
      outcome: "noop",
      conversation: { id: CONVERSATION_ID, handledBy: "human" },
    });

    const res = await escalateRequest();

    expect(res.status).toBe(200);
  });

  it("returns 409 for a closed conversation", async () => {
    mockConversationLookup(true);
    mockIsParticipant.mockResolvedValue(true);
    mockEscalateIfAiHandled.mockResolvedValue({
      outcome: "closed",
      conversation: { id: CONVERSATION_ID, status: "closed" },
    });

    const res = await escalateRequest();

    expect(res.status).toBe(409);
  });

  it("returns 404 when the conversation belongs to another application", async () => {
    mockConversationLookup(false);

    const res = await escalateRequest();

    expect(res.status).toBe(404);
    expect(mockEscalateIfAiHandled).not.toHaveBeenCalled();
  });

  it("returns 404 when the visitor is not a participant", async () => {
    mockConversationLookup(true);
    mockIsParticipant.mockResolvedValue(false);

    const res = await escalateRequest();

    expect(res.status).toBe(404);
    expect(mockEscalateIfAiHandled).not.toHaveBeenCalled();
  });

  it("returns 400 without the X-Visitor-Id header", async () => {
    const res = await app.request(
      `/widget/conversations/${CONVERSATION_ID}/escalate`,
      { method: "POST", headers: { "X-App-Id": "app-1" } },
    );

    expect(res.status).toBe(400);
    expect(mockEscalateIfAiHandled).not.toHaveBeenCalled();
  });
});
