import { describe, expect, it } from "vitest";
import { getAiErrorMessage } from "./aiErrorMessages";

describe("getAiErrorMessage", () => {
  it("returns correct message for each known error code", () => {
    expect(getAiErrorMessage("ai_timeout")).toContain("took too long");
    expect(getAiErrorMessage("ai_provider_busy")).toContain("temporarily busy");
    expect(getAiErrorMessage("ai_provider_unavailable")).toContain("unavailable");
    expect(getAiErrorMessage("ai_empty_response")).toContain("couldn't generate");
    expect(getAiErrorMessage("ai_content_filtered")).toContain("couldn't generate");
    expect(getAiErrorMessage("ai_monthly_cap_exceeded")).toContain("monthly");
    expect(getAiErrorMessage("ai_feature_not_available")).toContain("not available");
    expect(getAiErrorMessage("ai_rate_limit_exceeded")).toContain("Too many");
  });

  it("includes retry-after seconds for rate limit errors", () => {
    const msg = getAiErrorMessage("ai_rate_limit_exceeded", 30);
    expect(msg).toContain("30 seconds");
  });

  it("returns generic message for unknown error codes", () => {
    expect(getAiErrorMessage("something_unknown")).toContain("unexpected error");
  });
});
