import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  TEST_IDS,
  createMemberAuthContext,
  createVisitorAuthContext,
} from "../../__tests__/factories.js";

const { VISITOR_USER_ID, MEMBER_USER_ID, ORG_ID, APP_ID, CONV_ID } = TEST_IDS;

const mockListConversationsForVisitor = vi.fn();
const mockListConversationsForMember = vi.fn();
const mockGetConversationWithParticipants = vi.fn();
const mockGetMessageHistory = vi.fn();
const mockGetMessageHistoryForMember = vi.fn();
const mockIsParticipant = vi.fn();

vi.mock("../../../features/chat/chat.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../features/chat/chat.service.js")
    >();
  return {
    ...actual,
    listConversationsForVisitor: (...args: unknown[]) =>
      mockListConversationsForVisitor(...args),
    listConversationsForMember: (...args: unknown[]) =>
      mockListConversationsForMember(...args),
    getConversationWithParticipants: (...args: unknown[]) =>
      mockGetConversationWithParticipants(...args),
    getMessageHistory: (...args: unknown[]) => mockGetMessageHistory(...args),
    getMessageHistoryForMember: (...args: unknown[]) =>
      mockGetMessageHistoryForMember(...args),
    isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
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
  createUnifiedRateLimitMiddleware: () =>
    async (_c: any, next: () => Promise<void>) => next(),
}));

const { queriesRoute } = await import("../queries.js");

const app = new Hono().route("/conversations", queriesRoute);

const memberAuth = createMemberAuthContext;
const visitorAuth = createVisitorAuthContext;

describe("Conversations query endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnifiedAuthContext = null;
  });

  describe("GET /conversations (list)", () => {
    it("returns visitor's own conversations scoped by participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockListConversationsForVisitor.mockResolvedValue({
        conversations: [
          {
            id: CONV_ID,
            status: "active",
            subject: "Help",
            createdAt: "2025-01-01",
            updatedAt: "2025-01-01",
          },
        ],
        total: 1,
      });

      const res = await app.request("/conversations");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(mockListConversationsForVisitor).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: APP_ID,
          organizationId: ORG_ID,
          visitorUserId: VISITOR_USER_ID,
        }),
      );
    });

    it("returns member conversations with admin visibility (all)", async () => {
      mockUnifiedAuthContext = memberAuth("admin");
      mockListConversationsForMember.mockResolvedValue({
        conversations: [
          {
            id: "c1",
            assignedTo: null,
            status: "pending",
            unreadCount: 0,
          },
          {
            id: "c2",
            assignedTo: MEMBER_USER_ID,
            status: "active",
            unreadCount: 0,
          },
        ],
        total: 2,
      });

      const res = await app.request("/conversations");

      expect(res.status).toBe(200);
      expect(mockListConversationsForVisitor).not.toHaveBeenCalled();
      expect(mockListConversationsForMember).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, isAdmin: true }),
      );
    });

    it("returns member conversations with operator visibility (pending + own)", async () => {
      mockUnifiedAuthContext = memberAuth("operator");
      mockListConversationsForMember.mockResolvedValue({
        conversations: [
          {
            id: "c1",
            assignedTo: MEMBER_USER_ID,
            status: "active",
            unreadCount: 3,
          },
        ],
        total: 1,
      });

      const res = await app.request("/conversations");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations[0].unreadCount).toBe(3);
      expect(mockListConversationsForMember).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, isAdmin: false }),
      );
    });

    it("cross-visitor isolation: visitor cannot see another visitor's conversations", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockListConversationsForVisitor.mockResolvedValue({
        conversations: [],
        total: 0,
      });

      const res = await app.request("/conversations");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toHaveLength(0);
      expect(mockListConversationsForVisitor).toHaveBeenCalledWith(
        expect.objectContaining({ visitorUserId: VISITOR_USER_ID }),
      );
    });
  });

  describe("GET /conversations/:id", () => {
    it("returns conversation for visitor who is a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockGetConversationWithParticipants.mockResolvedValue({
        id: CONV_ID,
        status: "active",
        subject: "Help",
        participants: [{ userId: VISITOR_USER_ID, role: "visitor" }],
      });

      const res = await app.request(`/conversations/${CONV_ID}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation.id).toBe(CONV_ID);
      expect(mockIsParticipant).toHaveBeenCalledWith(CONV_ID, VISITOR_USER_ID);
    });

    it("returns 404 for visitor who is NOT a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}`);

      expect(res.status).toBe(404);
    });

    it("returns conversation for member via org membership", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockGetConversationWithParticipants.mockResolvedValue({
        id: CONV_ID,
        status: "active",
        subject: "Help",
        participants: [],
      });

      const res = await app.request(`/conversations/${CONV_ID}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation.id).toBe(CONV_ID);
      expect(mockIsParticipant).not.toHaveBeenCalled();
    });

    it("returns 404 for member when conversation not in org", async () => {
      const { ConversationNotFoundError } = await import(
        "../../../features/chat/chat.service.js"
      );
      mockUnifiedAuthContext = memberAuth();
      mockGetConversationWithParticipants.mockRejectedValue(
        new ConversationNotFoundError(CONV_ID),
      );
      mockMapServiceError.mockImplementationOnce((c: any) =>
        c.json({ error: "not_found" }, 404),
      );

      const res = await app.request(`/conversations/${CONV_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /conversations/:id/messages", () => {
    const fakeMessages = [
      {
        id: "msg-1",
        conversationId: CONV_ID,
        senderId: VISITOR_USER_ID,
        senderName: "Visitor",
        senderRole: "visitor",
        type: "text",
        content: "Hello",
        createdAt: "2025-01-01",
      },
    ];

    it("returns messages for visitor who is a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockGetMessageHistory.mockResolvedValue(fakeMessages);

      const res = await app.request(`/conversations/${CONV_ID}/messages`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.messages).toHaveLength(1);
      expect(mockIsParticipant).toHaveBeenCalledWith(CONV_ID, VISITOR_USER_ID);
    });

    it("returns 404 for visitor who is NOT a participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}/messages`);

      expect(res.status).toBe(404);
    });

    it("returns messages for member via org membership", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockGetMessageHistoryForMember.mockResolvedValue(fakeMessages);

      const res = await app.request(`/conversations/${CONV_ID}/messages`);

      expect(res.status).toBe(200);
      expect(mockGetMessageHistoryForMember).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV_ID,
          organizationId: ORG_ID,
        }),
      );
      expect(mockIsParticipant).not.toHaveBeenCalled();
    });
  });
});
