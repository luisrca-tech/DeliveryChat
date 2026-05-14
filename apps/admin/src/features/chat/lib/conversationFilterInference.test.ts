import { describe, it, expect } from "vitest";
import {
  inferFilterForAction,
  inferFilterForConversation,
} from "./conversationFilterInference";
import type { Conversation } from "../types/chat.types";

function makeConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: "conv-1",
    organizationId: "org-1",
    applicationId: null,
    status: "active",
    createdBy: null,
    assignedTo: null,
    subject: null,
    closedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    unreadCount: 0,
    ...overrides,
  };
}

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

describe("inferFilterForAction", () => {
  describe("accept action", () => {
    it("returns 'all' for admin", () => {
      expect(inferFilterForAction("accept", "admin")).toBe("all");
    });

    it("returns 'all' for super_admin", () => {
      expect(inferFilterForAction("accept", "super_admin")).toBe("all");
    });

    it("returns 'mine' for operator", () => {
      expect(inferFilterForAction("accept", "operator")).toBe("mine");
    });
  });

  describe("leave action", () => {
    it("returns 'queue' for any role", () => {
      expect(inferFilterForAction("leave", "admin")).toBe("queue");
      expect(inferFilterForAction("leave", "super_admin")).toBe("queue");
      expect(inferFilterForAction("leave", "operator")).toBe("queue");
    });
  });

  describe("resolve action", () => {
    it("returns 'closed' for any role", () => {
      expect(inferFilterForAction("resolve", "admin")).toBe("closed");
      expect(inferFilterForAction("resolve", "super_admin")).toBe("closed");
      expect(inferFilterForAction("resolve", "operator")).toBe("closed");
    });
  });
});

describe("inferFilterForConversation", () => {
  describe("pending conversations", () => {
    it("returns 'all' for admin", () => {
      const conv = makeConversation({ status: "pending" });
      expect(inferFilterForConversation(conv, "admin", USER_ID)).toBe("all");
    });

    it("returns 'all' for super_admin", () => {
      const conv = makeConversation({ status: "pending" });
      expect(inferFilterForConversation(conv, "super_admin", USER_ID)).toBe("all");
    });

    it("returns 'queue' for operator", () => {
      const conv = makeConversation({ status: "pending" });
      expect(inferFilterForConversation(conv, "operator", USER_ID)).toBe("queue");
    });
  });

  describe("closed conversations", () => {
    it("returns 'closed' regardless of role", () => {
      const conv = makeConversation({ status: "closed" });
      expect(inferFilterForConversation(conv, "admin", USER_ID)).toBe("closed");
      expect(inferFilterForConversation(conv, "operator", USER_ID)).toBe("closed");
    });
  });

  describe("active conversations", () => {
    it("returns 'all' for admin", () => {
      const conv = makeConversation({ status: "active", assignedTo: OTHER_USER_ID });
      expect(inferFilterForConversation(conv, "admin", USER_ID)).toBe("all");
    });

    it("returns 'all' for super_admin", () => {
      const conv = makeConversation({ status: "active", assignedTo: OTHER_USER_ID });
      expect(inferFilterForConversation(conv, "super_admin", USER_ID)).toBe("all");
    });

    it("returns 'mine' for operator assigned to the conversation", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      expect(inferFilterForConversation(conv, "operator", USER_ID)).toBe("mine");
    });

    it("returns 'queue' for operator not assigned to the conversation", () => {
      const conv = makeConversation({ status: "active", assignedTo: OTHER_USER_ID });
      expect(inferFilterForConversation(conv, "operator", USER_ID)).toBe("queue");
    });
  });

  describe("fallback", () => {
    it("returns 'queue' for unknown status", () => {
      const conv = makeConversation({ status: "unknown" as any });
      expect(inferFilterForConversation(conv, "operator", USER_ID)).toBe("queue");
    });
  });
});
