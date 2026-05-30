import { describe, expect, it } from "vitest";
import { deriveBackfilledSummaryStatus } from "../ai.interview.schema.js";

describe("deriveBackfilledSummaryStatus", () => {
  it("completed + non-null contextSummary → ready", () => {
    expect(
      deriveBackfilledSummaryStatus({
        status: "completed",
        contextSummary: "# Summary",
      }),
    ).toBe("ready");
  });

  it("completed + null contextSummary → pending", () => {
    expect(
      deriveBackfilledSummaryStatus({
        status: "completed",
        contextSummary: null,
      }),
    ).toBe("pending");
  });

  it("in_progress → none regardless of contextSummary", () => {
    expect(
      deriveBackfilledSummaryStatus({
        status: "in_progress",
        contextSummary: null,
      }),
    ).toBe("none");
    expect(
      deriveBackfilledSummaryStatus({
        status: "in_progress",
        contextSummary: "stale",
      }),
    ).toBe("none");
  });
});
