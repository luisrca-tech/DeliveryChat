import { describe, it, expect } from "vitest";
import { listApplicationsQuerySchema } from "../applications.js";

describe("listApplicationsQuerySchema", () => {
  it("accepts valid query with hasMyConversations", () => {
    const result = listApplicationsQuerySchema.safeParse({
      limit: "10",
      offset: "0",
      hasMyConversations: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasMyConversations).toBe(true);
    }
  });

  it("accepts query without hasMyConversations", () => {
    const result = listApplicationsQuerySchema.safeParse({
      limit: "10",
      offset: "0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasMyConversations).toBeUndefined();
    }
  });

  it("coerces string 'true' to boolean", () => {
    const result = listApplicationsQuerySchema.safeParse({
      hasMyConversations: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasMyConversations).toBe(true);
    }
  });

  it("coerces string 'false' to boolean false", () => {
    const result = listApplicationsQuerySchema.safeParse({
      hasMyConversations: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasMyConversations).toBe(false);
    }
  });

  it("applies defaults for limit and offset", () => {
    const result = listApplicationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(0);
    }
  });
});
