import { describe, it, expect } from "vitest";
import {
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "../applications.js";

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

describe("updateApplicationSchema", () => {
  it("accepts allowedOrigins as an array of valid domains", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: ["example.com", "app.example.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual([
        "example.com",
        "app.example.com",
      ]);
    }
  });

  it("accepts wildcard entries in allowedOrigins", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: ["*.example.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual(["*.example.com"]);
    }
  });

  it("rejects malformed domains in allowedOrigins", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: ["not a domain!", "https://example.com"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string entries in allowedOrigins", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: [""],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty array for allowedOrigins", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual([]);
    }
  });

  it("allowedOrigins is optional", () => {
    const result = updateApplicationSchema.safeParse({ name: "My App" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toBeUndefined();
    }
  });

  it("lowercases domain entries", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: ["Example.COM", "*.MyDomain.org"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual([
        "example.com",
        "*.mydomain.org",
      ]);
    }
  });

  it("rejects duplicate entries", () => {
    const result = updateApplicationSchema.safeParse({
      allowedOrigins: ["example.com", "example.com"],
    });
    expect(result.success).toBe(false);
  });
});
