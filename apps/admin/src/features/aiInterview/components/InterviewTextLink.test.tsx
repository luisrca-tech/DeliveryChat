import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterviewTextLink } from "./InterviewTextLink";

describe("InterviewTextLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a button with the arrow by default", () => {
    render(<InterviewTextLink>Begin interview</InterviewTextLink>);
    const btn = screen.getByRole("button", { name: /Begin interview/ });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toContain("→");
  });

  it("invokes onClick when pressed", () => {
    const onClick = vi.fn();
    render(
      <InterviewTextLink onClick={onClick}>Begin interview</InterviewTextLink>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hides arrow and shows loading label when loading", () => {
    render(
      <InterviewTextLink loading loadingLabel="Starting…">
        Begin interview
      </InterviewTextLink>,
    );
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Starting…");
    expect(btn.textContent).not.toContain("→");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables button when disabled prop is set", () => {
    render(<InterviewTextLink disabled>Send</InterviewTextLink>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("omits arrow when showArrow is false", () => {
    render(<InterviewTextLink showArrow={false}>Send</InterviewTextLink>);
    expect(screen.getByRole("button").textContent).not.toContain("→");
  });
});
