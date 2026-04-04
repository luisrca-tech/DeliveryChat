import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConversationType } from "@repo/types";

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
  ConversationNotFoundError,
  ConversationNotActiveError,
  ApplicationRequiredError,
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
        type: "support" as const,
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
        type: "support" as ConversationType,
        participants: [
          { userId: "user-1", role: "visitor" as const },
          { userId: "user-2", role: "operator" as const },
        ],
      });

      expect(result).toEqual(conversationRow);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("rejects support conversation without applicationId", async () => {
      await expect(
        createConversation({
          organizationId: "org-1",
          type: "support" as ConversationType,
          participants: [
            { userId: "user-1", role: "visitor" as const },
            { userId: "user-2", role: "operator" as const },
          ],
        }),
      ).rejects.toThrow(ApplicationRequiredError);
    });

    it("allows internal conversation without applicationId", async () => {
      const conversationRow = {
        id: "conv-2",
        organizationId: "org-1",
        applicationId: null,
        type: "internal" as const,
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
        type: "internal" as ConversationType,
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
        type: "support" as const,
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
});
