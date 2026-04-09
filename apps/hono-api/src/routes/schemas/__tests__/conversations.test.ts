import { describe, it, expect } from "vitest";
import { listConversationsQuerySchema } from "../conversations.js";

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
