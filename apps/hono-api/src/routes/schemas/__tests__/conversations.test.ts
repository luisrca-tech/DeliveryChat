import { describe, it, expect } from "vitest";
import { listConversationsQuerySchema, updateConversationSubjectSchema } from "../conversations.js";

describe("listConversationsQuerySchema", () => {
  it("accepts valid query with all params", () => {
    const result = listConversationsQuerySchema.safeParse({
      limit: "50",
      offset: "0",
      status: "active",
      assignedTo: "me",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedTo).toBe("me");
    }
  });

  it("accepts query without assignedTo", () => {
    const result = listConversationsQuerySchema.safeParse({
      limit: "20",
      offset: "0",
      status: "pending",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedTo).toBeUndefined();
    }
  });

  it("rejects invalid assignedTo value", () => {
    const result = listConversationsQuerySchema.safeParse({
      limit: "20",
      offset: "0",
      status: "active",
      assignedTo: "someone-else",
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults for limit and offset", () => {
    const result = listConversationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });
});

describe("updateConversationSubjectSchema", () => {
  it("accepts valid subject", () => {
    const result = updateConversationSubjectSchema.safeParse({ subject: "Help with order" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("Help with order");
    }
  });

  it("trims whitespace", () => {
    const result = updateConversationSubjectSchema.safeParse({ subject: "  trimmed  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("trimmed");
    }
  });

  it("rejects empty subject", () => {
    const result = updateConversationSubjectSchema.safeParse({ subject: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only subject", () => {
    const result = updateConversationSubjectSchema.safeParse({ subject: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects subject exceeding 500 chars", () => {
    const result = updateConversationSubjectSchema.safeParse({ subject: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});
