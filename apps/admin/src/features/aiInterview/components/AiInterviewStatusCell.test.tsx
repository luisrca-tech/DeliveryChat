import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiInterviewStatusCell } from "./AiInterviewStatusCell";

describe("AiInterviewStatusCell", () => {
  it("renders the 'Not configured' status pill", () => {
    render(<AiInterviewStatusCell status="not_started" />);

    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the 'In progress' status pill", () => {
    render(<AiInterviewStatusCell status="in_progress" />);

    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the 'Completed' status pill", () => {
    render(<AiInterviewStatusCell status="completed" />);

    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
