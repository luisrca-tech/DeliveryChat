import { describe, expect, it, vi, afterEach, beforeAll } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

describe("CreateApiKeyDialog environment locking", () => {
  afterEach(() => {
    cleanup();
  });

  it("locks environment to 'live' and submits 'live' for production apps", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateApiKeyDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        appKind="production"
      />,
    );

    const select = screen.getByLabelText(/Environment/i) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.getByText(/Production applications only mint live keys/i),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Create key/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "live" }),
    );
  });

  it("locks environment to 'test' and submits 'test' for test apps", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateApiKeyDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        appKind="test"
      />,
    );

    const select = screen.getByLabelText(/Environment/i) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.getByText(/Test applications only mint test keys/i),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Create key/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "test" }),
    );
  });
});
