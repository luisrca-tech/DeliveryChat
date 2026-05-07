import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBroadcastToOrganization = vi.fn();
const mockBroadcast = vi.fn();
const mockBroadcastToStaff = vi.fn();

vi.mock("../room-manager-instance.js", () => ({
  roomManager: {
    broadcastToOrganization: mockBroadcastToOrganization,
    broadcast: mockBroadcast,
    broadcastToStaff: mockBroadcastToStaff,
  },
}));

const {
  buildConversationNewEvent,
  buildMessageNewEvent,
  buildConversationAcceptedEvent,
  buildConversationReleasedEvent,
  buildConversationResolvedEvent,
  buildMessageEditedEvent,
  buildMessageDeletedEvent,
  buildTypingStartEvent,
  buildTypingStopEvent,
  broadcastOrganizationEvent,
  broadcastRoomEvent,
  broadcastStaffEvent,
} = await import("../broadcasting.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Event factory functions", () => {
  it("buildConversationNewEvent returns correct shape", () => {
    const payload = {
      id: "conv-1",
      organizationId: "org-1",
      applicationId: "app-1",
      status: "pending" as const,
      subject: "Help needed",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const event = buildConversationNewEvent(payload);
    expect(event).toEqual({ type: "conversation:new", payload });
  });

  it("buildConversationNewEvent accepts null applicationId and subject", () => {
    const payload = {
      id: "conv-1",
      organizationId: "org-1",
      applicationId: null,
      status: "pending" as const,
      subject: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const event = buildConversationNewEvent(payload);
    expect(event).toEqual({ type: "conversation:new", payload });
  });

  it("buildMessageNewEvent returns correct shape", () => {
    const payload = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      senderName: "Alice",
      senderRole: "visitor" as const,
      content: "Hello!",
      type: "text" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const event = buildMessageNewEvent(payload);
    expect(event).toEqual({ type: "message:new", payload });
  });

  it("buildConversationAcceptedEvent returns correct shape", () => {
    const payload = {
      conversationId: "conv-1",
      assignedTo: "user-2",
      assignedToName: "Bob",
    };
    const event = buildConversationAcceptedEvent(payload);
    expect(event).toEqual({ type: "conversation:accepted", payload });
  });

  it("buildConversationReleasedEvent returns correct shape", () => {
    const payload = { conversationId: "conv-1" };
    const event = buildConversationReleasedEvent(payload);
    expect(event).toEqual({ type: "conversation:released", payload });
  });

  it("buildConversationResolvedEvent returns correct shape", () => {
    const payload = { conversationId: "conv-1", resolvedBy: "user-2" };
    const event = buildConversationResolvedEvent(payload);
    expect(event).toEqual({ type: "conversation:resolved", payload });
  });

  it("buildMessageEditedEvent returns correct shape", () => {
    const payload = {
      conversationId: "conv-1",
      messageId: "msg-1",
      content: "Updated content",
      editedAt: "2026-01-01T00:01:00Z",
      senderId: "user-1",
    };
    const event = buildMessageEditedEvent(payload);
    expect(event).toEqual({ type: "message:edited", payload });
  });

  it("buildMessageDeletedEvent returns correct shape", () => {
    const payload = {
      conversationId: "conv-1",
      messageId: "msg-1",
      senderId: "user-1",
    };
    const event = buildMessageDeletedEvent(payload);
    expect(event).toEqual({ type: "message:deleted", payload });
  });

  it("buildTypingStartEvent returns correct shape", () => {
    const payload = {
      conversationId: "conv-1",
      userId: "user-1",
      userName: "Alice",
      senderRole: "visitor" as const,
    };
    const event = buildTypingStartEvent(payload);
    expect(event).toEqual({ type: "typing:start", payload });
  });

  it("buildTypingStopEvent returns correct shape", () => {
    const payload = { conversationId: "conv-1", userId: "user-1" };
    const event = buildTypingStopEvent(payload);
    expect(event).toEqual({ type: "typing:stop", payload });
  });
});

describe("Broadcast wrappers", () => {
  const event = buildConversationReleasedEvent({ conversationId: "conv-1" });

  it("broadcastOrganizationEvent serializes event and calls roomManager", () => {
    broadcastOrganizationEvent("org-1", event);
    expect(mockBroadcastToOrganization).toHaveBeenCalledOnce();
    expect(mockBroadcastToOrganization).toHaveBeenCalledWith(
      "org-1",
      JSON.stringify(event),
      undefined,
    );
  });

  it("broadcastOrganizationEvent passes excludeConnectionId when provided", () => {
    broadcastOrganizationEvent("org-1", event, "conn-1");
    expect(mockBroadcastToOrganization).toHaveBeenCalledWith(
      "org-1",
      JSON.stringify(event),
      "conn-1",
    );
  });

  it("broadcastRoomEvent serializes event and calls roomManager.broadcast", () => {
    broadcastRoomEvent("conv-1", event);
    expect(mockBroadcast).toHaveBeenCalledOnce();
    expect(mockBroadcast).toHaveBeenCalledWith("conv-1", JSON.stringify(event), undefined);
  });

  it("broadcastRoomEvent passes excludeConnectionId when provided", () => {
    broadcastRoomEvent("conv-1", event, "conn-1");
    expect(mockBroadcast).toHaveBeenCalledWith(
      "conv-1",
      JSON.stringify(event),
      "conn-1",
    );
  });

  it("broadcastStaffEvent serializes event and calls roomManager.broadcastToStaff", () => {
    broadcastStaffEvent("org-1", event);
    expect(mockBroadcastToStaff).toHaveBeenCalledOnce();
    expect(mockBroadcastToStaff).toHaveBeenCalledWith(
      "org-1",
      JSON.stringify(event),
      undefined,
    );
  });

  it("broadcastStaffEvent passes excludeConnectionId when provided", () => {
    broadcastStaffEvent("org-1", event, "conn-1");
    expect(mockBroadcastToStaff).toHaveBeenCalledWith(
      "org-1",
      JSON.stringify(event),
      "conn-1",
    );
  });
});
