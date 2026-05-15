import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  TEST_IDS,
  createMemberAuthContext,
  createVisitorAuthContext,
} from "../../__tests__/factories.js";

const { CONV_ID } = TEST_IDS;

const mockAcceptConversation = vi.fn();
const mockLeaveConversation = vi.fn();
const mockResolveConversation = vi.fn();
const mockSoftDeleteConversation = vi.fn();
const mockUpdateConversationSubject = vi.fn();
const mockAddParticipant = vi.fn();

vi.mock("../../../features/chat/chat.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../features/chat/chat.service.js")
    >();
  return {
    ...actual,
    acceptConversation: (...args: unknown[]) =>
      mockAcceptConversation(...args),
    leaveConversation: (...args: unknown[]) => mockLeaveConversation(...args),
    resolveConversation: (...args: unknown[]) =>
      mockResolveConversation(...args),
    softDeleteConversation: (...args: unknown[]) =>
      mockSoftDeleteConversation(...args),
    updateConversationSubject: (...args: unknown[]) =>
      mockUpdateConversationSubject(...args),
    addParticipant: (...args: unknown[]) => mockAddParticipant(...args),
  };
});

const mockMapServiceError = vi.fn().mockReturnValue(null);
vi.mock("../../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: (...args: unknown[]) =>
    mockMapServiceError(...args),
}));

vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../../../db/schema/conversations.js", () => ({
  conversations: {
    id: "id",
    organizationId: "organizationId",
    applicationId: "applicationId",
    status: "status",
    assignedTo: "assignedTo",
    updatedAt: "updatedAt",
    deletedAt: "deletedAt",
  },
}));
vi.mock("../../../db/schema/messages.js", () => ({
  messages: {
    id: "id",
    conversationId: "conversationId",
    senderId: "senderId",
    type: "type",
    content: "content",
    createdAt: "createdAt",
    deletedAt: "deletedAt",
  },
}));
vi.mock("../../../db/schema/conversationParticipants.js", () => ({
  conversationParticipants: {
    conversationId: "conversationId",
    userId: "userId",
    role: "role",
  },
}));
vi.mock("../../../db/schema/users.js", () => ({
  user: { id: "id", name: "name" },
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
  requireMember: () => async (c: any, next: () => Promise<void>) => {
    const auth = c.get("unifiedAuth");
    if (auth?.type !== "member") {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  },
}));

vi.mock("../../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: any, next: () => Promise<void>) =>
    next(),
}));

vi.mock("../../../lib/middleware/unifiedRateLimit.js", () => ({
  createUnifiedRateLimitMiddleware: () =>
    async (_c: any, next: () => Promise<void>) => next(),
}));

const { lifecycleRoute } = await import("../lifecycle.js");

const app = new Hono().route("/conversations", lifecycleRoute);

const memberAuth = (role: "operator" | "admin" | "super_admin" = "operator") =>
  createMemberAuthContext(role);
const visitorAuth = createVisitorAuthContext;

describe("Lifecycle endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnifiedAuthContext = null;
  });

  describe("POST /conversations/:id/accept", () => {
    it("returns 403 for visitor auth", async () => {
      mockUnifiedAuthContext = visitorAuth();

      const res = await app.request(`/conversations/${CONV_ID}/accept`, {
        method: "POST",
      });

      expect(res.status).toBe(403);
    });

    it("succeeds for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockAcceptConversation.mockResolvedValue({
        id: CONV_ID,
        status: "active",
      });

      const res = await app.request(`/conversations/${CONV_ID}/accept`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation).toEqual({ id: CONV_ID, status: "active" });
    });

    it("calls addParticipant after accepting", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockAcceptConversation.mockResolvedValue({
        id: CONV_ID,
        status: "active",
      });

      await app.request(`/conversations/${CONV_ID}/accept`, {
        method: "POST",
      });

      expect(mockAddParticipant).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        userId: TEST_IDS.MEMBER_USER_ID,
        role: "operator",
      });
    });

    it("delegates service errors to error mapper", async () => {
      mockUnifiedAuthContext = memberAuth();
      const error = new Error("service error");
      mockAcceptConversation.mockRejectedValue(error);
      mockMapServiceError.mockReturnValue(
        new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
      );

      const res = await app.request(`/conversations/${CONV_ID}/accept`, {
        method: "POST",
      });

      expect(res.status).toBe(404);
      expect(mockMapServiceError).toHaveBeenCalled();
    });
  });

  describe("POST /conversations/:id/leave", () => {
    it("returns 403 for visitor auth", async () => {
      mockUnifiedAuthContext = visitorAuth();

      const res = await app.request(`/conversations/${CONV_ID}/leave`, {
        method: "POST",
      });

      expect(res.status).toBe(403);
    });

    it("succeeds for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockLeaveConversation.mockResolvedValue({
        id: CONV_ID,
        status: "pending",
      });

      const res = await app.request(`/conversations/${CONV_ID}/leave`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation).toEqual({ id: CONV_ID, status: "pending" });
    });
  });

  describe("POST /conversations/:id/resolve", () => {
    it("returns 403 for visitor auth", async () => {
      mockUnifiedAuthContext = visitorAuth();

      const res = await app.request(`/conversations/${CONV_ID}/resolve`, {
        method: "POST",
      });

      expect(res.status).toBe(403);
    });

    it("succeeds for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockResolveConversation.mockResolvedValue({
        id: CONV_ID,
        status: "closed",
      });

      const res = await app.request(`/conversations/${CONV_ID}/resolve`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation).toEqual({ id: CONV_ID, status: "closed" });
    });
  });

  describe("PATCH /conversations/:id/subject", () => {
    it("returns 403 for visitor auth", async () => {
      mockUnifiedAuthContext = visitorAuth();

      const res = await app.request(`/conversations/${CONV_ID}/subject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "New Subject" }),
      });

      expect(res.status).toBe(403);
    });

    it("succeeds for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockUpdateConversationSubject.mockResolvedValue({
        id: CONV_ID,
        subject: "New Subject",
      });

      const res = await app.request(`/conversations/${CONV_ID}/subject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "New Subject" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation.subject).toBe("New Subject");
    });

    it("rejects invalid subject (empty string)", async () => {
      mockUnifiedAuthContext = memberAuth();

      const res = await app.request(`/conversations/${CONV_ID}/subject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /conversations/:id", () => {
    it("returns 403 for visitor auth", async () => {
      mockUnifiedAuthContext = visitorAuth();

      const res = await app.request(`/conversations/${CONV_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
    });

    it("returns 403 for operator (non-admin)", async () => {
      mockUnifiedAuthContext = memberAuth("operator");

      const res = await app.request(`/conversations/${CONV_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
    });

    it("succeeds for admin member auth", async () => {
      mockUnifiedAuthContext = memberAuth("admin");
      mockSoftDeleteConversation.mockResolvedValue({ id: CONV_ID });

      const res = await app.request(`/conversations/${CONV_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
    });

    it("succeeds for super_admin member auth", async () => {
      mockUnifiedAuthContext = memberAuth("super_admin");
      mockSoftDeleteConversation.mockResolvedValue({ id: CONV_ID });

      const res = await app.request(`/conversations/${CONV_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
    });
  });
});
