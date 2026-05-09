import { describe, expect, it } from "bun:test";
import {
  assertSafeDemoPath,
  DEMO_VISITOR_COOKIE,
  getOrCreateVisitorSession,
  parseCookies,
  sanitizeUpstreamResponse,
} from "./demo-proxy.js";

describe("parseCookies", () => {
  it("parses a single cookie", () => {
    expect(parseCookies("a=b")).toEqual({ a: "b" });
  });

  it("parses multiple cookies", () => {
    expect(parseCookies("a=b; c=d")).toEqual({ a: "b", c: "d" });
  });
});

describe("getOrCreateVisitorSession", () => {
  it("reuses valid visitor id from cookie", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const req = new Request("http://localhost/api/demo/x", {
      headers: { Cookie: `${DEMO_VISITOR_COOKIE}=${id}` },
    });
    const { visitorId, setCookie } = getOrCreateVisitorSession(req);
    expect(visitorId).toBe(id);
    expect(setCookie).toBeNull();
  });

  it("creates new id when cookie missing", () => {
    const req = new Request("http://localhost/api/demo/x");
    const { visitorId, setCookie } = getOrCreateVisitorSession(req);
    expect(visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(setCookie).toContain(`${DEMO_VISITOR_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
  });
});

describe("sanitizeUpstreamResponse", () => {
  it("passes through success bodies", () => {
    const { body, status } = sanitizeUpstreamResponse(
      200,
      "application/json",
      '{"ok":true}',
    );
    expect(status).toBe(200);
    expect(body).toBe('{"ok":true}');
  });

  it("strips extra keys from JSON errors", () => {
    const { body } = sanitizeUpstreamResponse(
      403,
      "application/json",
      JSON.stringify({
        error: "forbidden",
        message: "no",
        stack: "secret",
        key: "x",
      }),
    );
    expect(JSON.parse(body)).toEqual({ error: "forbidden", message: "no" });
  });

  it("replaces non-JSON error bodies", () => {
    const { body } = sanitizeUpstreamResponse(
      500,
      "text/html",
      "<html>internal</html>",
    );
    expect(JSON.parse(body).error).toBe("upstream_error");
  });
});

describe("assertSafeDemoPath", () => {
  it("allows normal REST segments", () => {
    expect(assertSafeDemoPath("conversations")).toBe(true);
    expect(assertSafeDemoPath("conversations/uuid/messages")).toBe(true);
  });

  it("rejects traversal and empty", () => {
    expect(assertSafeDemoPath("")).toBe(false);
    expect(assertSafeDemoPath("../x")).toBe(false);
    expect(assertSafeDemoPath("a..b")).toBe(false);
  });
});
