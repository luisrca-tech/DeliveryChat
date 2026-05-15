import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversationList } from "../useConversationList";
import type { ChatClient, Conversation } from "../../chat-client";

function makeConversation(id = "conv-1"): Conversation {
  return {
    id,
    status: "pending",
    subject: null,
    assignedTo: null,
    participants: [
      {
        userId: "visitor-1",
        role: "visitor",
        joinedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeClient(overrides: Partial<ChatClient> = {}): ChatClient {
  return {
    listConversations: vi.fn().mockResolvedValue({
      conversations: [],
      visitorUserId: "visitor-1",
      total: 0,
      limit: 20,
      offset: 0,
    }),
    createConversation: vi.fn().mockResolvedValue({
      conversation: makeConversation(),
    }),
    ...overrides,
  } as unknown as ChatClient;
}

describe("useConversationList", () => {
  let captureVisitorId: (id: string) => void;

  beforeEach(() => {
    captureVisitorId = vi.fn() as unknown as (id: string) => void;
  });

  it("starts loading with empty conversations and no selection", () => {
    const client = makeClient({
      listConversations: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );
    expect(result.current.loadingConvs).toBe(true);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.newForm).toEqual({
      visible: false,
      subject: "",
      creating: false,
    });
  });

  it("populates conversations and calls captureVisitorId on successful fetch", async () => {
    const conv = makeConversation();
    const client = makeClient({
      listConversations: vi.fn().mockResolvedValue({
        conversations: [conv],
        visitorUserId: "visitor-1",
        total: 1,
        limit: 20,
        offset: 0,
      }),
    });

    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    await waitFor(() => expect(result.current.loadingConvs).toBe(false));

    expect(result.current.conversations).toEqual([conv]);
    expect(captureVisitorId).toHaveBeenCalledWith("visitor-1");
  });

  it("sets loadingConvs false even when fetch fails", async () => {
    const client = makeClient({
      listConversations: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    await waitFor(() => expect(result.current.loadingConvs).toBe(false));
    expect(result.current.conversations).toEqual([]);
  });

  it("shows and hides the new conversation form", () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    expect(result.current.newForm.visible).toBe(false);

    act(() => result.current.showNewForm());
    expect(result.current.newForm.visible).toBe(true);

    act(() => result.current.hideNewForm());
    expect(result.current.newForm.visible).toBe(false);
  });

  it("hideNewForm resets subject and creating to defaults", () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    act(() => {
      result.current.showNewForm();
      result.current.setNewSubject("something");
    });

    act(() => result.current.hideNewForm());

    expect(result.current.newForm).toEqual({
      visible: false,
      subject: "",
      creating: false,
    });
  });

  it("updates the new conversation subject", () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    act(() => result.current.setNewSubject("Help with order"));

    expect(result.current.newForm.subject).toBe("Help with order");
  });

  it("creates a conversation, prepends to list, sets selectedId, and resets form", async () => {
    const conv = makeConversation("new-conv");
    const client = makeClient({
      createConversation: vi.fn().mockResolvedValue({ conversation: conv }),
    });
    const capture = vi.fn();

    const { result } = renderHook(() =>
      useConversationList({
        client,
        captureVisitorId: capture as unknown as (id: string) => void,
      }),
    );

    act(() => {
      result.current.showNewForm();
      result.current.setNewSubject("My issue");
    });

    await act(async () => {
      await result.current.handleCreateConversation({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.conversations[0]).toBe(conv);
    expect(result.current.selectedId).toBe("new-conv");
    expect(result.current.newForm).toEqual({
      visible: false,
      subject: "",
      creating: false,
    });
    expect(capture).toHaveBeenCalledWith("visitor-1");
  });

  it("resets creating flag when conversation creation fails", async () => {
    const client = makeClient({
      createConversation: vi.fn().mockRejectedValue(new Error("server error")),
    });

    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    await act(async () => {
      await result.current.handleCreateConversation({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.newForm.creating).toBe(false);
  });

  it("exposes setConversations and setSelectedId for external wiring", () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useConversationList({ client, captureVisitorId }),
    );

    act(() => {
      result.current.setSelectedId("some-id");
    });

    expect(result.current.selectedId).toBe("some-id");
  });
});
