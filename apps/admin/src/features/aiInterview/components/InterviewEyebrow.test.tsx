import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InterviewEyebrow } from "./InterviewEyebrow";

describe("InterviewEyebrow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders default variant with neutral tone marker", () => {
    render(<InterviewEyebrow>AI CONTEXT · NEW INTERVIEW</InterviewEyebrow>);
    const el = screen.getByText("AI CONTEXT · NEW INTERVIEW");
    expect(el.getAttribute("data-variant")).toBe("default");
  });

  it.each([
    ["final" as const],
    ["refocus" as const],
    ["staying" as const],
    ["progress" as const],
  ])("renders %s variant", (variant) => {
    render(<InterviewEyebrow variant={variant}>EYEBROW</InterviewEyebrow>);
    expect(screen.getByText("EYEBROW").getAttribute("data-variant")).toBe(
      variant,
    );
  });
});
