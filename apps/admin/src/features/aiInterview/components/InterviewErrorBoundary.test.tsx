import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterviewErrorBoundary } from "./InterviewErrorBoundary";
import type { InterviewErrorSurface } from "../lib/interviewErrorMapper";

describe("InterviewErrorBoundary", () => {
  afterEach(() => cleanup());

  it("renders nothing when surface is null", () => {
    const { container } = render(<InterviewErrorBoundary surface={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for toast_fallback (handled by caller)", () => {
    const surface: InterviewErrorSurface = {
      kind: "toast_fallback",
      code: "unknown_error",
      message: "Boom",
    };
    const { container } = render(<InterviewErrorBoundary surface={surface} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders retry_row with retry button wired to onRetrySend", () => {
    const onRetrySend = vi.fn();
    const surface: InterviewErrorSurface = {
      kind: "retry_row",
      code: "ai_timeout",
      title: "The AI took too long to respond.",
      detail: "This usually clears up in a few seconds.",
      retryLabel: "Try again",
    };

    render(
      <InterviewErrorBoundary
        surface={surface}
        onRetrySend={onRetrySend}
        isSending={false}
      />,
    );

    const row = screen.getByTestId("interview-retry-row");
    expect(row.getAttribute("data-code")).toBe("ai_timeout");
    expect(row.textContent).toContain("The AI took too long to respond.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetrySend).toHaveBeenCalledTimes(1);
  });

  it("disables retry_row button while sending", () => {
    const surface: InterviewErrorSurface = {
      kind: "retry_row",
      code: "ai_provider_busy",
      title: "Busy",
      detail: "Wait",
      retryLabel: "Try again",
    };

    render(
      <InterviewErrorBoundary
        surface={surface}
        onRetrySend={vi.fn()}
        isSending={true}
      />,
    );

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("renders system_bubble with code attribute", () => {
    const surface: InterviewErrorSurface = {
      kind: "system_bubble",
      code: "ai_empty_response",
      message: "The AI returned an empty response.",
    };

    render(<InterviewErrorBoundary surface={surface} />);

    const bubble = screen.getByTestId("interview-system-bubble");
    expect(bubble.getAttribute("data-code")).toBe("ai_empty_response");
    expect(bubble.textContent).toContain("The AI returned an empty response.");
  });

  it("renders blocking_banner with title and detail", () => {
    const surface: InterviewErrorSurface = {
      kind: "blocking_banner",
      code: "ai_monthly_cap_exceeded",
      title: "Monthly AI usage limit reached.",
      detail: "You have used your AI allowance for this billing period.",
    };

    render(<InterviewErrorBoundary surface={surface} />);

    const banner = screen.getByTestId("interview-cap-banner");
    expect(banner.textContent).toContain("Monthly AI usage limit reached.");
    expect(banner.textContent).toContain(
      "You have used your AI allowance for this billing period.",
    );
  });

  it("renders missing_topics list when labels are present", () => {
    const surface: InterviewErrorSurface = {
      kind: "missing_topics",
      code: "interview_checklist_incomplete",
      title: "A few topics still need answers before finishing.",
      detail: "Please cover the remaining topics, then try again.",
      missingLabels: ["Target audience", "Prohibited topics"],
    };

    render(<InterviewErrorBoundary surface={surface} />);

    const block = screen.getByTestId("interview-missing-topics");
    expect(block.textContent).toContain(
      "A few topics still need answers before finishing.",
    );
    expect(screen.getByText("Target audience")).toBeTruthy();
    expect(screen.getByText("Prohibited topics")).toBeTruthy();
  });

  it("renders missing_topics detail fallback when no labels", () => {
    const surface: InterviewErrorSurface = {
      kind: "missing_topics",
      code: "interview_checklist_incomplete",
      title: "A few topics still need answers before finishing.",
      detail: "Please cover the remaining topics, then try again.",
      missingLabels: [],
    };

    render(<InterviewErrorBoundary surface={surface} />);

    expect(
      screen.getByText("Please cover the remaining topics, then try again."),
    ).toBeTruthy();
  });

  it("renders full_page_error with retry button wired to onRetrySummary", () => {
    const onRetrySummary = vi.fn();
    const surface: InterviewErrorSurface = {
      kind: "full_page_error",
      code: "summary_generation_failed",
      title: "We could not generate the AI context.",
      detail: "Your interview was saved, but the summary step failed.",
      retryLabel: "Retry generation",
    };

    render(
      <InterviewErrorBoundary
        surface={surface}
        onRetrySummary={onRetrySummary}
      />,
    );

    const block = screen.getByTestId("interview-summary-error");
    expect(block.textContent).toContain("We could not generate the AI context.");

    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));
    expect(onRetrySummary).toHaveBeenCalledTimes(1);
  });

  it("omits full_page_error retry button when onRetrySummary is not provided", () => {
    const surface: InterviewErrorSurface = {
      kind: "full_page_error",
      code: "summary_generation_failed",
      title: "Failed",
      detail: "Detail",
      retryLabel: "Retry generation",
    };

    render(<InterviewErrorBoundary surface={surface} />);

    expect(
      screen.queryByRole("button", { name: "Retry generation" }),
    ).toBeNull();
  });
});
