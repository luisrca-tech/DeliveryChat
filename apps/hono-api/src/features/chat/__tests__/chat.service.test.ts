import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");

const mockSelect = db.select as ReturnType<typeof vi.fn>;
const mockInsert = db.insert as ReturnType<typeof vi.fn>;
const mockUpdate = db.update as ReturnType<typeof vi.fn>;
const mockTransaction = db.transaction as ReturnType<typeof vi.fn>;

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
  ConversationNotFoundError,
  ConversationNotActiveError,
  NotAssignedToConversationError,
  MessageNotFoundError,
  NotMessageSenderError,
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
    it("inserts a message and returns the full row", async () => {
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

      const selectChain = chainMock([
        { status: "active", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectChain);

      const insertChain = chainMock([messageRow]);
      mockInsert.mockReturnValueOnce(insertChain);

      const result = await sendMessage({
        conversationId: "conv-1",
        senderId: "user-1",
        content: "Hello",
      });

      expect(result).toEqual(messageRow);
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

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await closeConversation("conv-999", "org-1");
      expect(result).toBeNull();
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

    it("returns null for non-existent conversation", async () => {
      const selectChain = chainMock([]);
      mockSelect.mockReturnValueOnce(selectChain);

      const result = await getConversationWithParticipants("conv-999", "org-1");
      expect(result).toBeNull();
    });
  });

  describe("acceptConversation", () => {
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

      const result = await acceptConversation("conv-1", "org-1", "operator-1");

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("returns null when conversation is already accepted (race condition lost)", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await acceptConversation("conv-1", "org-1", "operator-2");
      expect(result).toBeNull();
    });

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await acceptConversation("conv-999", "org-1", "operator-1");
      expect(result).toBeNull();
    });
  });

  describe("leaveConversation", () => {
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

      const result = await leaveConversation("conv-1", "org-1", "operator-1");

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("returns null when operator is not the assigned one", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await leaveConversation("conv-1", "org-1", "operator-wrong");
      expect(result).toBeNull();
    });

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await leaveConversation("conv-999", "org-1", "operator-1");
      expect(result).toBeNull();
    });
  });

  describe("resolveConversation", () => {
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

      const result = await resolveConversation("conv-1", "org-1", "operator-1");

      expect(result).toEqual(updatedRow);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await resolveConversation("conv-999", "org-1", "operator-1");
      expect(result).toBeNull();
    });
  });

  describe("validateSendAuthorization", () => {
    it("allows visitor who is a participant to send", async () => {
      // select conversation
      const selectConvChain = chainMock([
        { status: "pending", assignedTo: null, organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      // select participant (isParticipant check)
      const selectPartChain = chainMock([{ id: "part-1" }]);
      mockSelect.mockReturnValueOnce(selectPartChain);

      await expect(
        validateSendAuthorization("conv-1", "visitor-1", "visitor"),
      ).resolves.not.toThrow();
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

    it("allows operator who is assignedTo the conversation", async () => {
      const selectConvChain = chainMock([
        { status: "active", assignedTo: "operator-1", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-1", "operator-1", "operator"),
      ).resolves.not.toThrow();
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

    it("allows admin who IS assignedTo the conversation", async () => {
      const selectConvChain = chainMock([
        { status: "active", assignedTo: "admin-1", organizationId: "org-1" },
      ]);
      mockSelect.mockReturnValueOnce(selectConvChain);

      await expect(
        validateSendAuthorization("conv-1", "admin-1", "admin"),
      ).resolves.not.toThrow();
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

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await softDeleteConversation("conv-999", "org-1");
      expect(result).toBeNull();
    });

    it("returns null for already-deleted conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await softDeleteConversation("conv-deleted", "org-1");
      expect(result).toBeNull();
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

    it("returns null when user is not assignedTo", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await updateConversationSubject(
        "conv-1",
        "org-1",
        "wrong-user",
        "New subject",
      );

      expect(result).toBeNull();
    });

    it("returns null for non-existent conversation", async () => {
      const updateChain = chainMock([]);
      mockUpdate.mockReturnValueOnce(updateChain);

      const result = await updateConversationSubject(
        "conv-999",
        "org-1",
        "operator-1",
        "New subject",
      );

      expect(result).toBeNull();
    });
  });

  describe("editMessage", () => {
    const existingMessage = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "text" as const,
      content: "Original",
      editedAt: null,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
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
      const deletedMessage = { ...existingMessage, deletedAt: "2026-01-01T00:00:00.000Z" };
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
  });

  describe("deleteMessage", () => {
    const existingMessage = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "text" as const,
      content: "Hello",
      editedAt: null,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
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
  });
});
