import { describe, it, expect } from "vitest";
import {
  getConversationPermissions,
  isAdminRole,
} from "./conversationPermissions";
import type { Conversation } from "../types/chat.types";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
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

describe("isAdminRole", () => {
  it("returns true for admin", () => {
    expect(isAdminRole("admin")).toBe(true);
  });

  it("returns true for super_admin", () => {
    expect(isAdminRole("super_admin")).toBe(true);
  });

  it("returns false for operator", () => {
    expect(isAdminRole("operator")).toBe(false);
  });

  it("returns false for visitor", () => {
    expect(isAdminRole("visitor")).toBe(false);
  });
});

describe("getConversationPermissions", () => {
  describe("canViewAll", () => {
    it("returns true for admin", () => {
      const result = getConversationPermissions(
        "admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.canViewAll).toBe(true);
    });

    it("returns true for super_admin", () => {
      const result = getConversationPermissions(
        "super_admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.canViewAll).toBe(true);
    });

    it("returns false for operator", () => {
      const result = getConversationPermissions(
        "operator",
        makeConversation(),
        USER_ID,
      );
      expect(result.canViewAll).toBe(false);
    });

    it("returns false for visitor", () => {
      const result = getConversationPermissions(
        "visitor",
        makeConversation(),
        USER_ID,
      );
      expect(result.canViewAll).toBe(false);
    });
  });

  describe("canDelete", () => {
    it("returns true for admin", () => {
      const result = getConversationPermissions(
        "admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.canDelete).toBe(true);
    });

    it("returns true for super_admin", () => {
      const result = getConversationPermissions(
        "super_admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.canDelete).toBe(true);
    });

    it("returns false for operator", () => {
      const result = getConversationPermissions(
        "operator",
        makeConversation(),
        USER_ID,
      );
      expect(result.canDelete).toBe(false);
    });
  });

  describe("canAccept", () => {
    it("returns true for pending conversation with no assignee", () => {
      const conv = makeConversation({ status: "pending", assignedTo: null });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canAccept).toBe(true);
    });

    it("returns false for active conversation", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canAccept).toBe(false);
    });

    it("returns false for closed conversation", () => {
      const conv = makeConversation({ status: "closed" });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canAccept).toBe(false);
    });
  });

  describe("canLeave", () => {
    it("returns true when assigned to current user and conversation is active", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canLeave).toBe(true);
    });

    it("returns false when not assigned to current user", () => {
      const conv = makeConversation({
        status: "active",
        assignedTo: OTHER_USER_ID,
      });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canLeave).toBe(false);
    });

    it("returns false when conversation is pending", () => {
      const conv = makeConversation({ status: "pending", assignedTo: null });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canLeave).toBe(false);
    });

    it("returns false when conversation is closed", () => {
      const conv = makeConversation({ status: "closed", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canLeave).toBe(false);
    });
  });

  describe("canResolve", () => {
    it("returns true when assigned to current user and conversation is active", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canResolve).toBe(true);
    });

    it("returns false when not assigned", () => {
      const conv = makeConversation({
        status: "active",
        assignedTo: OTHER_USER_ID,
      });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canResolve).toBe(false);
    });

    it("returns false for closed conversation", () => {
      const conv = makeConversation({ status: "closed" });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canResolve).toBe(false);
    });
  });

  describe("canEditSubject", () => {
    it("returns true when assigned to current user", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canEditSubject).toBe(true);
    });

    it("returns false when not assigned", () => {
      const conv = makeConversation({
        status: "active",
        assignedTo: OTHER_USER_ID,
      });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canEditSubject).toBe(false);
    });

    it("returns false for closed conversation", () => {
      const conv = makeConversation({ status: "closed", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canEditSubject).toBe(false);
    });
  });

  describe("canSend", () => {
    it("returns true for assigned staff on active conversation", () => {
      const conv = makeConversation({ status: "active", assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canSend).toBe(true);
    });

    it("returns false for staff not assigned to conversation", () => {
      const conv = makeConversation({
        status: "active",
        assignedTo: OTHER_USER_ID,
      });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canSend).toBe(false);
    });

    it("returns true for visitor on active conversation", () => {
      const conv = makeConversation({
        status: "active",
        assignedTo: OTHER_USER_ID,
      });
      const result = getConversationPermissions("visitor", conv, USER_ID);
      expect(result.canSend).toBe(true);
    });

    it("returns false for pending conversation", () => {
      const conv = makeConversation({ status: "pending" });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canSend).toBe(false);
    });

    it("returns false for closed conversation", () => {
      const conv = makeConversation({ status: "closed" });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.canSend).toBe(false);
    });
  });

  describe("isAdmin flag", () => {
    it("returns true for admin role", () => {
      const result = getConversationPermissions(
        "admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.isAdmin).toBe(true);
    });

    it("returns true for super_admin role", () => {
      const result = getConversationPermissions(
        "super_admin",
        makeConversation(),
        USER_ID,
      );
      expect(result.isAdmin).toBe(true);
    });

    it("returns false for operator role", () => {
      const result = getConversationPermissions(
        "operator",
        makeConversation(),
        USER_ID,
      );
      expect(result.isAdmin).toBe(false);
    });
  });

  describe("isAssigned flag", () => {
    it("returns true when conversation is assigned to current user", () => {
      const conv = makeConversation({ assignedTo: USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.isAssigned).toBe(true);
    });

    it("returns false when assigned to someone else", () => {
      const conv = makeConversation({ assignedTo: OTHER_USER_ID });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.isAssigned).toBe(false);
    });

    it("returns false when not assigned", () => {
      const conv = makeConversation({ assignedTo: null });
      const result = getConversationPermissions("operator", conv, USER_ID);
      expect(result.isAssigned).toBe(false);
    });
  });
});
