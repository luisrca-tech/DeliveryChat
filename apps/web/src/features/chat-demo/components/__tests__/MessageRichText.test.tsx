import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MessageThreadPanel } from "../ChatDemoComponents";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";
import type { EditorHandle } from "@repo/lexical-utils/react";

function renderMessages(messages: OptimisticMessage[]) {
  const noop = vi.fn();
  const editorHandleRef = { current: null as EditorHandle | null };
  return render(
    <MessageThreadPanel
      messages={messages}
      conversation={{
        id: "conv-1",
        status: "active",
        subject: null,
        assignedTo: "op-1",
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
    />,
  );
}

describe("MessageThreadPanel / rich text rendering", () => {
  it("renders contentHtml as HTML when contentFormat is lexical", () => {
    renderMessages([
      {
        id: "msg-1",
        conversationId: "conv-1",
        senderId: "op-1",
        content: '{"root":{}}',
        contentFormat: "lexical",
        contentHtml: "<p><strong>Bold text</strong></p>",
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    expect(screen.getByText("Bold text")).toBeDefined();
    const strong = screen.getByText("Bold text").closest("strong");
    expect(strong).not.toBeNull();
  });

  it("renders plain text content when contentFormat is absent", () => {
    renderMessages([
      {
        id: "msg-2",
        conversationId: "conv-1",
        senderId: "op-1",
        content: "Just plain text",
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    expect(screen.getByText("Just plain text")).toBeDefined();
  });

  it("renders plain text when contentFormat is plain", () => {
    renderMessages([
      {
        id: "msg-3",
        conversationId: "conv-1",
        senderId: "op-1",
        content: "Plain format text",
        contentFormat: "plain",
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    expect(screen.getByText("Plain format text")).toBeDefined();
  });

  it("applies rich-text-content--other class for operator messages", () => {
    const { container } = renderMessages([
      {
        id: "msg-4",
        conversationId: "conv-1",
        senderId: "op-1",
        content: '{"root":{}}',
        contentFormat: "lexical",
        contentHtml: "<p>Operator rich</p>",
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    const richDiv = container.querySelector(".rich-text-content--other");
    expect(richDiv).not.toBeNull();
  });

  it("applies rich-text-content--self class for visitor messages", () => {
    const { container } = renderMessages([
      {
        id: "msg-5",
        conversationId: "conv-1",
        senderId: "visitor-1",
        content: '{"root":{}}',
        contentFormat: "lexical",
        contentHtml: "<p>Visitor rich</p>",
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    const richDiv = container.querySelector(".rich-text-content--self");
    expect(richDiv).not.toBeNull();
  });

  it("falls back to plain text when contentFormat is lexical but contentHtml is null", () => {
    renderMessages([
      {
        id: "msg-6",
        conversationId: "conv-1",
        senderId: "op-1",
        content: "Fallback plain text",
        contentFormat: "lexical",
        contentHtml: null,
        createdAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        type: "text",
      },
    ]);

    expect(screen.getByText("Fallback plain text")).toBeDefined();
  });
});
