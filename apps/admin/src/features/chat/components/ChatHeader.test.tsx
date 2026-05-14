import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHeader } from "./ChatHeader";
import type { ConversationWithParticipants } from "../types/chat.types";

const mockExecuteResolve = vi.fn().mockResolvedValue(true);
const mockExecuteLeave = vi.fn().mockResolvedValue(true);
const mockMutate = vi.fn();

vi.mock("../hooks/useConversationActions", () => ({
  useLeaveAction: () => ({ execute: mockExecuteLeave, isPending: false }),
  useResolveAction: () => ({ execute: mockExecuteResolve, isPending: false }),
}));

vi.mock("../hooks/useConversationMutations", () => ({
  useUpdateSubjectMutation: () => ({ mutate: mockMutate, isPending: false }),
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

describe("ChatHeader — resolve without subject requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens resolve dialog when conversation has a subject", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ChatHeader
        conversation={makeConversation({ subject: "Bug report" })}
        currentUserId={CURRENT_USER_ID}
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
        currentUserId={CURRENT_USER_ID}
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
        currentUserId={CURRENT_USER_ID}
      />,
    );

    await openDropdownAndClickResolve(user);

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("displays subject text when present", () => {
    render(
      <ChatHeader
        conversation={makeConversation({ subject: "My subject" })}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    expect(screen.getByText("My subject")).toBeTruthy();
  });

  it("subject field remains editable via pencil button", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = render(
      <ChatHeader
        conversation={makeConversation({ subject: "Editable subject" })}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    expect(screen.getByText("Editable subject")).toBeTruthy();
    const pencilButton = container.querySelector(".group button") as HTMLElement;
    expect(pencilButton).toBeTruthy();
    await user.click(pencilButton);
    expect(screen.getByDisplayValue("Editable subject")).toBeTruthy();
  });
});
