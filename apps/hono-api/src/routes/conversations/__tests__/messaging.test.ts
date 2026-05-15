import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  TEST_IDS,
  createMemberAuthContext,
  createVisitorAuthContext,
} from "../../__tests__/factories.js";

const { VISITOR_USER_ID, MEMBER_USER_ID, ORG_ID, APP_ID, CONV_ID, MSG_ID } =
  TEST_IDS;

const mockCreateConversation = vi.fn();
const mockGetConversationWithParticipants = vi.fn();
const mockSendMessage = vi.fn();
const mockEditMessage = vi.fn();
const mockDeleteMessage = vi.fn();
const mockIsParticipant = vi.fn();

vi.mock("../../../features/chat/chat.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../features/chat/chat.service.js")
    >();
  return {
    ...actual,
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    getConversationWithParticipants: (...args: unknown[]) =>
      mockGetConversationWithParticipants(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
  };
});

const mockMapServiceError = vi.fn().mockReturnValue(null);
vi.mock("../../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: (...args: unknown[]) =>
    mockMapServiceError(...args),
}));

vi.mock("../../../features/chat/broadcasting.service.js", () => ({
  broadcastRoomEvent: vi.fn(),
  buildMessageEditedEvent: vi.fn().mockReturnValue({ type: "message:edited" }),
  buildMessageDeletedEvent: vi
    .fn()
    .mockReturnValue({ type: "message:deleted" }),
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

const { messagingRoute } = await import("../messaging.js");

const app = new Hono().route("/conversations", messagingRoute);

const memberAuth = createMemberAuthContext;
const visitorAuth = createVisitorAuthContext;

describe("Conversations messaging endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnifiedAuthContext = null;
  });

  describe("POST /conversations (create)", () => {
    it("visitor creates a conversation scoped to their application", async () => {
      mockUnifiedAuthContext = visitorAuth();
      const fakeConversation = { id: CONV_ID, status: "pending" };
      mockCreateConversation.mockResolvedValue(fakeConversation);
      mockGetConversationWithParticipants.mockResolvedValue({
        id: CONV_ID,
        status: "pending",
        subject: null,
        participants: [{ userId: VISITOR_USER_ID, role: "visitor" }],
      });

      const res = await app.request("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "Need help" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.conversation.id).toBe(CONV_ID);
      expect(mockCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          applicationId: APP_ID,
          createdBy: VISITOR_USER_ID,
          participants: [{ userId: VISITOR_USER_ID, role: "visitor" }],
        }),
      );
    });

    it("returns 401 without auth", async () => {
      const res = await app.request("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /conversations/:id/messages (send)", () => {
    it("visitor sends a message as participant", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      const fakeMessage = {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: VISITOR_USER_ID,
        content: "Hello",
        editedAt: null,
        createdAt: "2025-01-01",
      };
      mockSendMessage.mockResolvedValue(fakeMessage);

      const res = await app.request(`/conversations/${CONV_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message.id).toBe(MSG_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV_ID,
          senderId: VISITOR_USER_ID,
          content: "Hello",
        }),
      );
    });

    it("member sends a message", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockIsParticipant.mockResolvedValue(true);
      const fakeMessage = {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: MEMBER_USER_ID,
        content: "Hi there",
        editedAt: null,
        createdAt: "2025-01-01",
      };
      mockSendMessage.mockResolvedValue(fakeMessage);

      const res = await app.request(`/conversations/${CONV_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi there" }),
      });

      expect(res.status).toBe(201);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          senderId: MEMBER_USER_ID,
          broadcastContext: expect.objectContaining({
            senderName: "Test Member",
          }),
        }),
      );
    });

    it("rejects non-participant visitor", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/conversations/${CONV_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /conversations/:id/messages/:messageId (edit)", () => {
    it("visitor edits their own message", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      const fakeMessage = {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: VISITOR_USER_ID,
        content: "Updated",
        editedAt: "2025-01-01T00:01:00Z",
        createdAt: "2025-01-01",
      };
      mockEditMessage.mockResolvedValue(fakeMessage);

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated" }),
        },
      );

      expect(res.status).toBe(200);
      expect(mockEditMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: MSG_ID,
          conversationId: CONV_ID,
          senderId: VISITOR_USER_ID,
          content: "Updated",
        }),
      );
    });

    it("member edits their own message", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockIsParticipant.mockResolvedValue(true);
      const fakeMessage = {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: MEMBER_USER_ID,
        content: "Fixed typo",
        editedAt: "2025-01-01T00:01:00Z",
        createdAt: "2025-01-01",
      };
      mockEditMessage.mockResolvedValue(fakeMessage);

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Fixed typo" }),
        },
      );

      expect(res.status).toBe(200);
      expect(mockEditMessage).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: MEMBER_USER_ID }),
      );
    });

    it("rejects non-participant visitor", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated" }),
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /conversations/:id/messages/:messageId", () => {
    it("visitor deletes their own message", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockDeleteMessage.mockResolvedValue({ id: MSG_ID });

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(200);
      expect(mockDeleteMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: MSG_ID,
          conversationId: CONV_ID,
          senderId: VISITOR_USER_ID,
        }),
      );
    });

    it("member deletes their own message", async () => {
      mockUnifiedAuthContext = memberAuth();
      mockIsParticipant.mockResolvedValue(true);
      mockDeleteMessage.mockResolvedValue({ id: MSG_ID });

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(200);
      expect(mockDeleteMessage).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: MEMBER_USER_ID }),
      );
    });

    it("rejects non-participant visitor", async () => {
      mockUnifiedAuthContext = visitorAuth();
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(
        `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(404);
    });
  });
});
