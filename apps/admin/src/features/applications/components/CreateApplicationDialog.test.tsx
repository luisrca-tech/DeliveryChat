import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CreateApplicationDialog } from "./CreateApplicationDialog";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("CreateApplicationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders production fields by default", () => {
    render(
      <CreateApplicationDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/^Name$/i)).toBeDefined();
    expect(screen.getByLabelText(/Domain or URL/i)).toBeDefined();
    expect(screen.queryByLabelText(/^Port$/i)).toBeNull();
  });

  it("swaps to port field when test toggle is selected", () => {
    render(
      <CreateApplicationDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Test/i }));

    expect(screen.getByLabelText(/^Port$/i)).toBeDefined();
    expect(screen.queryByLabelText(/Domain or URL/i)).toBeNull();
  });

  it("shows localhost:<port> preview when port is typed", () => {
    render(
      <CreateApplicationDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Test/i }));
    fireEvent.change(screen.getByLabelText(/^Port$/i), {
      target: { value: "3000" },
    });

    expect(screen.getByText("localhost:3000")).toBeDefined();
  });

  it("submits a test payload with kind, name, and port", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateApplicationDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Test/i }));
    fireEvent.change(screen.getByLabelText(/^Name$/i), {
      target: { value: "Local Dev" },
    });
    fireEvent.change(screen.getByLabelText(/^Port$/i), {
      target: { value: "3000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "test",
        name: "Local Dev",
        port: 3000,
      }),
    );
  });
});
