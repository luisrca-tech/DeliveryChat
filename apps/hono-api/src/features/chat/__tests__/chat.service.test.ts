import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../broadcasting.service.js", () => ({
  broadcastOrganizationEvent: vi.fn(),
  broadcastRoomEvent: vi.fn(),
  buildConversationNewEvent: vi.fn((p: unknown) => ({
    type: "conversation:new",
    payload: p,
  })),
  buildConversationAcceptedEvent: vi.fn((p: unknown) => ({
    type: "conversation:accepted",
    payload: p,
  })),
  buildConversationReleasedEvent: vi.fn((p: unknown) => ({
    type: "conversation:released",
    payload: p,
  })),
  buildConversationResolvedEvent: vi.fn((p: unknown) => ({
    type: "conversation:resolved",
    payload: p,
  })),
  buildMessageNewEvent: vi.fn((p: unknown) => ({
    type: "message:new",
    payload: p,
  })),
}));

const { db } = await import("../../../db/index.js");

const mockSelect = db.select as ReturnType<typeof vi.fn>;
const mockInsert = db.insert as ReturnType<typeof vi.fn>;
const mockUpdate = db.update as ReturnType<typeof vi.fn>;
const mockTransaction = db.transaction as ReturnType<typeof vi.fn>;

const broadcasting = await import("../broadcasting.service.js");
const mockBroadcastOrganizationEvent =
  broadcasting.broadcastOrganizationEvent as ReturnType<typeof vi.fn>;
const mockBroadcastRoomEvent = broadcasting.broadcastRoomEvent as ReturnType<
  typeof vi.fn
>;

/**
 * Creates a chainable mock that mimics Drizzle's query builder.
 * Drizzle queries are "thenable" — awaiting them triggers .then() on the chain.
 */
function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "groupBy",
    "limit",
    "offset",
    "values",
    "set",
  ];

  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }

  chain.returning = vi.fn(() => Promise.resolve(result));

  // Make the chain itself thenable (for queries without .returning())
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);

  return chain;
}

const {
  createConversation,
  sendMessage,
  getMessageHistory,
  addParticipant,
  getConversationWithParticipants,
  closeConversation,
  acceptConversation,
  leaveConversation,
  resolveConversation,
  softDeleteConversation,
  updateConversationSubject,
  validateSendAuthorization,
  editMessage,
  deleteMessage,
  getUnreadCount,
  getUnreadCountForVisitor,
  getBulkUnreadCounts,
  markAsRead,
  listConversationsForVisitor,
  listConversationsForMember,
  getMessageHistoryForMember,
  createSystemMessage,
  ConversationNotFoundError,
  ConversationNotActiveError,
  NotAssignedToConversationError,
  MessageNotFoundError,
  NotMessageSenderError,
  MessageEditWindowExpiredError,
} = await import("../chat.service.js");

