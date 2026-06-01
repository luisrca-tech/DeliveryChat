import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InterviewRuler } from "./InterviewRuler";

describe("InterviewRuler", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the current turn numeral and total", () => {
    render(<InterviewRuler displayTurn={3} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/Turn 3 of 15/)).toBeTruthy();
  });

  it("maps tone to neutral in the opening window", () => {
    const { container } = render(<InterviewRuler displayTurn={4} />);
    expect(container.querySelector('[data-tone="neutral"]')).toBeTruthy();
  });

  it("maps tone to green in the suggested-finish window", () => {
    const { container } = render(<InterviewRuler displayTurn={9} />);
    expect(container.querySelector('[data-tone="green"]')).toBeTruthy();
  });

  it("maps tone to amber past the suggested window", () => {
    const { container } = render(<InterviewRuler displayTurn={14} />);
    expect(container.querySelector('[data-tone="amber"]')).toBeTruthy();
  });
});
