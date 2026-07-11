import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: { update: vi.fn(), insert: vi.fn() },
}));

vi.mock("../../chat/broadcasting.service.js", () => ({
  broadcastRoomEvent: vi.fn(),
  broadcastStaffEvent: vi.fn(),
  buildMessageNewEvent: vi.fn((p: unknown) => ({ type: "message:new", payload: p })),
  buildConversationEscalatedEvent: vi.fn((p: unknown) => ({
    type: "conversation:escalated",
    payload: p,
  })),
}));

const { db } = await import("../../../db/index.js");
const broadcasting = await import("../../chat/broadcasting.service.js");
const { escalateConversation } = await import("../escalate.js");
const {
  ESCALATION_KNOWLEDGE_GAP_MESSAGE,
  ESCALATION_HUMAN_REQUESTED_MESSAGE,
} = await import("../messages.js");

const mockUpdate = db.update as ReturnType<typeof vi.fn>;
const mockInsert = db.insert as ReturnType<typeof vi.fn>;
const mockBroadcastRoom = broadcasting.broadcastRoomEvent as ReturnType<typeof vi.fn>;
const mockBroadcastStaff = broadcasting.broadcastStaffEvent as ReturnType<typeof vi.fn>;

let capturedSet: Record<string, unknown> | null = null;
let capturedInsertValues: Record<string, unknown> | null = null;

function setupDb() {
  capturedSet = null;
  capturedInsertValues = null;

  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn((v: Record<string, unknown>) => {
    capturedSet = v;
    return updateChain;
  });
  updateChain.where = vi.fn(() => updateChain);
  updateChain.returning = vi.fn(() =>
    Promise.resolve([
      { escalatedAt: "2026-07-11T00:00:00.000Z", escalationReason: "no stock" },
    ]),
  );
  mockUpdate.mockReturnValue(updateChain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((v: Record<string, unknown>) => {
    capturedInsertValues = v;
    return insertChain;
  });
  insertChain.returning = vi.fn(() =>
    Promise.resolve([
      { id: "msg-1", content: capturedInsertValues?.content, createdAt: "2026-07-11T00:00:01.000Z" },
    ]),
  );
  mockInsert.mockReturnValue(insertChain);
}

const CONVERSATION = {
  id: "conv-1",
  organizationId: "org-1",
  applicationId: "app-1",
  status: "pending",
  handledBy: "ai",
  assignedTo: null,
  createdBy: "visitor-1",
  subject: "Help",
  createdAt: "2026-07-10T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  setupDb();
});

describe("escalateConversation", () => {
  it("flips the conversation to human/pending and clears the assignee", async () => {
    await escalateConversation({
      conversation: CONVERSATION,
      reason: "no stock",
      kind: "knowledge_gap",
    });

    expect(capturedSet).toMatchObject({
      handledBy: "human",
      status: "pending",
      assignedTo: null,
      escalationReason: "no stock",
    });
    expect(capturedSet).toHaveProperty("escalatedAt");
  });

  it("persists a system message with the knowledge-gap text and authorType system", async () => {
    await escalateConversation({
      conversation: CONVERSATION,
      reason: "no stock",
      kind: "knowledge_gap",
    });

    expect(capturedInsertValues).toMatchObject({
      conversationId: "conv-1",
      senderId: null,
      type: "system",
      authorType: "system",
      content: ESCALATION_KNOWLEDGE_GAP_MESSAGE,
    });
  });

  it("uses the human-requested copy for human_requested escalations", async () => {
    await escalateConversation({
      conversation: CONVERSATION,
      reason: "human_requested",
      kind: "human_requested",
    });
    expect(capturedInsertValues).toMatchObject({
      content: ESCALATION_HUMAN_REQUESTED_MESSAGE,
    });
  });

  it("broadcasts the system message to the room and conversation:escalated to staff", async () => {
    await escalateConversation({
      conversation: CONVERSATION,
      reason: "no stock",
      kind: "knowledge_gap",
    });

    const roomEvent = mockBroadcastRoom.mock.calls[0]![1] as {
      type: string;
      payload: { type: string; content: string };
    };
    expect(roomEvent.type).toBe("message:new");
    expect(roomEvent.payload.type).toBe("system");
    expect(roomEvent.payload.content).toBe(ESCALATION_KNOWLEDGE_GAP_MESSAGE);

    const staffEvent = mockBroadcastStaff.mock.calls[0]![1] as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(staffEvent.type).toBe("conversation:escalated");
    expect(staffEvent.payload).toMatchObject({
      conversationId: "conv-1",
      organizationId: "org-1",
      applicationId: "app-1",
      status: "pending",
      escalationReason: "no stock",
    });
    expect(staffEvent.payload).toHaveProperty("escalatedAt");
  });

  it("truncates the escalation reason to 500 chars", async () => {
    const longReason = "x".repeat(600);
    await escalateConversation({
      conversation: CONVERSATION,
      reason: longReason,
      kind: "turn_failed",
    });
    expect((capturedSet!.escalationReason as string).length).toBe(500);
  });
});
