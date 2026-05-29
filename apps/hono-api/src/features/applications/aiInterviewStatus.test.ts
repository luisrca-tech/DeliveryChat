import { describe, expect, it } from "vitest";
import { deriveAiInterviewStatus } from "./aiInterviewStatus.js";

describe("deriveAiInterviewStatus", () => {
  it("returns 'not_started' when no AI context exists for the application", () => {
    expect(deriveAiInterviewStatus(null)).toBe("not_started");
  });

  it("returns 'in_progress' when AI context exists with in_progress status", () => {
    expect(deriveAiInterviewStatus("in_progress")).toBe("in_progress");
  });

  it("returns 'completed' when AI context exists with completed status", () => {
    expect(deriveAiInterviewStatus("completed")).toBe("completed");
  });
});
