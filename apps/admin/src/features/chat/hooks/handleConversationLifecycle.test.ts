import { describe, it, expect, vi } from "vitest";
import { handleConversationLifecycle } from "./handleConversationLifecycle";

describe("handleConversationLifecycle", () => {
  it("calls invalidateQueries for conversation:new", () => {
    const invalidateQueries = vi.fn();
    handleConversationLifecycle("conversation:new", { invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:accepted", () => {
    const invalidateQueries = vi.fn();
    handleConversationLifecycle("conversation:accepted", { invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:released", () => {
    const invalidateQueries = vi.fn();
    handleConversationLifecycle("conversation:released", { invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:resolved", () => {
    const invalidateQueries = vi.fn();
    handleConversationLifecycle("conversation:resolved", { invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("does not call invalidateQueries for unrelated event types", () => {
    const invalidateQueries = vi.fn();
    handleConversationLifecycle("message:new" as never, { invalidateQueries });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
