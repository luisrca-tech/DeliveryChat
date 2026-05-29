import { describe, expect, it } from "vitest";
import { InterviewTurnConflictError } from "./aiInterview.client";
import {
  InterviewClientError,
  mapInterviewErrorToSurface,
} from "./interviewErrorMapper";

function err(code: string, status: number, message = "API error") {
  return new InterviewClientError({ code, status, message });
}

describe("mapInterviewErrorToSurface", () => {
  it("returns null for turn-conflict errors (handled separately)", () => {
    const result = mapInterviewErrorToSurface(
      new InterviewTurnConflictError(3, "in_progress"),
    );
    expect(result).toBeNull();
  });

  it.each([
    ["ai_timeout", 504],
    ["ai_provider_busy", 503],
    ["ai_provider_unavailable", 502],
  ] as const)("maps %s to a retry row", (code, status) => {
    const surface = mapInterviewErrorToSurface(err(code, status));
    expect(surface).toMatchObject({
      kind: "retry_row",
      code,
      retryLabel: "Try again",
    });
    expect(surface).toHaveProperty("title");
    expect(surface).toHaveProperty("detail");
  });

  it.each([
    ["ai_empty_response", 422],
    ["ai_content_filtered", 422],
  ] as const)("maps %s to an inline system bubble", (code, status) => {
    const surface = mapInterviewErrorToSurface(err(code, status));
    expect(surface).toMatchObject({ kind: "system_bubble", code });
    expect((surface as { message: string }).message).toMatch(/AI/);
  });

  it("maps ai_monthly_cap_exceeded to a blocking banner", () => {
    const surface = mapInterviewErrorToSurface(
      err("ai_monthly_cap_exceeded", 403),
    );
    expect(surface).toMatchObject({
      kind: "blocking_banner",
      code: "ai_monthly_cap_exceeded",
    });
    expect((surface as { title: string }).title).toMatch(/limit/i);
  });

  it("falls back to a toast for unknown 5xx, including the code", () => {
    const surface = mapInterviewErrorToSurface(
      err("internal_server_error", 500, "Boom"),
    );
    expect(surface).toEqual({
      kind: "toast_fallback",
      code: "internal_server_error",
      message: "Boom",
    });
  });

  it("falls back to a toast for non-InterviewClientError throwables", () => {
    const surface = mapInterviewErrorToSurface(new Error("network down"));
    expect(surface).toEqual({
      kind: "toast_fallback",
      code: "unknown_error",
      message: "network down",
    });
  });

  it("falls back to a toast for unknown 4xx codes (still includes code)", () => {
    const surface = mapInterviewErrorToSurface(
      err("validation_failed", 422, "Invalid"),
    );
    expect(surface).toEqual({
      kind: "toast_fallback",
      code: "validation_failed",
      message: "Invalid",
    });
  });
});
