import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const VISITOR_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VISITOR_USER_ID = "visitor-user-001";
const MEMBER_USER_ID = "member-user-001";
const ORG_ID = "org-001";
const APP_ID = "app-001";
const CONV_ID = "conv-001";

const mockAcceptConversation = vi.fn();
const mockLeaveConversation = vi.fn();
const mockResolveConversation = vi.fn();
const mockSoftDeleteConversation = vi.fn();
const mockUpdateConversationSubject = vi.fn();
const mockAddParticipant = vi.fn();

vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: vi.fn(),
  getConversationWithParticipants: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  markAsRead: vi.fn(),
  getUnreadCountForVisitor: vi.fn(),
  getUnreadCount: vi.fn(),
  isParticipant: vi.fn(),
  listConversationsForVisitor: vi.fn(),
  getMessageHistory: vi.fn(),
  getBulkUnreadCounts: vi.fn(),
  acceptConversation: (...args: unknown[]) => mockAcceptConversation(...args),
  leaveConversation: (...args: unknown[]) => mockLeaveConversation(...args),
  resolveConversation: (...args: unknown[]) =>
    mockResolveConversation(...args),
  softDeleteConversation: (...args: unknown[]) =>
    mockSoftDeleteConversation(...args),
  updateConversationSubject: (...args: unknown[]) =>
    mockUpdateConversationSubject(...args),
  addParticipant: (...args: unknown[]) => mockAddParticipant(...args),
  ConversationNotFoundError: class extends Error {},
  ConversationNotActiveError: class extends Error {},
  MessageNotFoundError: class extends Error {},
  NotMessageSenderError: class extends Error {},
  MessageEditWindowExpiredError: class extends Error {},
}));

vi.mock("../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: vi.fn().mockReturnValue(null),
}));

vi.mock("../../features/chat/broadcasting.service.js", () => ({
  broadcastRoomEvent: vi.fn(),
  buildMessageEditedEvent: vi.fn().mockReturnValue({ type: "message:edited" }),
  buildMessageDeletedEvent: vi
    .fn()
    .mockReturnValue({ type: "message:deleted" }),
}));

vi.mock("../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../../db/schema/conversations.js", () => ({
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
vi.mock("../../db/schema/messages.js", () => ({
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
vi.mock("../../db/schema/conversationParticipants.js", () => ({
  conversationParticipants: {
    conversationId: "conversationId",
    userId: "userId",
    role: "role",
  },
}));
vi.mock("../../db/schema/users.js", () => ({
  user: { id: "id", name: "name" },
}));

let mockUnifiedAuthContext: unknown = null;

vi.mock("../../lib/middleware/unifiedAuth.js", () => ({
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

vi.mock("../../lib/middleware/auth.js", () => ({
  requireTenantAuth: () => async (c: any, next: () => Promise<void>) => {
    const ctx = mockUnifiedAuthContext as Record<string, unknown> | null;
    if (!ctx || ctx.type !== "member") {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("auth", mockUnifiedAuthContext);
    c.set("unifiedAuth", mockUnifiedAuthContext);
    await next();
  },
  getTenantAuth: (c: any) => c.get("auth"),
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock("../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: any, next: () => Promise<void>) =>
    next(),
}));

vi.mock("../../lib/middleware/rateLimit.js", () => ({
  createTenantRateLimitMiddleware: () =>
    async (_c: any, next: () => Promise<void>) => next(),
}));

const { conversationsRoute } = await import("../conversations.js");

const app = new Hono().route("/conversations", conversationsRoute);

function memberAuth(role: "operator" | "admin" | "super_admin" = "operator") {
  return {
    type: "member" as const,
    session: {},
    user: { id: MEMBER_USER_ID, name: "Test Member" },
    organization: { id: ORG_ID, name: "Test Org", slug: "test-org" },
    membership: {
      id: "mem-001",
      role,
      userId: MEMBER_USER_ID,
      organizationId: ORG_ID,
    },
  };
}

function visitorAuth() {
  return {
    type: "visitor" as const,
    visitorId: VISITOR_ID,
    visitorUserId: VISITOR_USER_ID,
    application: {
      id: APP_ID,
      organizationId: ORG_ID,
      domain: "example.com",
      allowedOrigins: ["https://example.com"],
    },
    apiKey: { id: "key-001", environment: "live" as const },
  };
}

describe("Member-only conversation endpoints reject visitors with 403", () => {
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

    it("succeeds for admin member auth", async () => {
      mockUnifiedAuthContext = memberAuth("admin");
      mockSoftDeleteConversation.mockResolvedValue({ id: CONV_ID });

      const res = await app.request(`/conversations/${CONV_ID}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
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
    });
  });
});
