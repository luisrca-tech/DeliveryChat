import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  TEST_IDS,
  createMemberAuthContext,
  createVisitorAuthContext,
} from "../../__tests__/factories.js";

const { ORG_ID, APP_ID, CONV_ID } = TEST_IDS;

const mockGetConversationWithParticipants = vi.fn();
const mockIsParticipant = vi.fn();

vi.mock("../../../features/chat/chat.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../features/chat/chat.service.js")
    >();
  return {
    ...actual,
    getConversationWithParticipants: (...args: unknown[]) =>
      mockGetConversationWithParticipants(...args),
    isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
  };
});

const mockEscalateConversation = vi.fn();
vi.mock("../../../features/ai-turn/escalate.js", () => ({
  escalateConversation: (...args: unknown[]) =>
    mockEscalateConversation(...args),
}));

const mockMapServiceError = vi.fn().mockReturnValue(null);
vi.mock("../../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: (...args: unknown[]) =>
    mockMapServiceError(...args),
}));

vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

let mockUnifiedAuthContext: unknown = null;

vi.mock("../../../lib/middleware/unifiedAuth.js", () => ({
  requireAuth: () => async (c: any, next: () => Promise<void>) => {
    if (!mockUnifiedAuthContext) {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("unifiedAuth", mockUnifiedAuthContext);
    await next();
  },
  getUnifiedAuth: (c: any) => c.get("unifiedAuth"),
}));

const { escalationRoute } = await import("../escalation.js");

const app = new Hono().route("/conversations", escalationRoute);

function aiConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    organizationId: ORG_ID,
    applicationId: APP_ID,
    status: "pending",
    handledBy: "ai",
    assignedTo: null,
    createdBy: TEST_IDS.VISITOR_USER_ID,
    subject: "Help",
    createdAt: "2026-07-10T00:00:00.000Z",
    participants: [],
    ...overrides,
  };
}

function post() {
  return app.request(`/conversations/${CONV_ID}/escalate`, { method: "POST" });
}

describe("POST /conversations/:id/escalate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnifiedAuthContext = createVisitorAuthContext();
    mockIsParticipant.mockResolvedValue(true);
    mockMapServiceError.mockReturnValue(null);
  });

  it("escalates an AI-handled conversation via the shared escalation path", async () => {
    mockGetConversationWithParticipants
      .mockResolvedValueOnce(aiConversation())
      .mockResolvedValueOnce(
        aiConversation({
          handledBy: "human",
          escalationReason: "human_requested",
        }),
      );

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockEscalateConversation).toHaveBeenCalledTimes(1);
    expect(mockEscalateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "human_requested",
        reason: "human_requested",
      }),
    );
    const body = (await res.json()) as { conversation: { handledBy: string } };
    expect(body.conversation.handledBy).toBe("human");
  });

  it("is idempotent — a second call on an already human-handled chat is a no-op success", async () => {
    mockGetConversationWithParticipants.mockResolvedValueOnce(
      aiConversation({ handledBy: "human", status: "pending" }),
    );

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockEscalateConversation).not.toHaveBeenCalled();
  });

  it("returns 409 for a closed conversation", async () => {
    mockGetConversationWithParticipants.mockResolvedValueOnce(
      aiConversation({ status: "closed" }),
    );

    const res = await post();

    expect(res.status).toBe(409);
    expect(mockEscalateConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when the visitor is not a participant", async () => {
    mockIsParticipant.mockResolvedValue(false);

    const res = await post();

    expect(res.status).toBe(404);
    expect(mockGetConversationWithParticipants).not.toHaveBeenCalled();
    expect(mockEscalateConversation).not.toHaveBeenCalled();
  });

  it("allows a staff member to escalate an AI chat in their org", async () => {
    mockUnifiedAuthContext = createMemberAuthContext("operator");
    mockGetConversationWithParticipants
      .mockResolvedValueOnce(aiConversation())
      .mockResolvedValueOnce(aiConversation({ handledBy: "human" }));

    const res = await post();

    expect(res.status).toBe(200);
    // Members are not participant-gated; the org scope is enforced by the load.
    expect(mockIsParticipant).not.toHaveBeenCalled();
    expect(mockEscalateConversation).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without auth", async () => {
    mockUnifiedAuthContext = null;
    const res = await post();
    expect(res.status).toBe(401);
  });
});
