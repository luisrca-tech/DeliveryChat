import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockMutate = vi.fn();

vi.mock("./useConversationMutations", () => ({
  useUpdateSubjectMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useSubjectEditor } from "./useSubjectEditor";
import type { ConversationWithParticipants } from "../types/chat.types";

function makeConversation(
  overrides: Partial<ConversationWithParticipants> = {},
): ConversationWithParticipants {
  return {
    id: "conv-1",
    organizationId: "org-1",
    applicationId: null,
    status: "active",
    createdBy: null,
    assignedTo: "user-1",
    subject: "Original subject",
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    participants: [],
    ...overrides,
  };
}

describe("useSubjectEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in non-editing state", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation()),
    );
    expect(result.current.isEditing).toBe(false);
    expect(result.current.draft).toBe("");
    expect(result.current.isPending).toBe(false);
  });

  it("enters editing mode with current subject as draft", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation({ subject: "My subject" })),
    );

    act(() => result.current.startEditing());

    expect(result.current.isEditing).toBe(true);
    expect(result.current.draft).toBe("My subject");
  });

  it("enters editing mode with empty string when subject is null", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation({ subject: null })),
    );

    act(() => result.current.startEditing());

    expect(result.current.isEditing).toBe(true);
    expect(result.current.draft).toBe("");
  });

  it("cancels editing and resets draft", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation()),
    );

    act(() => result.current.startEditing());
    act(() => result.current.setDraft("changed"));
    act(() => result.current.cancelEditing());

    expect(result.current.isEditing).toBe(false);
    expect(result.current.draft).toBe("");
  });

  it("saves subject by calling mutation with trimmed value", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation({ id: "conv-1" })),
    );

    act(() => result.current.startEditing());
    act(() => result.current.setDraft("  New subject  "));
    act(() => result.current.saveSubject());

    expect(mockMutate).toHaveBeenCalledWith(
      { id: "conv-1", subject: "New subject" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("does not save when draft is empty or whitespace-only", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation()),
    );

    act(() => result.current.startEditing());
    act(() => result.current.setDraft("   "));
    act(() => result.current.saveSubject());

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("exits editing mode on successful save", () => {
    mockMutate.mockImplementation((_data: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });

    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation()),
    );

    act(() => result.current.startEditing());
    act(() => result.current.setDraft("Updated"));
    act(() => result.current.saveSubject());

    expect(result.current.isEditing).toBe(false);
  });

  it("provides an inputRef", () => {
    const { result } = renderHook(() =>
      useSubjectEditor(makeConversation()),
    );
    expect(result.current.inputRef).toBeDefined();
    expect(result.current.inputRef.current).toBeNull();
  });
});
