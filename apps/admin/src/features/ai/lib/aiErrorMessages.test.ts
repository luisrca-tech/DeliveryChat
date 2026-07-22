import { describe, expect, it } from "vitest";
import { getAiErrorMessage } from "./aiErrorMessages";

describe("getAiErrorMessage", () => {
  it("returns correct message for each known error code", () => {
    expect(getAiErrorMessage("ai_timeout")).toContain("took too long");
    expect(getAiErrorMessage("ai_provider_busy")).toContain("temporarily busy");
    expect(getAiErrorMessage("ai_provider_unavailable")).toContain(
      "unavailable",
    );
    expect(getAiErrorMessage("ai_empty_response")).toContain(
      "couldn't generate",
    );
    expect(getAiErrorMessage("ai_content_filtered")).toContain(
      "couldn't generate",
    );
    expect(getAiErrorMessage("ai_monthly_cap_exceeded")).toContain("monthly");
    expect(getAiErrorMessage("ai_feature_not_available")).toContain(
      "not available",
    );
    expect(getAiErrorMessage("ai_rate_limit_exceeded")).toContain("Too many");
    expect(getAiErrorMessage("ai_not_configured")).toContain(
      "onboarding interview",
    );
    expect(getAiErrorMessage("ai_application_required")).toContain(
      "not linked to an application",
    );
    expect(getAiErrorMessage("conversation_not_found")).toContain(
      "no longer exists",
    );
  });

  it("includes retry-after seconds for rate limit errors", () => {
    const msg = getAiErrorMessage("ai_rate_limit_exceeded", 30);
    expect(msg).toContain("30 seconds");
  });

  it("falls back to the server-provided message when the code is unknown", () => {
    const msg = getAiErrorMessage(
      "something_unknown",
      undefined,
      "Database is offline, please retry.",
    );
    expect(msg).toBe("Database is offline, please retry.");
  });

  it("returns an actionable fallback that surfaces the error code when nothing else is available", () => {
    const msg = getAiErrorMessage("something_unknown");
    expect(msg).toContain("AI request failed");
    expect(msg).toContain("something_unknown");
    expect(msg).toContain("contact support");
  });
});
