import { describe, it, expect } from "vitest";
import {
  applyOptimisticAccept,
  applyOptimisticLeave,
  applyOptimisticResolve,
} from "./optimisticConversationUpdates";
import type { ConversationsListResponse } from "../types/chat.types";

function makeListResponse(
  overrides: Partial<ConversationsListResponse> = {},
): ConversationsListResponse {
  return {
    conversations: [
      {
        id: "conv-1",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "pending",
        createdBy: "visitor-1",
        assignedTo: null,
        subject: null,
        closedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        unreadCount: 0,
      },
      {
        id: "conv-2",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "active",
        createdBy: "visitor-2",
        assignedTo: "operator-1",
        subject: "Help with order",
        closedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T01:00:00Z",
        unreadCount: 2,
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

describe("applyOptimisticAccept", () => {
  it("sets status to active and assignedTo to the given userId", () => {
    const data = makeListResponse();
    const result = applyOptimisticAccept(data, "conv-1", "operator-99");

    const conv = result.conversations.find((c) => c.id === "conv-1")!;
    expect(conv.status).toBe("active");
    expect(conv.assignedTo).toBe("operator-99");
  });

  it("does not mutate the original data", () => {
    const data = makeListResponse();
    applyOptimisticAccept(data, "conv-1", "operator-99");

    expect(data.conversations[0]!.status).toBe("pending");
    expect(data.conversations[0]!.assignedTo).toBeNull();
  });

  it("leaves other conversations unchanged", () => {
    const data = makeListResponse();
    const result = applyOptimisticAccept(data, "conv-1", "operator-99");

    const other = result.conversations.find((c) => c.id === "conv-2")!;
    expect(other.status).toBe("active");
    expect(other.assignedTo).toBe("operator-1");
  });

  it("returns the data unchanged when conversation id is not found", () => {
    const data = makeListResponse();
    const result = applyOptimisticAccept(data, "conv-nonexistent", "operator-99");

    expect(result).toEqual(data);
  });
});

describe("applyOptimisticLeave", () => {
  it("sets status to pending and assignedTo to null", () => {
    const data = makeListResponse();
    const result = applyOptimisticLeave(data, "conv-2");

    const conv = result.conversations.find((c) => c.id === "conv-2")!;
    expect(conv.status).toBe("pending");
    expect(conv.assignedTo).toBeNull();
  });

  it("does not mutate the original data", () => {
    const data = makeListResponse();
    applyOptimisticLeave(data, "conv-2");

    expect(data.conversations[1]!.status).toBe("active");
    expect(data.conversations[1]!.assignedTo).toBe("operator-1");
  });

  it("leaves other conversations unchanged", () => {
    const data = makeListResponse();
    const result = applyOptimisticLeave(data, "conv-2");

    const other = result.conversations.find((c) => c.id === "conv-1")!;
    expect(other.status).toBe("pending");
    expect(other.assignedTo).toBeNull();
  });

  it("returns the data unchanged when conversation id is not found", () => {
    const data = makeListResponse();
    const result = applyOptimisticLeave(data, "conv-nonexistent");

    expect(result).toEqual(data);
  });
});

describe("applyOptimisticResolve", () => {
  it("sets status to closed", () => {
    const data = makeListResponse();
    const result = applyOptimisticResolve(data, "conv-2");

    const conv = result.conversations.find((c) => c.id === "conv-2")!;
    expect(conv.status).toBe("closed");
  });

  it("does not mutate the original data", () => {
    const data = makeListResponse();
    applyOptimisticResolve(data, "conv-2");

    expect(data.conversations[1]!.status).toBe("active");
  });

  it("leaves other conversations unchanged", () => {
    const data = makeListResponse();
    const result = applyOptimisticResolve(data, "conv-2");

    const other = result.conversations.find((c) => c.id === "conv-1")!;
    expect(other.status).toBe("pending");
  });

  it("returns the data unchanged when conversation id is not found", () => {
    const data = makeListResponse();
    const result = applyOptimisticResolve(data, "conv-nonexistent");

    expect(result).toEqual(data);
  });
});
