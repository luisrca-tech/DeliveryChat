import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiInterviewStatusCell } from "./AiInterviewStatusCell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
  }: {
    to: string;
    children: React.ReactNode;
  }) => <a href={to}>{children}</a>,
}));

const APP_ID = "app-1";

describe("AiInterviewStatusCell", () => {
  it("renders the 'Not configured' state with a Configure AI link to the interview page", () => {
    render(<AiInterviewStatusCell applicationId={APP_ID} status="not_started" />);

    expect(screen.getByText("Not configured")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Configure AI/i });
    expect(link.getAttribute("href")).toBe(`/applications/${APP_ID}/ai-interview`);
  });

  it("renders the 'In progress' state with a Continue interview link to the interview page", () => {
    render(<AiInterviewStatusCell applicationId={APP_ID} status="in_progress" />);

    expect(screen.getByText("In progress")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Continue interview/i });
    expect(link.getAttribute("href")).toBe(`/applications/${APP_ID}/ai-interview`);
  });

  it("renders the 'Completed' state with a View AI context link to the context page", () => {
    render(<AiInterviewStatusCell applicationId={APP_ID} status="completed" />);

    expect(screen.getByText("Completed")).toBeTruthy();
    const link = screen.getByRole("link", { name: /View AI context/i });
    expect(link.getAttribute("href")).toBe(`/applications/${APP_ID}/ai-context`);
  });
});
