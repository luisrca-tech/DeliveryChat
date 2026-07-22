import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MessageThreadPanel } from "../ChatDemoComponents";
import type { EditorHandle } from "@repo/lexical-utils/react";

type HandoffProps = {
  handoffHidden?: boolean;
  handoffDisabled?: boolean;
  handoffError?: string | null;
  onRequestHuman?: () => void;
};

function renderPanel(handoff: HandoffProps = {}) {
  const noop = vi.fn();
  const editorHandleRef = { current: null as EditorHandle | null };
  return render(
    <MessageThreadPanel
      messages={[]}
      conversation={{
        id: "conv-1",
        status: "active",
        subject: null,
        assignedTo: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      }}
      wsStatus="connected"
      loadingMsgs={false}
      visitorUserId="visitor-1"
      operatorTypingName={null}
      sendError={null}
      sending={false}
      editingState={null}
      messagesEndRef={createRef()}
      editorHandleRef={editorHandleRef}
      handleSend={noop}
      onTypingStart={noop}
      onTypingStop={noop}
      handleStartEdit={noop}
      handleCancelEdit={noop}
      setEditingContent={noop}
      handleSaveEdit={noop}
      onRequestDelete={noop}
      handleEditKeyDown={noop}
      handoffHidden={handoff.handoffHidden ?? false}
      handoffDisabled={handoff.handoffDisabled ?? false}
      handoffError={handoff.handoffError ?? null}
      onRequestHuman={handoff.onRequestHuman ?? noop}
    />,
  );
}

const buttonName = /talk to a human/i;

// This project does not enable testing-library's automatic cleanup, so each
// render must be torn down explicitly or the queries match across tests.
afterEach(cleanup);

describe("MessageThreadPanel / 'Talk to a human' button", () => {
  it("renders the button when the handoff is offered", () => {
    renderPanel();
    const btn = screen.getByRole("button", {
      name: buttonName,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders nothing when the handoff is hidden (AI off for the app)", () => {
    renderPanel({ handoffHidden: true });
    expect(screen.queryByRole("button", { name: buttonName })).toBeNull();
  });

  it("disables the button once a human is already involved", () => {
    renderPanel({ handoffDisabled: true });
    const btn = screen.getByRole("button", {
      name: buttonName,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("calls onRequestHuman when clicked", async () => {
    const onRequestHuman = vi.fn();
    renderPanel({ onRequestHuman });
    await userEvent.click(screen.getByRole("button", { name: buttonName }));
    expect(onRequestHuman).toHaveBeenCalledTimes(1);
  });

  it("does not call onRequestHuman while disabled", async () => {
    const onRequestHuman = vi.fn();
    renderPanel({ handoffDisabled: true, onRequestHuman });
    await userEvent.click(screen.getByRole("button", { name: buttonName }));
    expect(onRequestHuman).not.toHaveBeenCalled();
  });

  it("surfaces an escalation failure to the visitor", () => {
    renderPanel({ handoffError: "Could not reach a human right now." });
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not reach a human right now.",
    );
  });
});
