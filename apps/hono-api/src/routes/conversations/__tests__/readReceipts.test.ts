import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  TEST_IDS,
  createMemberAuthContext,
  createVisitorAuthContext,
} from "../../__tests__/factories.js";

const { CONV_ID, MSG_ID, VISITOR_USER_ID, MEMBER_USER_ID } = TEST_IDS;

const mockMarkAsRead = vi.fn();
const mockIsParticipant = vi.fn();
const mockGetUnreadCountForVisitor = vi.fn();
const mockGetUnreadCount = vi.fn();

vi.mock("../../../features/chat/chat.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../features/chat/chat.service.js")
    >();
  return {
    ...actual,
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
    isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
    getUnreadCountForVisitor: (...args: unknown[]) =>
      mockGetUnreadCountForVisitor(...args),
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
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

vi.mock("../../../lib/middleware/unifiedRateLimit.js", () => ({
  createUnifiedRateLimitMiddleware:
    () => async (_c: any, next: () => Promise<void>) =>
      next(),
}));

const { readReceiptsRoute } = await import("../readReceipts.js");

const app = new Hono().route("/conversations", readReceiptsRoute);

const memberAuth = (role: "operator" | "admin" | "super_admin" = "operator") =>
  createMemberAuthContext(role);
const visitorAuth = createVisitorAuthContext;

describe("Read receipts endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnifiedAuthContext = null;
  });

  describe("POST /conversations/:id/read", () => {
    it("marks as read for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockMarkAsRead.mockResolvedValue(undefined);

      const res = await app.request(`/conversations/${CONV_ID}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: MSG_ID }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockMarkAsRead).toHaveBeenCalledWith(
        CONV_ID,
        MEMBER_USER_ID,
        MSG_ID,
      );
    });

    it("marks as read for visitor auth when participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockMarkAsRead.mockResolvedValue(undefined);

      const res = await app.request(`/conversations/${CONV_ID}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: MSG_ID }),
      });

      expect(res.status).toBe(200);
      expect(mockMarkAsRead).toHaveBeenCalledWith(
        CONV_ID,
        VISITOR_USER_ID,
        MSG_ID,
      );
    });

    it("returns 404 for visitor who is not a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: MSG_ID }),
      });

      expect(res.status).toBe(404);
    });

    it("rejects invalid messageId", async () => {
      mockUnifiedAuthContext = memberAuth();

      const res = await app.request(`/conversations/${CONV_ID}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: "not-a-uuid" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await app.request(`/conversations/${CONV_ID}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: MSG_ID }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /conversations/:id/unread", () => {
    it("returns unread count for member auth", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockGetUnreadCount.mockResolvedValue(5);

      const res = await app.request(`/conversations/${CONV_ID}/unread`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unreadCount).toBe(5);
      expect(mockGetUnreadCount).toHaveBeenCalledWith(CONV_ID, MEMBER_USER_ID);
    });

    it("returns unread count for visitor auth when participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockGetUnreadCountForVisitor.mockResolvedValue(3);

      const res = await app.request(`/conversations/${CONV_ID}/unread`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unreadCount).toBe(3);
      expect(mockGetUnreadCountForVisitor).toHaveBeenCalledWith(
        CONV_ID,
        VISITOR_USER_ID,
      );
    });

    it("returns 404 for visitor who is not a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}/unread`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for member who is not a participant", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}/unread`);

      expect(res.status).toBe(404);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await app.request(`/conversations/${CONV_ID}/unread`);

      expect(res.status).toBe(401);
    });
  });
});