describe("chat.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createConversation", () => {
    it("creates a support conversation with applicationId", async () => {
      const conversationRow = {
        id: "conv-1",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "active" as const,
        subject: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        closedAt: null,
      };

      mockTransaction.mockImplementation(async (fn: Function) => {
        const insertConvChain = chainMock([conversationRow]);
        const insertPartChain = chainMock([{}]);
        let callCount = 0;
        const tx = {
          insert: vi.fn(() => {
            callCount++;
            return callCount === 1 ? insertConvChain : insertPartChain;
          }),
        };
        return fn(tx);
      });

      const result = await createConversation({
        organizationId: "org-1",
        applicationId: "app-1",
        participants: [
          { userId: "user-1", role: "visitor" as const },
          { userId: "user-2", role: "operator" as const },
        ],
      });

      expect(result).toEqual(conversationRow);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("creates conversation without applicationId", async () => {
      const conversationRow = {
        id: "conv-2",
        organizationId: "org-1",
        applicationId: null,
        status: "active" as const,
        subject: "Team sync",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        closedAt: null,
      };

      mockTransaction.mockImplementation(async (fn: Function) => {
        const insertConvChain = chainMock([conversationRow]);
        const insertPartChain = chainMock([{}]);
        let callCount = 0;
        const tx = {
          insert: vi.fn(() => {
            callCount++;
            return callCount === 1 ? insertConvChain : insertPartChain;
          }),
        };
        return fn(tx);
      });

      const result = await createConversation({
        organizationId: "org-1",
        subject: "Team sync",
        participants: [
          { userId: "user-1", role: "operator" as const },
          { userId: "user-2", role: "admin" as const },
        ],
      });

      expect(result).toEqual(conversationRow);
    });
  });

  describe("sendMessage", () => {
    const messageRow = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "text" as const,
      content: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };

    function mockSendTransaction(txInsertResult: unknown) {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const insertChain = chainMock(txInsertResult);
        const updateChain = chainMock([{}]);
        const tx = {
          insert: vi.fn(() => insertChain),
          update: vi.fn(() => updateChain),
        };
        return fn(tx);
      });
    }

    it("inserts a message, bumps updatedAt, and returns the full row", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendTransaction([messageRow]);

      const result = await sendMessage({
        conversationId: "conv-1",
        senderId: "user-1",
        content: "Hello",
      });

      expect(result).toEqual(messageRow);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("rejects sending to a closed conversation", async () => {
      const selectChain = chainMock([
        { status: "closed", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        sendMessage({
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Hello",
        }),
      ).rejects.toThrow(ConversationNotActiveError);
    });

    it("rejects sending to a non-existent conversation", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        sendMessage({
          conversationId: "conv-999",
          senderId: "user-1",
          content: "Hello",
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it("skips SELECT when conversationData is provided", async () => {
      mockSendTransaction([messageRow]);

      const result = await sendMessage(
        {
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Hello",
        },
        { status: "active", assignedTo: "user-1", organizationId: "org-1" },
      );

      expect(result).toEqual(messageRow);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("rejects sending when pre-fetched conversationData has closed status", async () => {
      await expect(
        sendMessage(
          {
            conversationId: "conv-1",
            senderId: "user-1",
            content: "Hello",
          },
          { status: "closed", assignedTo: "user-1", organizationId: "org-1" },
        ),
      ).rejects.toThrow(ConversationNotActiveError);
    });

    it("runs INSERT and updatedAt bump inside a transaction", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendTransaction([messageRow]);

      await sendMessage({
        conversationId: "conv-1",
        senderId: "user-1",
        content: "Hello",
      });

      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe("getMessageHistory", () => {
    it("returns paginated messages ordered by createdAt", async () => {
      const msgs = [
        { id: "msg-1", content: "Hello", createdAt: "2026-01-01T00:00:00Z" },
        { id: "msg-2", content: "Hi", createdAt: "2026-01-01T00:01:00Z" },
      ];

      const selectChain = chainMock(msgs);
      mockSelect.mockReturnValueOnce(selectChain);

      const result = await getMessageHistory({
        conversationId: "conv-1",
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual(msgs);
    });
  });

  describe("addParticipant", () => {
    it("adds a participant to a conversation", async () => {
      const participantRow = {
        id: "part-1",
        conversationId: "conv-1",
        userId: "user-3",
        role: "admin" as const,
        joinedAt: "2026-01-01T00:00:00Z",
        leftAt: null,
        lastReadMessageId: null,
      };

      const insertChain = chainMock([participantRow]);
      mockInsert.mockReturnValueOnce(insertChain);

      const result = await addParticipant({
        conversationId: "conv-1",
        userId: "user-3",
        role: "admin" as const,
      });

      expect(result).toEqual(participantRow);
    });
  });

  describe("closeConversation", () => {
    it("sets status to closed and closedAt timestamp", async () => {
      const updatedRow = {
        id: "conv-1",
        status: "closed" as const,
        closedAt: "2026-01-01T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await closeConversation("conv-1", "org-1");

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("throws ConversationUpdateFailedError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(closeConversation("conv-999", "org-1")).rejects.toThrow(
        "Failed to close conversation conv-999",
      );
    });
  });

  describe("getConversationWithParticipants", () => {
    it("returns conversation with participants", async () => {
      const conversationData = {
        id: "conv-1",
        organizationId: "org-1",
        status: "active" as const,
      };
      const participantsData = [
        { userId: "user-1", role: "visitor" as const },
        { userId: "user-2", role: "operator" as const },
      ];

      const selectChain1 = chainMock([conversationData]);
      const selectChain2 = chainMock(participantsData);

      mockSelect
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await getConversationWithParticipants("conv-1", "org-1");

      expect(result).toEqual({
        ...conversationData,
        participants: participantsData,
      });
    });

    it("throws ConversationNotFoundError for non-existent conversation", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        getConversationWithParticipants("conv-999", "org-1"),
      ).rejects.toThrow("Conversation not found: conv-999");
    });
  });

  describe("acceptConversation", () => {
    const systemMsgRow = {
      id: "sys-1",
      conversationId: "conv-1",
      senderId: null,
      type: "system",
      content: "Alice joined the conversation",
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("assigns the operator and sets status to active (race-condition safe)", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "active" as const,
        assignedTo: "operator-1",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      const result = await acceptConversation(
        "conv-1",
        "org-1",
        "operator-1",
        "Alice",
      );

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("broadcasts lifecycle and system message events on success", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "active" as const,
        assignedTo: "operator-1",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockUpdate.mockReturnValueOnce(chainMock([updatedRow]));
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      await acceptConversation("conv-1", "org-1", "operator-1", "Alice");

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledTimes(2);
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "conversation:accepted" }),
      );
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "message:new" }),
      );
    });

    it("throws ConversationAlreadyAssignedError when conversation is already accepted (race condition lost)", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        acceptConversation("conv-1", "org-1", "operator-2", "Bob"),
      ).rejects.toThrow(
        "Conversation conv-1 is already assigned or no longer pending",
      );
      expect(mockBroadcastOrganizationEvent).not.toHaveBeenCalled();
    });

    it("throws ConversationAlreadyAssignedError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        acceptConversation("conv-999", "org-1", "operator-1", "Alice"),
      ).rejects.toThrow(
        "Conversation conv-999 is already assigned or no longer pending",
      );
    });

    it("does not throw when broadcast fails", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "active" as const,
        assignedTo: "operator-1",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockUpdate.mockReturnValueOnce(chainMock([updatedRow]));
      mockBroadcastOrganizationEvent.mockImplementation(() => {
        throw new Error("broadcast failed");
      });
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      await expect(
        acceptConversation("conv-1", "org-1", "operator-1", "Alice"),
      ).resolves.not.toThrow();
    });
  });

  describe("leaveConversation", () => {
    const systemMsgRow = {
      id: "sys-2",
      conversationId: "conv-1",
      senderId: null,
      type: "system",
      content:
        "Alice left the conversation you'll be able to chat with them again soon",
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("unassigns operator and sets status back to pending", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "pending" as const,
        assignedTo: null,
        updatedAt: "2026-01-01T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      const result = await leaveConversation(
        "conv-1",
        "org-1",
        "operator-1",
        "Alice",
      );

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("broadcasts lifecycle and system message events on success", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "pending" as const,
        assignedTo: null,
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockUpdate.mockReturnValueOnce(chainMock([updatedRow]));
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      await leaveConversation("conv-1", "org-1", "operator-1", "Alice");

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledTimes(2);
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "conversation:released" }),
      );
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "message:new" }),
      );
    });

    it("throws ConversationNotAssignedError when operator is not the assigned one", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        leaveConversation("conv-1", "org-1", "operator-wrong", "Wrong"),
      ).rejects.toThrow(
        "Conversation conv-1 is not assigned to user operator-wrong",
      );
      expect(mockBroadcastOrganizationEvent).not.toHaveBeenCalled();
    });

    it("throws ConversationNotAssignedError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        leaveConversation("conv-999", "org-1", "operator-1", "Alice"),
      ).rejects.toThrow(
        "Conversation conv-999 is not assigned to user operator-1",
      );
    });
  });

  describe("resolveConversation", () => {
    const systemMsgRow = {
      id: "sys-3",
      conversationId: "conv-1",
      senderId: null,
      type: "system",
      content:
        "Alice resolved the conversation you'll be able to chat with them again soon",
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("sets status to closed and closedAt timestamp", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "closed" as const,
        closedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      const result = await resolveConversation(
        "conv-1",
        "org-1",
        "operator-1",
        "Alice",
      );

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("broadcasts lifecycle and system message events on success", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        status: "closed" as const,
        closedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockUpdate.mockReturnValueOnce(chainMock([updatedRow]));
      mockInsert.mockReturnValueOnce(chainMock([systemMsgRow]));

      await resolveConversation("conv-1", "org-1", "operator-1", "Alice");

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledTimes(2);
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "conversation:resolved" }),
      );
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({ type: "message:new" }),
      );
    });

    it("throws ConversationNotAssignedError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        resolveConversation("conv-999", "org-1", "operator-1", "Alice"),
      ).rejects.toThrow(
        "Conversation conv-999 is not assigned to user operator-1",
      );
    });
  });

  describe("validateSendAuthorization", () => {
    it("allows visitor who is a participant and returns conversation data", async () => {
      const convData = {
        status: "pending",
        assignedTo: null,
        organizationId: "org-1",
      };
      const selectConvChain = chainMock([convData]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      const selectPartChain = chainMock([{ id: "part-1" }]);
      mockSelect.mockReturnValueOnce(selectPartChain);

      const result = await validateSendAuthorization(
        "conv-1",
        "visitor-1",
        "visitor",
      );
      expect(result).toEqual(convData);
    });

    it("rejects visitor who is NOT a participant", async () => {
      const selectConvChain = chainMock([
        { status: "active", assignedTo: "operator-1", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      const selectPartChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectPartChain);

      await expect(
        validateSendAuthorization("conv-1", "visitor-unknown", "visitor"),
      ).rejects.toThrow(NotAssignedToConversationError);
    });

    it("allows operator who is assignedTo and returns conversation data", async () => {
      const convData = {
        status: "active",
        assignedTo: "operator-1",
        organizationId: "org-1",
      };
      const selectConvChain = chainMock([convData]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      const result = await validateSendAuthorization(
        "conv-1",
        "operator-1",
        "operator",
      );
      expect(result).toEqual(convData);
    });

    it("rejects operator who is NOT assignedTo the conversation", async () => {
      const selectConvChain = chainMock([
        { status: "active", assignedTo: "operator-1", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-1", "operator-2", "operator"),
      ).rejects.toThrow(NotAssignedToConversationError);
    });

    it("rejects admin who is NOT assignedTo the conversation", async () => {
      const selectConvChain = chainMock([
        { status: "active", assignedTo: "operator-1", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-1", "admin-1", "admin"),
      ).rejects.toThrow(NotAssignedToConversationError);
    });

    it("allows admin who IS assignedTo and returns conversation data", async () => {
      const convData = {
        status: "active",
        assignedTo: "admin-1",
        organizationId: "org-1",
      };
      const selectConvChain = chainMock([convData]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      const result = await validateSendAuthorization(
        "conv-1",
        "admin-1",
        "admin",
      );
      expect(result).toEqual(convData);
    });

    it("rejects staff sending to a pending conversation (must accept first)", async () => {
      const selectConvChain = chainMock([
        { status: "pending", assignedTo: null, organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-1", "operator-1", "operator"),
      ).rejects.toThrow(NotAssignedToConversationError);
    });

    it("throws ConversationNotFoundError for non-existent conversation", async () => {
      const selectConvChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-999", "user-1", "operator"),
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });

  describe("softDeleteConversation", () => {
    it("sets deletedAt and returns the updated row", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        deletedAt: "2026-04-09T00:00:00Z",
        updatedAt: "2026-04-09T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await softDeleteConversation("conv-1", "org-1");

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("throws ConversationNotFoundError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(softDeleteConversation("conv-999", "org-1")).rejects.toThrow(
        "Conversation not found: conv-999",
      );
    });

    it("throws ConversationNotFoundError for already-deleted conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        softDeleteConversation("conv-deleted", "org-1"),
      ).rejects.toThrow("Conversation not found: conv-deleted");
    });
  });

  describe("updateConversationSubject", () => {
    it("updates subject and returns the row", async () => {
      const updatedRow = {
        id: "conv-1",
        organizationId: "org-1",
        subject: "New subject",
        assignedTo: "operator-1",
        updatedAt: "2026-04-09T00:00:00Z",
      };

      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await updateConversationSubject(
        "conv-1",
        "org-1",
        "operator-1",
        "New subject",
      );

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("throws ConversationNotAssignedError when user is not assignedTo", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        updateConversationSubject(
          "conv-1",
          "org-1",
          "wrong-user",
          "New subject",
        ),
      ).rejects.toThrow(
        "Conversation conv-1 is not assigned to user wrong-user",
      );
    });

    it("throws ConversationNotAssignedError for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      await expect(
        updateConversationSubject(
          "conv-999",
          "org-1",
          "operator-1",
          "New subject",
        ),
      ).rejects.toThrow(
        "Conversation conv-999 is not assigned to user operator-1",
      );
    });
  });

  describe("editMessage", () => {
    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const existingMessage = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "text" as const,
      content: "Original",
      editedAt: null,
      deletedAt: null,
      createdAt: recentTimestamp,
      updatedAt: recentTimestamp,
    };

    it("updates content and sets editedAt", async () => {
      const selectChain = chainMock([existingMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      const updatedRow = {
        ...existingMessage,
        content: "Updated content",
        editedAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      };
      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await editMessage({
        messageId: "msg-1",
        conversationId: "conv-1",
        senderId: "user-1",
        content: "Updated content",
      });

      expect(result).toEqual(updatedRow);
      expect(result.editedAt).not.toBeNull();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("throws MessageNotFoundError for non-existent message", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        editMessage({
          messageId: "msg-999",
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Updated",
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("throws MessageNotFoundError for already-deleted message", async () => {
      const deletedMessage = {
        ...existingMessage,
        deletedAt: "2026-01-01T00:00:00.000Z",
      };
      // The WHERE clause filters deletedAt IS NULL, so no rows returned
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        editMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Updated",
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("throws NotMessageSenderError when senderId does not match", async () => {
      const selectChain = chainMock([existingMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        editMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-other",
          content: "Updated",
        }),
      ).rejects.toThrow(NotMessageSenderError);
    });

    it("allows edit within the 15-minute window", async () => {
      const recentMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([recentMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      const updatedRow = {
        ...recentMessage,
        content: "Edited",
        editedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updateChain = chainMock([updatedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await editMessage({
        messageId: "msg-1",
        conversationId: "conv-1",
        senderId: "user-1",
        content: "Edited",
      });

      expect(result).toEqual(updatedRow);
    });

    it("rejects edit after 15-minute window", async () => {
      const oldMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([oldMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        editMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Too late",
        }),
      ).rejects.toThrow(MessageEditWindowExpiredError);
    });

    it("rejects edit at exactly 15 minutes (boundary)", async () => {
      const boundaryMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([boundaryMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        editMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Boundary test",
        }),
      ).rejects.toThrow(MessageEditWindowExpiredError);
    });

    it("includes window details in the error", async () => {
      const expiredAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const oldMessage = {
        ...existingMessage,
        createdAt: expiredAt,
      };
      const selectChain = chainMock([oldMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      try {
        await editMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
          content: "Too late",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MessageEditWindowExpiredError);
        const e = error as InstanceType<typeof MessageEditWindowExpiredError>;
        expect(e.createdAt).toBe(expiredAt);
        expect(e.windowMinutes).toBe(15);
      }
    });
  });

  describe("deleteMessage", () => {
    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const existingMessage = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "text" as const,
      content: "Hello",
      editedAt: null,
      deletedAt: null,
      createdAt: recentTimestamp,
      updatedAt: recentTimestamp,
    };

    it("soft-deletes message by setting deletedAt", async () => {
      const selectChain = chainMock([existingMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      const deletedRow = {
        ...existingMessage,
        deletedAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      };
      const updateChain = chainMock([deletedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await deleteMessage({
        messageId: "msg-1",
        conversationId: "conv-1",
        senderId: "user-1",
      });

      expect(result).toEqual(deletedRow);
      expect(result.deletedAt).not.toBeNull();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("throws MessageNotFoundError for non-existent message", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        deleteMessage({
          messageId: "msg-999",
          conversationId: "conv-1",
          senderId: "user-1",
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("throws MessageNotFoundError for already-deleted message", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        deleteMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("throws NotMessageSenderError when senderId does not match", async () => {
      const selectChain = chainMock([existingMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        deleteMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-other",
        }),
      ).rejects.toThrow(NotMessageSenderError);
    });

    it("allows delete within the 15-minute window", async () => {
      const recentMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([recentMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      const deletedRow = {
        ...recentMessage,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updateChain = chainMock([deletedRow]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await deleteMessage({
        messageId: "msg-1",
        conversationId: "conv-1",
        senderId: "user-1",
      });

      expect(result).toEqual(deletedRow);
    });

    it("rejects delete after 15-minute window", async () => {
      const oldMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([oldMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        deleteMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
        }),
      ).rejects.toThrow(MessageEditWindowExpiredError);
    });

    it("rejects delete at exactly 15 minutes (boundary)", async () => {
      const boundaryMessage = {
        ...existingMessage,
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      };
      const selectChain = chainMock([boundaryMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      await expect(
        deleteMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
        }),
      ).rejects.toThrow(MessageEditWindowExpiredError);
    });

    it("includes window details in the delete error", async () => {
      const expiredAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const oldMessage = {
        ...existingMessage,
        createdAt: expiredAt,
      };
      const selectChain = chainMock([oldMessage]);
      mockSelect.mockReturnValueOnce(selectChain);

      try {
        await deleteMessage({
          messageId: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MessageEditWindowExpiredError);
        const e = error as InstanceType<typeof MessageEditWindowExpiredError>;
        expect(e.createdAt).toBe(expiredAt);
        expect(e.windowMinutes).toBe(15);
      }
    });
  });

  describe("getUnreadCount", () => {
    it("returns count of all visitor messages when lastReadMessageId is null", async () => {
      // Query 1: get participant's lastReadMessageId
      const participantChain = chainMock([{ lastReadMessageId: null }]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: count visitor messages (no cutoff — count all)
      const countChain = chainMock([{ count: 5 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCount("conv-1", "user-1");
      expect(result).toBe(5);
    });

    it("returns count of visitor messages after lastReadMessageId", async () => {
      // Query 1: get participant's lastReadMessageId
      const participantChain = chainMock([{ lastReadMessageId: "msg-3" }]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: get lastReadMessage's createdAt
      const lastReadChain = chainMock([
        { createdAt: "2026-01-01T00:03:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(lastReadChain);

      // Query 3: count visitor messages after cutoff
      const countChain = chainMock([{ count: 2 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCount("conv-1", "user-1");
      expect(result).toBe(2);
    });

    it("returns 0 when no unread messages exist", async () => {
      const participantChain = chainMock([{ lastReadMessageId: null }]);
      mockSelect.mockReturnValueOnce(participantChain);

      const countChain = chainMock([{ count: 0 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCount("conv-1", "user-1");
      expect(result).toBe(0);
    });

    it("returns count of all visitor messages when user is not a participant (queue view)", async () => {
      // Query 1: participant lookup returns empty (not a participant)
      const participantChain = chainMock([]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: count all visitor messages (no cutoff since no lastReadMessageId)
      const countChain = chainMock([{ count: 3 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCount("conv-1", "user-unknown");
      expect(result).toBe(3);
    });
  });

  describe("markAsRead", () => {
    it("updates lastReadMessageId when lastReadMessageId is null (first read)", async () => {
      // Query 1: get participant
      const participantChain = chainMock([
        {
          id: "part-1",
          lastReadMessageId: null,
        },
      ]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Update: set lastReadMessageId
      const updateChain = chainMock([{ lastReadMessageId: "msg-5" }]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await markAsRead("conv-1", "user-1", "msg-5");
      expect(result).toEqual({ lastReadMessageId: "msg-5" });
    });

    it("updates lastReadMessageId when new message is newer", async () => {
      // Query 1: get participant
      const participantChain = chainMock([
        {
          id: "part-1",
          lastReadMessageId: "msg-3",
        },
      ]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: get current lastReadMessage createdAt
      const currentMsgChain = chainMock([
        { createdAt: "2026-01-01T00:03:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(currentMsgChain);

      // Query 3: get new message createdAt
      const newMsgChain = chainMock([
        { createdAt: "2026-01-01T00:05:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(newMsgChain);

      // Update
      const updateChain = chainMock([{ lastReadMessageId: "msg-5" }]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await markAsRead("conv-1", "user-1", "msg-5");
      expect(result).toEqual({ lastReadMessageId: "msg-5" });
    });

    it("does NOT update when new message is older (monotonic enforcement)", async () => {
      // Query 1: get participant
      const participantChain = chainMock([
        {
          id: "part-1",
          lastReadMessageId: "msg-5",
        },
      ]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: get current lastReadMessage createdAt (newer)
      const currentMsgChain = chainMock([
        { createdAt: "2026-01-01T00:05:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(currentMsgChain);

      // Query 3: get new message createdAt (older)
      const newMsgChain = chainMock([
        { createdAt: "2026-01-01T00:03:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(newMsgChain);

      const result = await markAsRead("conv-1", "user-1", "msg-3");
      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns null when user is not a participant", async () => {
      const participantChain = chainMock([]);
      mockSelect.mockReturnValueOnce(participantChain);

      const result = await markAsRead("conv-1", "user-unknown", "msg-5");
      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe("getUnreadCountForVisitor", () => {
    it("returns count of all non-visitor messages when lastReadMessageId is null", async () => {
      // Query 1: get participant's lastReadMessageId
      const participantChain = chainMock([{ lastReadMessageId: null }]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: count non-visitor messages (no cutoff — count all)
      const countChain = chainMock([{ count: 3 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCountForVisitor("conv-1", "visitor-1");
      expect(result).toBe(3);
    });

    it("returns count of non-visitor messages after lastReadMessageId", async () => {
      // Query 1: get participant's lastReadMessageId
      const participantChain = chainMock([{ lastReadMessageId: "msg-2" }]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: get lastReadMessage's createdAt
      const lastReadChain = chainMock([
        { createdAt: "2026-01-01T00:02:00.000Z" },
      ]);
      mockSelect.mockReturnValueOnce(lastReadChain);

      // Query 3: count non-visitor messages after cutoff
      const countChain = chainMock([{ count: 2 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCountForVisitor("conv-1", "visitor-1");
      expect(result).toBe(2);
    });

    it("returns 0 when no unread messages exist", async () => {
      const participantChain = chainMock([{ lastReadMessageId: null }]);
      mockSelect.mockReturnValueOnce(participantChain);

      const countChain = chainMock([{ count: 0 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCountForVisitor("conv-1", "visitor-1");
      expect(result).toBe(0);
    });

    it("excludes visitor's own messages from count", async () => {
      // Query 1: get participant's lastReadMessageId
      const participantChain = chainMock([{ lastReadMessageId: null }]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: count only non-visitor messages (visitor's own excluded by senderId != visitorUserId)
      const countChain = chainMock([{ count: 1 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCountForVisitor("conv-1", "visitor-1");
      expect(result).toBe(1);
    });

    it("returns 0 when visitor is not a participant (no participant row)", async () => {
      // Query 1: participant lookup returns empty
      const participantChain = chainMock([]);
      mockSelect.mockReturnValueOnce(participantChain);

      // Query 2: still counts non-visitor messages (no cutoff)
      const countChain = chainMock([{ count: 0 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await getUnreadCountForVisitor(
        "conv-1",
        "visitor-unknown",
      );
      expect(result).toBe(0);
    });
  });

  describe("getBulkUnreadCounts", () => {
    it("returns empty map for empty conversation list", async () => {
      const result = await getBulkUnreadCounts([], "user-1");
      expect(result).toEqual(new Map());
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns unread counts for multiple conversations", async () => {
      const queryResult = [
        { conversationId: "conv-1", count: 5 },
        { conversationId: "conv-2", count: 0 },
        { conversationId: "conv-3", count: 12 },
      ];

      const chain = chainMock(queryResult);
      mockSelect.mockReturnValueOnce(chain);

      const result = await getBulkUnreadCounts(
        ["conv-1", "conv-2", "conv-3"],
        "user-1",
      );

      expect(result).toEqual(
        new Map([
          ["conv-1", 5],
          ["conv-2", 0],
          ["conv-3", 12],
        ]),
      );
    });

    it("returns 0 for conversations not in query result", async () => {
      const queryResult = [{ conversationId: "conv-1", count: 3 }];

      const chain = chainMock(queryResult);
      mockSelect.mockReturnValueOnce(chain);

      const result = await getBulkUnreadCounts(["conv-1", "conv-2"], "user-1");

      expect(result.get("conv-1")).toBe(3);
      expect(result.get("conv-2")).toBeUndefined();
    });
  });

  describe("listConversationsForVisitor", () => {
    it("returns paginated conversations for a visitor", async () => {
      const conversations = [
        {
          id: "conv-1",
          status: "active",
          subject: "Help",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:01:00.000Z",
        },
      ];

      const dataChain = chainMock(conversations);
      mockSelect.mockReturnValueOnce(dataChain);

      const countChain = chainMock([{ total: 1 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await listConversationsForVisitor({
        applicationId: "app-1",
        organizationId: "org-1",
        visitorUserId: "visitor-1",
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({
        conversations,
        total: 1,
      });
    });

    it("returns empty list when visitor has no conversations", async () => {
      const dataChain = chainMock([]);
      mockSelect.mockReturnValueOnce(dataChain);

      const countChain = chainMock([{ total: 0 }]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await listConversationsForVisitor({
        applicationId: "app-1",
        organizationId: "org-1",
        visitorUserId: "visitor-1",
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({
        conversations: [],
        total: 0,
      });
    });

    it("returns 0 total when count row is missing", async () => {
      const dataChain = chainMock([]);
      mockSelect.mockReturnValueOnce(dataChain);

      const countChain = chainMock([]);
      mockSelect.mockReturnValueOnce(countChain);

      const result = await listConversationsForVisitor({
        applicationId: "app-1",
        organizationId: "org-1",
        visitorUserId: "visitor-1",
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({
        conversations: [],
        total: 0,
      });
    });
  });

  describe("createConversation broadcast", () => {
    function mockCreateTransaction(conversationRow: unknown) {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const insertConvChain = chainMock([conversationRow]);
        const insertPartChain = chainMock([{}]);
        let callCount = 0;
        const tx = {
          insert: vi.fn(() => {
            callCount++;
            return callCount === 1 ? insertConvChain : insertPartChain;
          }),
        };
        return fn(tx);
      });
    }

    it("calls broadcastOrganizationEvent with conversation:new event after DB write", async () => {
      const conversationRow = {
        id: "conv-b1",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "pending" as const,
        subject: "Help me",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        closedAt: null,
      };
      mockCreateTransaction(conversationRow);

      await createConversation({
        organizationId: "org-1",
        applicationId: "app-1",
        subject: "Help me",
        participants: [{ userId: "visitor-1", role: "visitor" as const }],
      });

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledOnce();
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          type: "conversation:new",
          payload: expect.objectContaining({
            id: "conv-b1",
            organizationId: "org-1",
            applicationId: "app-1",
            status: "pending",
            subject: "Help me",
          }),
        }),
      );
    });

    it("does not throw when broadcastOrganizationEvent fails", async () => {
      mockBroadcastOrganizationEvent.mockImplementationOnce(() => {
        throw new Error("broadcast failed");
      });
      const conversationRow = {
        id: "conv-b2",
        organizationId: "org-1",
        applicationId: null,
        status: "pending" as const,
        subject: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        closedAt: null,
      };
      mockCreateTransaction(conversationRow);

      await expect(
        createConversation({
          organizationId: "org-1",
          participants: [{ userId: "visitor-1", role: "visitor" as const }],
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("sendMessage broadcast", () => {
    const messageRow = {
      id: "msg-b1",
      conversationId: "conv-1",
      senderId: "visitor-user-1",
      type: "text" as const,
      content: "Hello from visitor",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };

    function mockSendBroadcastTransaction() {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          insert: vi.fn(() => chainMock([messageRow])),
          update: vi.fn(() => chainMock([{}])),
        };
        return fn(tx);
      });
    }

    it("calls broadcastOrganizationEvent with message:new when broadcastContext is provided", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await sendMessage({
        conversationId: "conv-1",
        senderId: "visitor-user-1",
        content: "Hello from visitor",
        broadcastContext: {
          senderName: "Visitor",
          senderRole: "visitor" as const,
        },
      });

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledOnce();
      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          type: "message:new",
          payload: expect.objectContaining({
            id: "msg-b1",
            conversationId: "conv-1",
            senderId: "visitor-user-1",
            senderName: "Visitor",
            senderRole: "visitor",
            content: "Hello from visitor",
          }),
        }),
      );
    });

    it("does not call broadcastOrganizationEvent when broadcastContext is absent", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await sendMessage({
        conversationId: "conv-1",
        senderId: "visitor-user-1",
        content: "Hello",
      });

      expect(mockBroadcastOrganizationEvent).not.toHaveBeenCalled();
    });

    it("does not throw when broadcastOrganizationEvent fails", async () => {
      mockBroadcastOrganizationEvent.mockImplementationOnce(() => {
        throw new Error("broadcast failed");
      });
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await expect(
        sendMessage({
          conversationId: "conv-1",
          senderId: "visitor-user-1",
          content: "Hello",
          broadcastContext: {
            senderName: "Visitor",
            senderRole: "visitor" as const,
          },
        }),
      ).resolves.not.toThrow();
    });

    it("broadcasts using organizationId from provided conversationData", async () => {
      mockSendBroadcastTransaction();

      await sendMessage(
        {
          conversationId: "conv-1",
          senderId: "visitor-user-1",
          content: "Hello",
          broadcastContext: {
            senderName: "Visitor",
            senderRole: "visitor" as const,
          },
        },
        { status: "active", assignedTo: null, organizationId: "org-from-data" },
      );

      expect(mockBroadcastOrganizationEvent).toHaveBeenCalledOnce();
      const firstCall = mockBroadcastOrganizationEvent.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall![0]).toBe("org-from-data");
    });

    it("also broadcasts to conversation room so visitors receive message:new events", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await sendMessage({
        conversationId: "conv-1",
        senderId: "visitor-user-1",
        content: "Hello from visitor",
        broadcastContext: {
          senderName: "Visitor",
          senderRole: "visitor" as const,
        },
      });

      expect(mockBroadcastRoomEvent).toHaveBeenCalledOnce();
      expect(mockBroadcastRoomEvent).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({
          type: "message:new",
          payload: expect.objectContaining({
            conversationId: "conv-1",
            senderId: "visitor-user-1",
            content: "Hello from visitor",
          }),
        }),
      );
    });

    it("does not call broadcastRoomEvent when broadcastContext is absent", async () => {
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await sendMessage({
        conversationId: "conv-1",
        senderId: "visitor-user-1",
        content: "Hello",
      });

      expect(mockBroadcastRoomEvent).not.toHaveBeenCalled();
    });

    it("does not throw when broadcastRoomEvent fails", async () => {
      mockBroadcastRoomEvent.mockImplementationOnce(() => {
        throw new Error("room broadcast failed");
      });
      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);
      mockSendBroadcastTransaction();

      await expect(
        sendMessage({
          conversationId: "conv-1",
          senderId: "visitor-user-1",
          content: "Hello",
          broadcastContext: {
            senderName: "Visitor",
            senderRole: "visitor" as const,
          },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("createSystemMessage", () => {
    const systemMessageRow = {
      id: "sys-msg-1",
      conversationId: "conv-1",
      senderId: null,
      type: "system",
      content: "John joined the conversation",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      editedAt: null,
      deletedAt: null,
    };

    it("inserts a system message with null senderId and type system", async () => {
      mockInsert.mockReturnValue(chainMock([systemMessageRow]));

      const result = await createSystemMessage(
        "conv-1",
        "John joined the conversation",
      );

      expect(mockInsert).toHaveBeenCalledOnce();
      expect(result).toEqual(systemMessageRow);
    });

    it("sets type to system and senderId to null in the insert values", async () => {
      const insertChain = chainMock([systemMessageRow]);
      mockInsert.mockReturnValue(insertChain);

      await createSystemMessage("conv-1", "John joined the conversation");

      const valuesFn = insertChain.values as ReturnType<typeof vi.fn>;
      expect(valuesFn).toHaveBeenCalledOnce();
      const insertedValues = valuesFn.mock.calls[0]![0];
      expect(insertedValues).toMatchObject({
        conversationId: "conv-1",
        senderId: null,
        type: "system",
        content: "John joined the conversation",
      });
    });

    it("returns the inserted message row", async () => {
      mockInsert.mockReturnValue(chainMock([systemMessageRow]));

      const result = await createSystemMessage(
        "conv-1",
        "Operator left the conversation",
      );

      expect(result).toBeDefined();
      expect(result!.type).toBe("system");
      expect(result!.senderId).toBeNull();
    });
  });

  describe("listConversationsForMember", () => {
    const baseConversation = {
      id: "conv-1",
      organizationId: "org-1",
      applicationId: "app-1",
      status: "pending" as const,
      subject: null,
      assignedTo: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      closedAt: null,
      deletedAt: null,
      createdBy: null,
    };

    it("returns conversations and total count for an admin", async () => {
      const convRows = [baseConversation];
      const countRows = [{ count: 1 }];

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        return selectCallCount === 1
          ? chainMock(convRows)
          : chainMock(countRows);
      });

      const result = await listConversationsForMember({
        organizationId: "org-1",
        userId: "user-1",
        isAdmin: true,
        limit: 20,
        offset: 0,
      });

      expect(result.conversations).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.conversations[0]).toHaveProperty("unreadCount");
    });

    it("returns unread counts for conversations assigned to the user", async () => {
      const assignedConv = {
        ...baseConversation,
        assignedTo: "user-1",
        status: "active" as const,
      };
      const convRows = [assignedConv];
      const countRows = [{ count: 1 }];
      const unreadRows = [{ conversationId: "conv-1", count: 3 }];

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return chainMock(convRows);
        if (selectCallCount === 2) return chainMock(countRows);
        return chainMock(unreadRows);
      });

      const result = await listConversationsForMember({
        organizationId: "org-1",
        userId: "user-1",
        isAdmin: true,
        limit: 20,
        offset: 0,
      });

      expect(result.conversations[0]!.unreadCount).toBe(3);
    });

    it("returns zero unread when no conversations are assigned to user", async () => {
      const convRows = [baseConversation];
      const countRows = [{ count: 1 }];

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        return selectCallCount === 1
          ? chainMock(convRows)
          : chainMock(countRows);
      });

      const result = await listConversationsForMember({
        organizationId: "org-1",
        userId: "user-1",
        isAdmin: true,
        limit: 20,
        offset: 0,
      });

      expect(result.conversations[0]!.unreadCount).toBe(0);
    });
  });

  describe("getMessageHistoryForMember", () => {
    it("verifies conversation belongs to org then returns messages with sender info", async () => {
      const convCheckRow = [{ id: "conv-1" }];
      const messageRows = [
        {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "user-1",
          senderName: "Alice",
          senderRole: "operator",
          type: "text",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        return selectCallCount === 1
          ? chainMock(convCheckRow)
          : chainMock(messageRows);
      });

      const result = await getMessageHistoryForMember({
        conversationId: "conv-1",
        organizationId: "org-1",
        limit: 50,
        offset: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: "msg-1",
          senderName: "Alice",
          senderRole: "operator",
        }),
      );
    });

    it("throws ConversationNotFoundError when conversation does not belong to org", async () => {
      mockSelect.mockReturnValue(chainMock([]));

      await expect(
        getMessageHistoryForMember({
          conversationId: "conv-missing",
          organizationId: "org-1",
          limit: 50,
          offset: 0,
        }),
      ).rejects.toThrow("conv-missing");
    });
  });
});
