import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHeader } from "./ChatHeader";
import type { ConversationWithParticipants } from "../types/chat.types";
import type { ConversationPermissions } from "../lib/conversationPermissions";

const mockExecuteLeave = vi.fn().mockResolvedValue(true);
const mockExecuteResolve = vi.fn().mockResolvedValue(true);
const mockStartEditing = vi.fn();
const mockCancelEditing = vi.fn();
const mockSaveSubject = vi.fn();
const mockSetDraft = vi.fn();

vi.mock("../hooks/useConversationAction", () => ({
  useConversationAction: (type: string) => {
    if (type === "leave") return { execute: mockExecuteLeave, isPending: false };
    if (type === "resolve") return { execute: mockExecuteResolve, isPending: false };
    return { execute: vi.fn(), isPending: false };
  },
}));

vi.mock("../hooks/useSubjectEditor", () => ({
  useSubjectEditor: () => ({
    isEditing: false,
    draft: "",
    setDraft: mockSetDraft,
    startEditing: mockStartEditing,
    cancelEditing: mockCancelEditing,
    saveSubject: mockSaveSubject,
    inputRef: { current: null },
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const CURRENT_USER_ID = "user-1";

function makeConversation(
  overrides: Partial<ConversationWithParticipants> = {},
): ConversationWithParticipants {
  return {
    id: "conv-1",
    organizationId: "org-1",
    applicationId: null,
    status: "active",
    createdBy: null,
    assignedTo: CURRENT_USER_ID,
    subject: "Test subject",
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    participants: [],
    ...overrides,
  };
}

function makePermissions(
  overrides: Partial<ConversationPermissions> = {},
): ConversationPermissions {
  return {
    isAdmin: false,
    isAssigned: true,
    canViewAll: false,
    canDelete: false,
    canAccept: false,
    canLeave: true,
    canResolve: true,
    canEditSubject: true,
    canSend: true,
    ...overrides,
  };
}

function getDropdownTrigger() {
  const buttons = screen.getAllByRole("button");
  const trigger = buttons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
  if (!trigger) throw new Error("Dropdown trigger not found");
  return trigger;
}

async function openDropdownAndClickResolve(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getDropdownTrigger());
  const menu = await screen.findByRole("menu");
  const resolveItem = within(menu).getByText("Mark as Solved");
  await user.click(resolveItem);
}

describe("ChatHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens resolve dialog when conversation has a subject", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ChatHeader
        conversation={makeConversation({ subject: "Bug report" })}
        permissions={makePermissions()}
        currentUserRole="operator"
      />,
    );

    await openDropdownAndClickResolve(user);

    expect(
      screen.getByText("Are you sure you want to mark this conversation as solved?"),
    ).toBeTruthy();
  });

  it("opens resolve dialog when conversation has no subject", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ChatHeader
        conversation={makeConversation({ subject: null })}
        permissions={makePermissions()}
        currentUserRole="operator"
      />,
    );

    await openDropdownAndClickResolve(user);

    expect(
      screen.getAllByText("Are you sure you want to mark this conversation as solved?").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not show a warning toast when resolving without subject", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ChatHeader
        conversation={makeConversation({ subject: null })}
        permissions={makePermissions()}
        currentUserRole="operator"
      />,
    );

    await openDropdownAndClickResolve(user);

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("displays subject text when present", () => {
    render(
      <ChatHeader
        conversation={makeConversation({ subject: "My subject" })}
        permissions={makePermissions()}
        currentUserRole="operator"
      />,
    );

    expect(screen.getByText("My subject")).toBeTruthy();
  });

  it("shows pencil button when canEditSubject is true", () => {
    const { container } = render(
      <ChatHeader
        conversation={makeConversation({ subject: "Editable subject" })}
        permissions={makePermissions()}
        currentUserRole="operator"
      />,
    );

    expect(screen.getByText("Editable subject")).toBeTruthy();
    const pencilButton = container.querySelector(".group button") as HTMLElement;
    expect(pencilButton).toBeTruthy();
  });

  it("hides management dropdown when canLeave is false", () => {
    const { container } = render(
      <ChatHeader
        conversation={makeConversation()}
        permissions={makePermissions({ canLeave: false })}
        currentUserRole="operator"
      />,
    );

    const trigger = container.querySelector("[aria-haspopup='menu']");
    expect(trigger).toBeNull();
  });

  it("hides edit subject button when canEditSubject is false", () => {
    const { container } = render(
      <ChatHeader
        conversation={makeConversation({ subject: "Test" })}
        permissions={makePermissions({ canEditSubject: false })}
        currentUserRole="operator"
      />,
    );

    const pencilButton = container.querySelector(".group button");
    expect(pencilButton).toBeNull();
  });
});
