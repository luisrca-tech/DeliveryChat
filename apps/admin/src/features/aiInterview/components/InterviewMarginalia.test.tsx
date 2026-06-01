import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InterviewMarginalia } from "./InterviewMarginalia";

describe("InterviewMarginalia", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the body content as a status by default", () => {
    render(<InterviewMarginalia>Could not send.</InterviewMarginalia>);
    const node = screen.getByRole("status");
    expect(node.textContent).toContain("Could not send.");
  });

  it("renders the action slot when provided", () => {
    render(
      <InterviewMarginalia action={<button type="button">Retry →</button>}>
        Something went wrong.
      </InterviewMarginalia>,
    );
    expect(screen.getByRole("button", { name: /Retry/ })).toBeTruthy();
  });

  it("supports alert role for error surfaces", () => {
    render(
      <InterviewMarginalia role="alert" tone="accent" dashed>
        We couldn't send your last answer.
      </InterviewMarginalia>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("exposes the tone via data attribute for styling tests", () => {
    render(
      <InterviewMarginalia tone="amber" testId="marg-amber">
        Heads up.
      </InterviewMarginalia>,
    );
    const node = screen.getByTestId("marg-amber");
    expect(node.getAttribute("data-tone")).toBe("amber");
  });
});
