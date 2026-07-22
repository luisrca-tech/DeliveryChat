import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { MessageThreadPanel } from "../ChatDemoComponents";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";
import type { EditorHandle } from "@repo/lexical-utils/react";

function message(over: Partial<OptimisticMessage> = {}): OptimisticMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "operator-1",
    content: "Premium costs R$ 240.",
    editedAt: null,
    createdAt: "2026-07-21T00:00:00.000Z",
    type: "text",
    ...over,
  };
}

function renderPanel(
  messages: OptimisticMessage[],
  aiAssistantLabel?: string,
) {
  const noop = vi.fn();
  const editorHandleRef = { current: null as EditorHandle | null };
  return render(
    <MessageThreadPanel
      messages={messages}
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
      handoffHidden={true}
      handoffDisabled={false}
      handoffError={null}
      onRequestHuman={noop}
      aiAssistantLabel={aiAssistantLabel}
    />,
  );
}

afterEach(cleanup);

describe("MessageThreadPanel / AI message bubble", () => {
  it("labels an AI message so it is visually distinct from a human one", () => {
    renderPanel([message({ authorType: "ai" })]);
    expect(screen.getByText("AI Assistant")).toBeTruthy();
    expect(screen.getByTestId("ai-avatar")).toBeTruthy();
  });

  it("outlines the AI bubble with the primary colour, like the widget", () => {
    renderPanel([message({ authorType: "ai" })]);
    const bubble = screen.getByText("Premium costs R$ 240.").closest("div");
    expect(bubble?.className).toContain("border-primary");
  });

  it("honours a custom assistant label", () => {
    renderPanel([message({ authorType: "ai" })], "Acme Bot");
    expect(screen.getByText("Acme Bot")).toBeTruthy();
    expect(screen.queryByText("AI Assistant")).toBeNull();
  });

  it("does not decorate an operator message", () => {
    renderPanel([message({ authorType: "operator" })]);
    expect(screen.queryByText("AI Assistant")).toBeNull();
    expect(screen.queryByTestId("ai-avatar")).toBeNull();
  });

  it("does not decorate a message with no authorType", () => {
    // Older payloads omit the field — they must render as plain messages.
    renderPanel([message()]);
    expect(screen.queryByTestId("ai-avatar")).toBeNull();
  });

  it("does not decorate the visitor's own message", () => {
    renderPanel([message({ senderId: "visitor-1", authorType: "visitor" })]);
    expect(screen.queryByTestId("ai-avatar")).toBeNull();
  });
});
